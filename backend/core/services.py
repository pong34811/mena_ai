"""
LLM Service - connects to Free LLM API server with auto model selection.

Performance design (benchmarked 2026-09-03, Free LLM API @ 127.0.0.1:31415):
- `auto` is the default model (API routes to best available).
- Module-level shared session / rate limiter / caches: Django creates a new
  service per request, so per-instance state never hits. Shared state fixes that.
"""

import logging
import time
import threading
from typing import Optional
from collections import deque

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from django.conf import settings

logger = logging.getLogger(__name__)

# Benchmarked fastest-first (2026-09-03). `auto` routes to groq/compound (~24s).
PREFERRED_MODELS = [
    "compound-mini",          # ~0.9s  (benchmarked fastest working)
    "gemini-2.5-flash-lite",  # ~1.4s  (benchmarked runner-up)
    "auto",                   # slow (~24s) but most capable - fallback only
    "deepseek-chat",
    "gpt-3.5-turbo",
]
DEFAULT_MODEL = "auto"

# ---- Module-level shared state (survives per-request service instances) ----
_state_lock = threading.Lock()
_shared_session: Optional[requests.Session] = None
_shared_limiter: Optional["RateLimiter"] = None
_response_cache: dict = {}
_response_cache_ts: dict = {}
_models_cache: Optional[list[dict]] = None
_models_fetched_at: float = 0
_working_model: Optional[str] = None

RESPONSE_CACHE_TTL = 30.0
RESPONSE_CACHE_MAX = 200
MODELS_CACHE_TTL = 3600.0

# Timeouts: (connect, read). Fail fast instead of blocking a worker 120s.
CONNECT_TIMEOUT = 10
READ_TIMEOUT = 60


class RateLimiter:
    """Simple sliding window rate limiter."""

    def __init__(self, max_requests: int = 115, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = deque()
        self.lock = threading.Lock()

    def acquire(self, timeout: float = 30.0) -> bool:
        """
        Acquire a rate limit slot. Blocks until available or timeout.

        Returns:
            True if acquired, False if timed out.
        """
        start = time.time()
        while time.time() - start < timeout:
            with self.lock:
                now = time.time()
                # Remove old requests outside the window
                while self.requests and self.requests[0] < now - self.window_seconds:
                    self.requests.popleft()

                if len(self.requests) < self.max_requests:
                    self.requests.append(now)
                    return True

            # Wait a bit before retrying
            time.sleep(0.1)

        return False

    def get_wait_time(self) -> float:
        """Get estimated wait time until next slot is available."""
        with self.lock:
            if len(self.requests) < self.max_requests:
                return 0.0
            oldest = self.requests[0]
            wait = oldest + self.window_seconds - time.time()
            return max(0.0, wait)


def _get_session() -> requests.Session:
    """Process-wide pooled session (connection keep-alive across requests)."""
    global _shared_session
    if _shared_session is None:
        with _state_lock:
            if _shared_session is None:
                s = requests.Session()
                retry_strategy = Retry(
                    total=1,
                    backoff_factor=1,
                    status_forcelist=[500, 502, 503, 504],
                    allowed_methods=["POST", "GET"],
                )
                adapter = HTTPAdapter(
                    max_retries=retry_strategy,
                    pool_connections=10,
                    pool_maxsize=10,
                )
                s.mount("http://", adapter)
                s.mount("https://", adapter)
                _shared_session = s
    return _shared_session


def _get_limiter() -> RateLimiter:
    """Process-wide rate limiter (115 req / 60s, just under the ~120 limit)."""
    global _shared_limiter
    if _shared_limiter is None:
        with _state_lock:
            if _shared_limiter is None:
                _shared_limiter = RateLimiter(max_requests=115, window_seconds=60)
    return _shared_limiter


def _load_provider_config() -> dict:
    """
    Load config from the active LLMProvider DB row, fallback to settings.

    Returns dict with api_url, api_key, model_name, temperature, max_tokens.
    """
    cfg = {
        "api_url": settings.FREE_LLM_API_URL,
        "api_key": settings.FREE_LLM_API_KEY,
        "model_name": getattr(settings, "FREE_LLM_MODEL", DEFAULT_MODEL),
        "temperature": 0.7,
        "max_tokens": 2048,
    }
    try:
        from .models import LLMProvider

        provider = LLMProvider.objects.filter(is_active=True).order_by("-updated_at").first()
        if provider:
            cfg["api_url"] = provider.api_url or cfg["api_url"]
            cfg["api_key"] = provider.api_key or cfg["api_key"]
            cfg["model_name"] = provider.model_name or cfg["model_name"]
            cfg["temperature"] = provider.temperature
            cfg["max_tokens"] = provider.max_tokens
    except Exception as e:  # DB not ready / model missing - use settings
        logger.debug(f"DB provider lookup failed, using settings: {e}")
    if not cfg["model_name"]:
        cfg["model_name"] = DEFAULT_MODEL
    return cfg


class LLMService:
    """Service for interacting with Free LLM API (OpenAI-compatible)."""

    PREFERRED_MODELS = PREFERRED_MODELS

    def __init__(
        self,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ):
        cfg = _load_provider_config()
        self.api_url = api_url or cfg["api_url"]
        # Explicit '' api_key means "no key" - fall back to configured one
        self.api_key = api_key if api_key else cfg["api_key"]
        self.model = model or cfg["model_name"] or DEFAULT_MODEL
        self.temperature = temperature if temperature is not None else cfg["temperature"]
        self.max_tokens = max_tokens if max_tokens is not None else cfg["max_tokens"]

        # Shared process-wide state (per-instance copies would never hit)
        self._rate_limiter = _get_limiter()
        self._session = _get_session()

    def _get_headers(self) -> dict:
        """Get request headers."""
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['X-API-Key'] = self.api_key
        return headers

    @staticmethod
    def _get_cache_key(messages: list[dict], model: str, temperature: float, max_tokens: int) -> str:
        """Generate cache key for request (stable across processes)."""
        parts = "|".join(f"{m.get('role', '')}:{m.get('content', '')}" for m in messages)
        return f"{hash((parts, model, temperature, max_tokens))}"

    def _get_cached_response(self, cache_key: str) -> Optional[str]:
        """Get cached response if still valid (process-wide)."""
        ts = _response_cache_ts.get(cache_key, 0)
        if cache_key in _response_cache and time.time() - ts < RESPONSE_CACHE_TTL:
            logger.debug("Response cache hit")
            return _response_cache[cache_key]
        _response_cache.pop(cache_key, None)
        _response_cache_ts.pop(cache_key, None)
        return None

    def _cache_response(self, cache_key: str, response: str):
        """Cache a response (process-wide, bounded)."""
        with _state_lock:
            _response_cache[cache_key] = response
            _response_cache_ts[cache_key] = time.time()
            if len(_response_cache) > RESPONSE_CACHE_MAX:
                now = time.time()
                for k, t in list(_response_cache_ts.items()):
                    if now - t > RESPONSE_CACHE_TTL:
                        _response_cache.pop(k, None)
                        _response_cache_ts.pop(k, None)

    def fetch_available_models(self) -> list[dict]:
        """
        Fetch available models from the Free LLM API.
        Real fetch with 1-hour cache; static fallback if API unreachable.
        """
        global _models_cache, _models_fetched_at
        if _models_cache is not None and time.time() - _models_fetched_at < MODELS_CACHE_TTL:
            return _models_cache

        try:
            base = self.api_url.rsplit("/chat/completions", 1)[0]
            r = self._session.get(
                f"{base}/models", headers=self._get_headers(), timeout=CONNECT_TIMEOUT
            )
            if r.status_code == 200:
                data = r.json().get("data", [])
                models = [
                    {"id": m["id"], "name": m.get("name", m["id"]), "available": True}
                    for m in data
                    if isinstance(m, dict) and "id" in m
                ]
                if models:
                    with _state_lock:
                        _models_cache = models
                        _models_fetched_at = time.time()
                    return models
        except Exception as e:
            logger.warning(f"Model list fetch failed, using static list: {e}")

        static = [{"id": m, "name": m, "available": True} for m in self.PREFERRED_MODELS]
        with _state_lock:
            _models_cache = static
            _models_fetched_at = time.time()
        return static

    def get_available_model_ids(self) -> list[str]:
        """Get list of available model IDs."""
        models = self.fetch_available_models()
        return [m['id'] for m in models if m.get('available', True)]

    def get_auto_model(self) -> str:
        """Select the best model: sticky working model, else configured default."""
        global _working_model
        if _working_model:
            return _working_model
        return self.model or DEFAULT_MODEL

    def chat(
        self,
        messages: list[dict],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        model: Optional[str] = None,
    ) -> str:
        """
        Send a chat completion request to the LLM API.

        Args:
            messages: List of message dicts with 'role' and 'content' keys.
            temperature: Override default temperature.
            max_tokens: Override default max_tokens.
            model: Override model selection.

        Returns:
            The assistant's response text.

        Raises:
            LLMServiceError: If the API request fails.
        """
        selected_model = model or self.get_auto_model()
        temp = temperature if temperature is not None else self.temperature
        tokens = max_tokens if max_tokens is not None else self.max_tokens

        # Check response cache
        cache_key = self._get_cache_key(messages, selected_model, temp, tokens)
        cached = self._get_cached_response(cache_key)
        if cached is not None:
            return cached

        # Acquire rate limit slot
        if not self._rate_limiter.acquire(timeout=30):
            raise LLMServiceError(
                "Rate limit exceeded. Please wait a moment and try again."
            )

        # Make the API request
        response_text = self._make_request(messages, selected_model, temp, tokens)

        # Cache the response
        self._cache_response(cache_key, response_text)

        return response_text

    def _make_request(
        self,
        messages: list[dict],
        model: str,
        temperature: float,
        max_tokens: int,
        retry_count: int = 0,
        max_retries: int = 2,
    ) -> str:
        """
        Make the actual API request with retry logic.

        Args:
            messages: Chat messages.
            model: Model to use.
            temperature: Temperature.
            max_tokens: Max tokens.
            retry_count: Current retry attempt.
            max_retries: Maximum retry attempts.

        Returns:
            Response text.

        Raises:
            LLMServiceError: If all retries fail.
        """
        global _working_model
        payload = {
            'model': model,
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens,
        }

        try:
            response = self._session.post(
                self.api_url,
                json=payload,
                headers=self._get_headers(),
                timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
            )

            # Handle rate limit (capped wait - don't block a worker for a minute)
            if response.status_code == 429:
                retry_after = response.headers.get('Retry-After')
                if retry_after:
                    wait_time = min(float(retry_after), 20)
                else:
                    wait_time = min(2 ** retry_count * 2, 20)

                logger.warning(f"Rate limited. Waiting {wait_time}s before retry...")

                if retry_count < max_retries:
                    time.sleep(wait_time)
                    if self._rate_limiter.acquire(timeout=30):
                        return self._make_request(
                            messages, model, temperature, max_tokens,
                            retry_count + 1, max_retries
                        )

                raise LLMServiceError(
                    "Rate limit exceeded. Please wait a moment and try again."
                )

            response.raise_for_status()
            data = response.json()

            # Parse response
            choices = data.get('choices', [])
            if not choices:
                raise LLMServiceError("No choices in LLM response")

            message = choices[0].get('message', {})
            content = message.get('content', '')

            if not content:
                raise LLMServiceError("Empty content in LLM response")

            # Cache as working model
            with _state_lock:
                _working_model = model
            logger.debug(f"Model {model} responded successfully")

            return content

        except requests.exceptions.ConnectionError:
            logger.error(f"Cannot connect to LLM API at {self.api_url}")
            raise LLMServiceError(
                f"Cannot connect to LLM API at {self.api_url}. "
                "Make sure the Free LLM API server is running."
            )
        except requests.exceptions.Timeout:
            logger.error("LLM API request timed out")
            if retry_count < max_retries:
                logger.info(f"Retrying after timeout (attempt {retry_count + 1})...")
                if self._rate_limiter.acquire(timeout=30):
                    return self._make_request(
                        messages, model, temperature, max_tokens,
                        retry_count + 1, max_retries
                    )
            raise LLMServiceError("LLM API request timed out")
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if e.response else None

            # Try fallback models for specific errors
            if status_code in (404, 400, 422) and retry_count < max_retries:
                return self._try_fallback_models(messages, temperature, max_tokens, model)

            logger.error(f"LLM API HTTP error: {e}")
            raise LLMServiceError(f"LLM API HTTP error: {e}")
        except (KeyError, IndexError) as e:
            logger.error(f"Unexpected LLM response format: {e}")
            raise LLMServiceError(f"Unexpected LLM response format: {e}")

    def _try_fallback_models(
        self,
        messages: list[dict],
        temperature: float,
        max_tokens: int,
        failed_model: str,
    ) -> str:
        """Try fallback models when primary model fails."""
        global _working_model
        for model in self.PREFERRED_MODELS:
            if model == failed_model:
                continue

            try:
                logger.info(f"Trying fallback model: {model}")

                if not self._rate_limiter.acquire(timeout=30):
                    continue

                payload = {
                    'model': model,
                    'messages': messages,
                    'temperature': temperature,
                    'max_tokens': max_tokens,
                }

                response = self._session.post(
                    self.api_url,
                    json=payload,
                    headers=self._get_headers(),
                    timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                )
                response.raise_for_status()
                data = response.json()

                choices = data.get('choices', [])
                if choices:
                    content = choices[0].get('message', {}).get('content', '')
                    if content:
                        with _state_lock:
                            _working_model = model
                        logger.info(f"Fallback model {model} succeeded")
                        return content

            except Exception as e:
                logger.warning(f"Fallback model {model} failed: {e}")
                continue

        raise LLMServiceError("All models failed")

    def health_check(self) -> dict:
        """
        Check LLM API status with a real lightweight ping (5s timeout).
        Result cached for 60s to avoid wasting rate limit.
        """
        global _models_cache, _models_fetched_at
        cache_valid = (
            _models_cache is not None and time.time() - _models_fetched_at < 60
        )
        if cache_valid:
            models = _models_cache
            reachable = True
        else:
            try:
                base = self.api_url.rsplit("/chat/completions", 1)[0]
                r = self._session.get(
                    f"{base}/models", headers=self._get_headers(), timeout=5
                )
                reachable = r.status_code == 200
                models = self.fetch_available_models() if reachable else []
            except Exception:
                reachable = False
                models = []
        return {
            'reachable': reachable,
            'models_available': len(models),
            'models': [m['id'] for m in models[:10]],
            'selected_model': _working_model or self.model,
        }

    def get_status(self) -> dict:
        """Get current service status."""
        return {
            'api_url': self.api_url,
            'configured_model': self.model,
            'working_model': _working_model,
            'auto_model': self.get_auto_model(),
            'cached_models_count': len(_models_cache) if _models_cache else 0,
            'rate_limit': {
                'max_requests': self._rate_limiter.max_requests,
                'window_seconds': self._rate_limiter.window_seconds,
                'current_requests': len(self._rate_limiter.requests),
                'wait_time': self._rate_limiter.get_wait_time(),
            },
        }


class LLMServiceError(Exception):
    """Custom exception for LLM service errors."""
    pass
