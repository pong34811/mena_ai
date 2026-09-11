# Piper Local TTS (Sidecar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace edge-tts with a local Piper TTS sidecar so TTS has no rate limits; Thai voice only.

**Architecture:** A new `piper` Docker service (python:3.12-slim + FastAPI + piper-tts + ffmpeg) exposes `POST /v1/tts` returning MP3. The Django backend (`tts_service.py` and Celery `tasks.py`) call it over HTTP via `PIPER_TTS_URL`. Backend API endpoints, cache (`.mp3`), and the frontend playback path are unchanged.

**Tech Stack:** Docker Compose, FastAPI + uvicorn + piper-tts on python:3.12-slim, Django DRF (python:3.14), Celery, pytest, vitest.

## Global Constraints

- Thai voice ONLY: VOICE_OPTIONS contains only `th_TH-tsync2-medium`.
- `VOICE_ALIAS_MAP` must map EVERY legacy edge-tts id referenced in the codebase to `th_TH-tsync2-medium` (so stored DB values and old frontend values keep working).
- Piper returns **MP3** (ffmpeg converts WAV). Never change `.mp3` cache extension or `format: ['mp3']`.
- Production URL env `PIPER_TTS_URL` (compose: `http://piper:8888`, local: `http://localhost:8888`). Read via `os.getenv` with fallback `http://localhost:8888`.
- Do NOT import `edge_tts` anywhere in `backend/core`. Remove `edge-tts>=7.0` from `requirements.txt`.
- Rate conversion: piper `length_scale = 100 / (100 + pct)` where pct is the signed percentage from `normalize_rate()`.
- Run backend tests with pytest inside the docker container; run frontend tests with `npm test` (vitest) on host.
- Pin the Thai model to the verified HF URLs (commit `main` verified 2026-09-11).

**Execution environment notes (Windows/PowerShell):**
- Repo root: `C:\Users\warit\Desktop\mena_ai`; compose file at that root.
- Test commands run: `docker compose exec backend python -m pytest <paths> -q` (container already has the code mounted and DATABASE_URL set).
- Never pass Thai text inline in PowerShell `docker exec -c` or `curl -d` — write a small temp `.py` file instead and run it: `C:\Users\warit\AppData\Local\Temp\opencode\piper_smoke.py` via `& ...\.venv\Scripts\python.exe`.
- PowerShell: no `&&`; use `cmd1; if ($?) { cmd2 }`.
- `git mv` preserves history; PowerShell call operator for paths with spaces.

---

### Task 0: Fix `core/tests` module shadowing (prereq)

The file `backend/core/tests.py` (a real pytest module) shadows the `backend/core/tests/` package
directory (`test_tasks.py`, `test_integration.py`, `test_consumers.py`). Pytest collection of the
package files fails with `module 'core.tests' has no attribute 'test_tasks'`. Fix by moving the file
into the package and adding an `__init__.py`.

**Files:**
- Modify: `backend/core/tests.py` (rename/move)
- Modify: `backend/core/test_suite.py` (new location of the moved module)
- Create: `backend/core/tests/__init__.py`
- Test: `backend/core/tests/*` (whole backend suite)

- [ ] **Step 1: Verify the failure**

Run: `docker compose exec backend python -m pytest -q`
Expected: collection error mentioning `core.tests` (e.g. `Error: ModuleNotFoundError` / `AttributeError: module 'core.tests' has no attribute 'test_tasks'`).

- [ ] **Step 2: Move the module into the package**

```powershell
git mv backend/core/tests.py backend/core/test_suite.py
```

- [ ] **Step 3: Create the package marker**

Create `backend/core/tests/__init__.py` as an empty file:

```python
```

- [ ] **Step 4: Verify the whole suite collects and passes**

Run: `docker compose exec backend python -m pytest -q`
Expected: no collection errors; existing tests pass (exit code 0).

- [ ] **Step 5: Commit**

```bash
git add backend/core/tests.py backend/core/test_suite.py backend/core/tests/__init__.py
git commit -m "fix: resolve core.tests module/package shadowing"
```

---

### Task 1: Piper HTTP client + Thai-only voices in `tts_service.py`

Rewrite the TTS service to call the piper sidecar over HTTP instead of edge-tts, and replace the
voice catalog with the Thai-only piper voice plus the legacy alias map.

**Files:**
- Modify: `backend/core/tts_service.py` (rewrite)
- Create: `backend/core/tests/test_tts_service.py`
- Modify: `backend/requirements.txt` (remove `edge-tts>=7.0`)

**Interfaces:**
- Produces (used by Task 4 & youtube_chat path):
  - `VOICE_OPTIONS: dict[str, list[dict]]` — Thai only
  - `DEFAULT_VOICE = 'th_TH-tsync2-medium'`
  - `VOICE_ALIAS_MAP: dict[str, str]` — legacy ids → piper id
  - `resolve_voice(voice: str) -> str`
  - `rate_to_length_scale(rate: str) -> float`
  - `call_piper_synthesize(text: str, voice: str, length_scale: float) -> Optional[bytes]`
  - `TTSService.generate(text: str, use_cache: bool = True) -> Optional[Path]` (same signature/behavior)

- [ ] **Step 1: Write the failing tests**

Create `backend/core/tests/test_tts_service.py`:

```python
"""Tests for the Piper-backed TTS service."""

from pathlib import Path
from unittest import mock

import pytest

from core import tts_service as svc
from core.tts_service import (
    TTSService,
    DEFAULT_VOICE,
    VOICE_ALIAS_MAP,
    VOICE_OPTIONS,
    call_piper_synthesize,
    rate_to_length_scale,
    resolve_voice,
    get_all_voices,
)


class TestPiperConfig:
    def test_voice_options_thai_only(self):
        assert list(VOICE_OPTIONS.keys()) == ["thai"]
        assert VOICE_OPTIONS["thai"][0]["id"] == "th_TH-tsync2-medium"
        assert DEFAULT_VOICE == "th_TH-tsync2-medium"

    def test_alias_map_covers_all_legacy_voices(self):
        old_ids = [
            "th-TH-PremwadeeNeural", "th-TH-NiwatNeural",
            "en-US-AriaNeural", "en-US-GuyNeural", "en-US-JennyNeural",
            "en-US-MichelleNeural", "en-GB-SoniaNeural", "en-GB-RyanNeural",
            "ja-JP-NanamiNeural", "ja-JP-KeitaNeural",
        ]
        assert all(VOICE_ALIAS_MAP[oid] == DEFAULT_VOICE for oid in old_ids)

    def test_get_all_voices_thai_only(self):
        assert get_all_voices() == VOICE_OPTIONS
        assert len(get_all_voices()["thai"]) == 1


class TestResolveVoice:
    def test_unknown_voice_falls_back(self):
        assert resolve_voice("nonexistent-voice") == DEFAULT_VOICE

    def test_legacy_alias_resolves(self):
        assert resolve_voice("th-TH-PremwadeeNeural") == DEFAULT_VOICE

    def test_none_uses_default(self):
        assert resolve_voice(None) == DEFAULT_VOICE

    def test_new_id_passes_through(self):
        assert resolve_voice("th_TH-tsync2-medium") == DEFAULT_VOICE


class TestRateToLengthScale:
    def test_default_zero(self):
        assert rate_to_length_scale("+0%") == 1.0

    def test_speed_up(self):
        assert rate_to_length_scale("+50%") == pytest.approx(100 / 150)

    def test_slow_down(self):
        assert rate_to_length_scale("-20%") == pytest.approx(100 / 80)

    def test_multiplier_input(self):
        assert rate_to_length_scale("1.5") == pytest.approx(100 / 150)


class TestCallPiperSynthesize:
    def test_success_returns_bytes(self, monkeypatch):
        resp = mock.Mock(status_code=200, content=b"ID3-fake-mp3")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        out = call_piper_synthesize("สวัสดี", "th_TH-tsync2-medium", 1.0)
        assert out == b"ID3-fake-mp3"

    def test_http_error_returns_none(self, monkeypatch):
        resp = mock.Mock(status_code=500, text="boom")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        assert call_piper_synthesize("hi", "th_TH-tsync2-medium", 1.0) is None

    def test_connection_error_returns_none(self, monkeypatch):
        import requests
        def raise_error(*a, **k):
            raise requests.exceptions.ConnectionError("down")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(side_effect=raise_error))
        assert call_piper_synthesize("hi", "th_TH-tsync2-medium", 1.0) is None


class TestGenerators:
    def test_generate_returns_cached_file(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        tts = TTSService(voice="th-TH-PremwadeeNeural", rate="+0%")
        cache_path = svc.get_cache_path("สวัสดีจ้า", DEFAULT_VOICE, "+0%")
        cache_path.write_bytes(b"cached")
        assert tts.generate("สวัสดีจ้า") == cache_path

    def test_generate_strips_emoji_only_text(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        tts = TTSService(voice=DEFAULT_VOICE, rate="+0%")
        assert tts.generate("🦋✨") is None

    def test_generate_writes_mp3_and_cleans_cache(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        resp = mock.Mock(status_code=200, content=b"new-mp3-bytes")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        tts = TTSService(voice=DEFAULT_VOICE, rate="+10%")
        out = tts.generate("สวัสดีครับ")
        assert out is not None
        assert out.read_bytes() == b"new-mp3-bytes"
        call = svc.requests.post.call_args
        assert call.kwargs["json"]["length_scale"] == pytest.approx(100 / 110)
        assert call.kwargs["json"]["voice"] == DEFAULT_VOICE

    def test_generate_retries_once_on_connection_error(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        import requests
        real = svc.requests.post
        calls = {"n": 0}
        def flaky(*a, **k):
            calls["n"] += 1
            if calls["n"] == 1:
                raise requests.exceptions.ConnectionError("down")
            return mock.Mock(status_code=200, content=b"ok-mp3")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(side_effect=flaky))
        tts = TTSService(voice=DEFAULT_VOICE, rate="+0%")
        out = tts.generate("hello")
        assert out is not None and out.read_bytes() == b"ok-mp3"
        assert calls["n"] == 2

    def test_generate_piper_down_returns_none(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        import requests
        def down(*a, **k):
            raise requests.exceptions.ConnectionError("down")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(side_effect=down))
        tts = TTSService(voice=DEFAULT_VOICE, rate="+0%")
        assert tts.generate("hello") is None

    def test_generate_uses_alias_voice_in_cache_key(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        resp = mock.Mock(status_code=200, content=b"x")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        tts = TTSService(voice="th-TH-PremwadeeNeural", rate="+0%")
        expected = svc.get_cache_path("test", DEFAULT_VOICE, "+0%")
        tts.generate("test")
        assert expected.exists()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose exec backend python -m pytest core/tests/test_tts_service.py -q`
Expected: FAIL — `core.tts_service` has no `call_piper_synthesize`, `rate_to_length_scale`, or `resolve_voice`; `VOICE_OPTIONS['thai'][0]['id']` is the old Azure id.

- [ ] **Step 3: Rewrite `backend/core/tts_service.py`**

Replace the entire file with:

```python
"""
TTS Service - Local Piper TTS (no rate limits).

Provides:
- Text-to-speech conversion via a local Piper sidecar (HTTP)
- Audio file generation and caching (MP3, unchanged)
- Thai voice only (th_TH-tsync2-medium); legacy voice ids aliased
"""

import hashlib
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Piper sidecar base URL. Read from env (compose sets http://piper:8888).
PIPER_TTS_URL = os.getenv("PIPER_TTS_URL", "http://localhost:8888")
PIPER_TTS_TIMEOUT = 15

# Cap concurrent synthesis (piper is CPU-bound locally; protects the host).
_tts_semaphore = threading.Semaphore(2)

# Emoji regex: matches most emoji including compound sequences
_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "\U0001f926-\U0001f937"
    "\U00010000-\U0010ffff"
    "\u200d"
    "\ufe0f"
    "]+",
    flags=re.UNICODE,
)


def _strip_emojis(text: str) -> str:
    """Remove emojis that TTS cannot synthesize."""
    return _EMOJI_RE.sub("", text).strip()


# Thai voice only (local Piper). Quality "medium", robotic vs Azure — user-approved.
VOICE_OPTIONS = {
    'thai': [
        {'id': 'th_TH-tsync2-medium', 'name': 'Thai Female (tsync2)', 'gender': 'Female'},
    ],
}

DEFAULT_VOICE = 'th_TH-tsync2-medium'

# Map every legacy edge-tts voice id used anywhere in the repo to the piper voice,
# so stored DB values and old frontend values keep working.
VOICE_ALIAS_MAP = {
    'th-TH-PremwadeeNeural': DEFAULT_VOICE,
    'th-TH-NiwatNeural': DEFAULT_VOICE,
    'en-US-AriaNeural': DEFAULT_VOICE,
    'en-US-GuyNeural': DEFAULT_VOICE,
    'en-US-JennyNeural': DEFAULT_VOICE,
    'en-US-MichelleNeural': DEFAULT_VOICE,
    'en-GB-SoniaNeural': DEFAULT_VOICE,
    'en-GB-RyanNeural': DEFAULT_VOICE,
    'ja-JP-NanamiNeural': DEFAULT_VOICE,
    'ja-JP-KeitaNeural': DEFAULT_VOICE,
}

_VALID_VOICES = {v['id'] for voices in VOICE_OPTIONS.values() for v in voices}


def resolve_voice(voice: str) -> str:
    """Resolve any stored voice id to a valid piper id (alias -> default)."""
    if not voice:
        return DEFAULT_VOICE
    resolved = VOICE_ALIAS_MAP.get(voice, voice)
    if resolved not in _VALID_VOICES:
        logger.warning("Unknown TTS voice %r, using default", voice)
        return DEFAULT_VOICE
    return resolved


# Cache directory for audio files
CACHE_DIR = Path(getattr(settings, 'BASE_DIR', Path(__file__).resolve().parent.parent)) / 'tts_cache'
CACHE_DIR.mkdir(exist_ok=True)

# Maximum cache size (number of files)
MAX_CACHE_SIZE = 100


def normalize_rate(rate: str) -> str:
    """Normalize a speech rate into '%' format (e.g. '+10%', '-5%').

    Accepts '%' format directly, or a speed multiplier like '1.0'/'1.1'
    (sent by older frontend defaults). Falls back to '+0%' for anything unparseable.
    """
    if not rate:
        return '+0%'
    rate = str(rate).strip()
    if re.fullmatch(r'[+-]?\d+%', rate):
        return rate if rate.startswith(('+', '-')) else f'+{rate}'
    try:
        mult = float(rate)
        pct = round((mult - 1) * 100)
        return f'+{pct}%' if pct >= 0 else f'{pct}%'
    except (ValueError, TypeError):
        logger.warning("Unparseable TTS rate %r, falling back to '+0%'", rate)
        return '+0%'


def rate_to_length_scale(rate: str) -> float:
    """Convert an edge-style rate (+X%) to a piper length_scale.

    length_scale = 100 / (100 + pct): +50% speed -> 0.667, -20% -> 1.25.
    """
    pct = int(normalize_rate(rate).rstrip('%'))
    return 100.0 / (100.0 + pct)


def get_cache_path(text: str, voice: str, rate: str = '+0%') -> Path:
    """Generate a cache file path for given text, voice and rate."""
    text_hash = hashlib.md5(f"{voice}:{rate}:{text}".encode('utf-8')).hexdigest()
    return CACHE_DIR / f"{text_hash}.mp3"


def cleanup_cache():
    """Remove oldest cache files if cache exceeds max size."""
    files = sorted(CACHE_DIR.glob('*.mp3'), key=lambda f: f.stat().st_mtime)
    while len(files) > MAX_CACHE_SIZE:
        oldest = files.pop(0)
        try:
            oldest.unlink()
        except OSError:
            pass


def call_piper_synthesize(text: str, voice: str, length_scale: float) -> Optional[bytes]:
    """POST text to the piper sidecar; returns MP3 bytes or None on any failure."""
    try:
        resp = requests.post(
            f"{PIPER_TTS_URL}/v1/tts",
            json={'text': text, 'voice': voice, 'length_scale': length_scale},
            timeout=PIPER_TTS_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.error("Piper returned %s: %s", resp.status_code, resp.text[:200])
            return None
        return resp.content
    except requests.RequestException as e:
        logger.error("Piper request failed: %s", e)
        return None


class TTSService:
    """Text-to-Speech service calling a local Piper sidecar."""

    def __init__(self, voice: str = DEFAULT_VOICE, rate: str = "+0%"):
        """Initialize TTS service.

        Args:
            voice: Voice ID (any legacy edge id is aliased to the piper voice)
            rate: Speech rate ('+10%', '-10%', or multiplier). Piper length_scale conversion.
        """
        self.voice = voice
        self.rate = normalize_rate(rate)

    def generate(self, text: str, use_cache: bool = True) -> Optional[Path]:
        """Generate an MP3 file from text via the piper sidecar.

        Args:
            text: Text to convert to speech
            use_cache: Whether to use cached audio if available

        Returns:
            Path to generated audio file, or None if failed
        """
        if not text or not text.strip():
            return None

        # Strip emojis, truncate long text (kept from edge-tts behaviour, still good for TTS)
        text = _strip_emojis(text)
        if not text:
            return None
        if len(text) > 300:
            text = text[:300]

        voice = resolve_voice(self.voice)
        length_scale = rate_to_length_scale(self.rate)
        cache_path = get_cache_path(text, voice, self.rate)

        if use_cache and cache_path.exists():
            logger.debug("TTS cache hit: %s", cache_path.name)
            return cache_path

        # Synthesize via the local piper sidecar. Serialize with the semaphore so
        # CPU-bound synthesis is capped. Retry once on transient connectivity.
        acquired = _tts_semaphore.acquire(timeout=60)
        try:
            for attempt in range(2):
                audio = call_piper_synthesize(text, voice, length_scale)
                if audio:
                    cache_path.write_bytes(audio)
                    cleanup_cache()
                    return cache_path
                if attempt == 0:
                    time.sleep(0.5)
            logger.error("TTS generation failed after 2 attempts (voice=%s)", voice)
            return None
        finally:
            if acquired:
                _tts_semaphore.release()

    def get_audio_bytes(self, text: str, use_cache: bool = True) -> Optional[bytes]:
        """Get audio bytes from text."""
        cache_path = self.generate(text, use_cache)
        if cache_path and cache_path.exists():
            return cache_path.read_bytes()
        return None


def get_voices_for_language(language: str) -> list[dict]:
    """Get available voices for a language."""
    lang = language.lower()
    for key, voices in VOICE_OPTIONS.items():
        if key in lang or lang in key:
            return voices
    all_voices = []
    for voices in VOICE_OPTIONS.values():
        all_voices.extend(voices)
    return all_voices


def get_all_voices() -> dict[str, list[dict]]:
    """Get all available voices grouped by language."""
    return VOICE_OPTIONS
```

- [ ] **Step 4: Remove edge-tts from dependencies**

Edit `backend/requirements.txt`: delete the line `edge-tts>=7.0`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose exec backend python -m pytest core/tests/test_tts_service.py -q`
Expected: PASS (all new tests green). Note: this container still has the old pip packages; removing the import is enough for tests to pass — the dependency drop is applied at rebuild (Task 5).

- [ ] **Step 6: Commit**

```bash
git add backend/core/tts_service.py backend/core/tests/test_tts_service.py backend/requirements.txt
git commit -m "feat: switch TTS service to local Piper sidecar (HTTP)"
```

---

### Task 2: Swtich Celery `generate_tts` to the piper HTTP client

`tasks.py` currently imports `edge_tts` and synthesizes inline. Replace with the shared piper
helpers so Celery uses the same path as the API endpoint.

**Files:**
- Modify: `backend/core/tasks.py`
- Modify: `backend/core/tests/test_tasks.py`

**Interfaces:**
- Consumes (from Task 1): `call_piper_synthesize(text, voice, length_scale) -> Optional[bytes]`, `resolve_voice(voice) -> str`, `rate_to_length_scale(rate) -> float`
- Produces: `generate_tts(text, voice, rate) -> dict` — identical signature/contract as before: `{"success", "audio_path", "cache_key", "error"}`.

- [ ] **Step 1: Update the failing tests**

Edit `backend/core/tests/test_tasks.py`. Remove the two `edge_tts.Communicate` mock tests and replace
`synthesizes_new_audio` / `handles_exception` with piper mocks:



Replace this block (lines 60-102, the two edge_tts-mocking tests):

```python
    def test_generate_tts_synthesizes_new_audio(self, monkeypatch, tmp_path):
        """Test that generate_tts synthesizes new audio when cache miss."""
        monkeypatch.setattr("core.tasks.TTS_CACHE_DIR", tmp_path)

        # Mock edge_tts.Communicate
        mock_communicate = mock.Mock()
        mock_communicate.save = mock.AsyncMock()

        mock_communicate_class = mock.Mock()
        mock_communicate_class.return_value = mock_communicate

        monkeypatch.setattr("core.tasks.edge_tts.Communicate", mock_communicate_class)

        # We need to call the task directly (not via .delay) to test the function
        from core.tasks import generate_tts
        text = "สวัสดีครับ"
        voice = "th-TH-PremwadeeNeural"
        result = generate_tts(text, voice, "+0%")

        assert result["success"] is True
        assert result["cache_key"] is not None
        assert "audio_path" in result

        # Verify Communicate was called with correct args
        mock_communicate_class.assert_called_once_with(text, voice, rate="+0%")
        mock_communicate.save.assert_called_once()

    def test_generate_tts_handles_exception(self, monkeypatch, tmp_path):
        """Test that generate_tts handles synthesis errors gracefully."""
        monkeypatch.setattr("core.tasks.TTS_CACHE_DIR", tmp_path)

        # Mock edge_tts.Communicate to raise exception
        mock_communicate = mock.Mock()
        mock_communicate.save = mock.AsyncMock(side_effect=Exception("Network error"))

        mock_communicate_class = mock.Mock()
        mock_communicate_class.return_value = mock_communicate

        monkeypatch.setattr("core.tasks.edge_tts.Communicate", mock_communicate_class)

        result = generate_tts("Hello", "voice", "+0%")
        assert result["success"] is False
        assert "Network error" in result["error"]
```

with:

```python
    def test_generate_tts_synthesizes_new_audio(self, monkeypatch, tmp_path):
        """Test that generate_tts synthesizes new audio when cache miss."""
        monkeypatch.setattr("core.tasks.TTS_CACHE_DIR", tmp_path)

        fake_post = mock.Mock(return_value=b"fake mp3")
        monkeypatch.setattr("core.tasks.call_piper_synthesize", fake_post)

        text = "สวัสดีครับ"
        voice = "th-TH-PremwadeeNeural"
        result = generate_tts(text, voice, "+0%")

        assert result["success"] is True
        assert result["cache_key"] is not None
        assert "audio_path" in result

        # Alias resolved to the piper voice id
        fake_post.assert_called_once_with(text, "th_TH-tsync2-medium", pytest.approx(1.0))

    def test_generate_tts_handles_synthesis_error(self, monkeypatch, tmp_path):
        """Test that generate_tts handles synthesis errors gracefully."""
        monkeypatch.setattr("core.tasks.TTS_CACHE_DIR", tmp_path)

        monkeypatch.setattr("core.tasks.call_piper_synthesize", mock.Mock(return_value=None))

        result = generate_tts("Hello", "voice", "+0%")
        assert result["success"] is False
        assert "TTS" in result["error"]
```

Add `import core.tasks as core_tasks` on a new line after the existing import block (after
`from core.tasks import generate_tts, debug_task, _get_cache_key`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose exec backend python -m pytest core/tests/test_tasks.py -q`
Expected: FAIL — `core.tasks` still imports `edge_tts` (ImportError) or has no `call_piper_synthesize`.

- [ ] **Step 3: Rewrite `backend/core/tasks.py`**

Replace the whole file with:

```python
"""
Celery tasks for core app.

TTS generation is offloaded to Celery workers to avoid blocking HTTP requests.
"""

import hashlib
import logging
import os
import re
from pathlib import Path

from celery import shared_task
from django.conf import settings

from core.tts_service import (
    call_piper_synthesize,
    rate_to_length_scale,
    resolve_voice,
)

logger = logging.getLogger(__name__)

TTS_CACHE_DIR = Path(settings.BASE_DIR) / "tts_cache"
TTS_CACHE_DIR.mkdir(exist_ok=True)

_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "\U0001f926-\U0001f937"
    "\U00010000-\U0010ffff"
    "\u200d"
    "\ufe0f"
    "]+",
    flags=re.UNICODE,
)


def _get_cache_key(text: str, voice: str, rate: str = "+0%") -> str:
    """Generate a deterministic cache key for TTS."""
    key = f"{text}|{voice}|{rate}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


@shared_task(bind=True, max_retries=2)
def generate_tts(self, text: str, voice: str, rate: str = "+0%") -> dict:
    """
    Generate TTS audio file via the local Piper sidecar.

    Args:
        text: Text to synthesize
        voice: Voice id (any legacy edge id is aliased to the piper voice)
        rate: Speech rate (e.g., "+0%", "+10%", "-10%")

    Returns:
        dict: {"success": bool, "audio_path": str, "cache_key": str, "error": str}
    """
    if not text or not voice:
        return {"success": False, "error": "Text and voice are required"}

    # Strip emojis
    text = _EMOJI_RE.sub("", text).strip()
    if not text:
        return {"success": False, "error": "Text is empty after emoji removal"}

    try:
        voice_id = resolve_voice(voice)
        length_scale = rate_to_length_scale(rate)

        cache_key = _get_cache_key(text, voice_id, rate)
        cache_path = TTS_CACHE_DIR / f"{cache_key}.mp3"

        # Return cached file if exists
        if cache_path.exists():
            logger.debug("TTS cache hit: %s", cache_key)
            return {
                "success": True,
                "audio_path": os.path.relpath(cache_path, settings.BASE_DIR),
                "cache_key": cache_key,
            }

        # Synthesize via the piper sidecar
        audio = call_piper_synthesize(text, voice_id, length_scale)
        if audio is None:
            logger.error("TTS generation failed for voice=%s", voice_id)
            return {"success": False, "error": "TTS generation failed"}

        cache_path.write_bytes(audio)
        logger.info("TTS synthesized: %s (%d chars)", cache_key, len(text))

        return {
            "success": True,
            "audio_path": os.path.relpath(cache_path, settings.BASE_DIR),
            "cache_key": cache_key,
        }

    except Exception as e:
        logger.exception("TTS generation failed for voice=%s, text=%s", voice, text[:50])
        return {"success": False, "error": str(e)}


@shared_task(bind=True)
def debug_task(self):
    """Simple debug task to verify Celery is working."""
    logger.info("Debug task executed successfully")
    return {"status": "ok", "task_id": self.request.id}
```

Also edit `test_generate_tts_uses_cache` (line 49) to use the resolved voice id in the cache key:

```python
        cache_key = _get_cache_key("Hello world", "th_TH-tsync2-medium", "+0%")
```

And the task call inside that test:

```python
        result = generate_tts("Hello world", "th-TH-PremwadeeNeural", "+0%")
        assert result["success"] is True
        assert result["cache_key"] == cache_key
```

Finally, add `import core.tasks as core_tasks` to the imports block at the top of the file (after the existing imports) so the piper mock path can be monkeypatched:

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose exec backend python -m pytest core/tests/test_tasks.py -q`
Expected: PASS.

- [ ] **Step 5: Run the whole backend suite**

Run: `docker compose exec backend python -m pytest -q`
Expected: PASS (Task 1 + Task 2 changes together under the existing suite).

- [ ] **Step 6: Commit**

```bash
git add backend/core/tasks.py backend/core/tests/test_tasks.py
git commit -m "feat: route celery TTS through Piper sidecar"
```

---

### Task 3: Update TTSSettings default voice + backend metadata refs

Change the stored-default voice ids to the piper id so fresh setups/rows use it, and update the
tests/migration that assert the old Azure default.

**Files:**
- Modify: `backend/messages_tts/models.py` (lines 19-23, 39-43 defaults)
- Modify: `backend/messages_tts/tests.py` (lines 20, 24, 94)
- Create: `backend/messages_tts/migrations/0002_ttssettings_piper_voice.py`
- Test: `backend/messages_tts/tests.py`

- [ ] **Step 1: Update the failing tests**

Edit `backend/messages_tts/tests.py`:
- Line 20: `assert settings.questioner_voice == "th_TH-tsync2-medium"`
- Line 24: `assert settings.responder_voice == "th_TH-tsync2-medium"`
- Line 94: `assert response.data["questioner_voice"] == "th_TH-tsync2-medium"`

(The tests at lines 30/101/119/124 that set arbitrary ids like `th-TH-NiwatNeural` still pass —
any string is allowed in the CharField.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose exec backend python -m pytest messages_tts/tests.py -q`
Expected: FAIL — defaults are still `th-TH-PremwadeeNeural`.

- [ ] **Step 3: Update the model defaults**

Edit `backend/messages_tts/models.py`:

```python
    questioner_voice = models.CharField(
        max_length=100,
        default='th_TH-tsync2-medium',
        help_text="เสียง TTS สำหรับผู้ถาม"
    )
```

```python
    responder_voice = models.CharField(
        max_length=100,
        default='th_TH-tsync2-medium',
        help_text="เสียง TTS สำหรับผู้ตอบ"
    )
```

- [ ] **Step 4: Generate the migration**

Run (from backend dir on host, or inside the container):

```bash
docker compose exec backend python manage.py makemigrations messages_tts
```

Expected: creates `messages_tts/migrations/0002_ttssettings_piper_voice.py` with the two changed
defaults. Existing rows are NOT touched (the alias map in `tts_service.py` covers any legacy value).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose exec backend python -m pytest messages_tts/tests.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/messages_tts/models.py backend/messages_tts/tests.py backend/messages_tts/migrations/0002_ttssettings_piper_voice.py
git commit -m "feat: use Piper voice id as TTSSettings default"
```

---

### Task 4: Piper sidecar service (Docker image + compose wiring)

Add the piper container that serves MP3 TTS over HTTP, and wire backend + celery-worker to it.

**Files:**
- Create: `piper/Dockerfile`
- Create: `piper/requirements.txt`
- Create: `piper/serve.py`
- Modify: `docker-compose.yml`
- Modify: `backend/.env` (add `PIPER_TTS_URL`)

**Interfaces:**
- Produces: `POST /v1/tts` `{"text": str, "voice": str, "length_scale": float}` → MP3 bytes; `GET /healthz` → 200.
- Consumes: nothing.

- [ ] **Step 1: Create `piper/requirements.txt`**

```text
fastapi>=0.115
uvicorn>=0.30
piper-tts>=1.2.0
numpy>=1.26
soundfile>=0.12
```

- [ ] **Step 2: Create `piper/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the Thai voice (verified URL on HF main, 2026-09-11).
# th_TH-tsync2-medium is CC BY-NC-SA 3.0 (non-commercial) — user-approved.
RUN mkdir -p /app/voices \
    && curl -fsSL -o /app/voices/th_TH-tsync2-medium.onnx \
      https://huggingface.co/rhasspy/piper-voices/resolve/main/th/th_TH/tsync2/medium/th_TH-tsync2-medium.onnx \
    && curl -fsSL -o /app/voices/th_TH-tsync2-medium.onnx.json \
      https://huggingface.co/rhasspy/piper-voices/resolve/main/th/th_TH/tsync2/medium/th_TH-tsync2-medium.onnx.json

COPY serve.py .

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8888/healthz || exit 1

CMD ["uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8888"]
```

- [ ] **Step 3: Create `piper/serve.py`**

```python
"""
Minimal Piper TTS HTTP service.

POST /v1/tts  {"text": str, "voice": str, "length_scale": float} -> MP3 bytes
GET  /healthz -> {"status": "ok"}
"""

import logging
import subprocess
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel

from piper.voice import PiperVoice

logger = logging.getLogger("piper")
logging.basicConfig(level=logging.INFO)

VOICES_DIR = Path("/app/voices")
VOICE_ID = "th_TH-tsync2-medium"
WAV_TMP_SUFFIX = ".wav"

FALLBACK_VOICE = VOICE_ID

app = FastAPI()
_lock = threading.Lock()
_voice = None


def get_voice() -> PiperVoice:
    global _voice
    if _voice is None:
        with _lock:
            if _voice is None:
                logger.info("Loading piper voice %s", VOICE_ID)
                _voice = PiperVoice.load(
                    VOICES_DIR / f"{VOICE_ID}.onnx",
                    config_path=VOICES_DIR / f"{VOICE_ID}.onnx.json",
                )
    return _voice


class TTSRequest(BaseModel):
    text: str
    voice: str = VOICE_ID
    length_scale: float = 1.0


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/v1/tts")
def synthesize(req: TTSRequest):
    if req.voice != VOICE_ID:
        raise HTTPException(status_code=400, detail=f"Unknown voice: {req.voice}")
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")

    voice = get_voice()

    try:
        # Synthesize to a temp WAV, then convert to MP3 via ffmpeg.
        # Serialized: single onnxruntime session + GIL-bound synth; safe & CPU-friendly.
        with _lock:
            with tempfile.NamedTemporaryFile(suffix=WAV_TMP_SUFFIX, delete=False) as tmp:
                wav_path = tmp.name
            try:
                voice.synthesize(req.text, wav_file=wav_path, length_scale=req.length_scale)
            finally:
                _stale_wav = Path(wav_path)
            result = subprocess.run(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-i", wav_path,
                    "-codec:a", "libmp3lame", "-qscale:a", "7",
                    "-f", "mp3", "-",
                ],
                capture_output=True,
                timeout=60,
            )
            Path(wav_path).unlink(missing_ok=True)
        if result.returncode != 0:
            logger.error("ffmpeg failed: %s", result.stderr.decode("utf-8", "replace")[-500:])
            raise RuntimeError("ffmpeg conversion failed")
        return Response(content=result.stdout, media_type="audio/mpeg")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Synthesis failed")
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 4: Wire compose**

Edit `docker-compose.yml`:

Add a `piper` service after `redis`:

```yaml
  piper:
    build: ./piper
    ports:
      - "8888:8888"
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8888/healthz"]
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
```

Add env + dependency to `backend`:

```yaml
    environment:
      DJANGO_DEBUG: "True"
      DJANGO_ALLOWED_HOSTS: "*"
      DATABASE_URL: postgres://mena_ai:mena_ai@db:5432/mena_ai
      FREE_LLM_API_URL: http://freellmapi:9001/v1/chat/completions
      REDIS_URL: redis://redis:6379/0
      PIPER_TTS_URL: http://piper:8888
    depends_on:
      - db
      - redis
      - piper
```

Add the same `PIPER_TTS_URL` env line and a `piper` entry to `celery-worker`'s `depends_on`.

- [ ] **Step 5: Add `PIPER_TTS_URL` to `backend/.env`**

Append: `PIPER_TTS_URL=http://localhost:8888`

- [ ] **Step 6: Build and smoke-test the sidecar**

```powershell
docker compose up -d --build piper
```

Then create `C:\Users\warit\AppData\Local\Temp\opencode\piper_smoke.py`:

```python
import sys
import requests

url = "http://localhost:8888/v1/tts"
r = requests.post(url, json={"text": "สวัสดีครับ ทดสอบสัญญาณ", "voice": "th_TH-tsync2-medium", "length_scale": 1.0}, timeout=30)
print("status:", r.status_code)
print("content-type:", r.headers.get("Content-Type"))
print("bytes:", len(r.content))
print("mp3 header:", r.content[:3] == b"ID3" or r.content[:2] == b"\xff\xfb")
assert r.status_code == 200
assert len(r.content) > 1000
open(r"C:\Users\warit\AppData\Local\Temp\opencode\piper_smoke.mp3", "wb").write(r.content)
```

Run it:

```powershell
& .\.venv\Scripts\python.exe C:\Users\warit\AppData\Local\Temp\opencode\piper_smoke.py
```

Expected: `status: 200`, `content-type: audio/mpeg`, `bytes > 1000`, valid MP3 header.

- [ ] **Step 7: Commit**

```bash
git add piper/ docker-compose.yml backend/.env
git commit -m "feat: add local Piper TTS sidecar service"
```

---

### Task 5: Frontend default voice id + tests

Update the two frontend default strings and their test fixtures to the piper voice id.

**Files:**
- Modify: `frontend/src/services/api.ts:143`
- Modify: `frontend/src/pages/ChatPage.tsx:765,769`
- Modify: `frontend/src/hooks/useHowlerTTS.ts:58,62`
- Modify: `frontend/src/services/api.test.ts` (add default-voice test)
- Modify: `frontend/src/components/ui/TtsConfigModal.test.tsx` (mock voice ids)
- Modify: `frontend/src/pages/__tests__/ChatPage.test.tsx:33-34`
- Test: `frontend` (`npm test`)

- [ ] **Step 1: Update the failing tests**

`frontend/src/components/ui/TtsConfigModal.test.tsx` — three occurrences of the old id:

```typescript
    thai: [{ id: 'th_TH-tsync2-medium', name: 'Thai (tsync2)', gender: 'Female' }],
```

```typescript
  default_voice: 'th_TH-tsync2-medium',
```

```typescript
    userTtsVoice: 'th_TH-tsync2-medium',
```

and in `calls setAiTtsVoice when AI voice is changed`:

```typescript
    fireEvent.change(selects[1], { target: { value: 'th_TH-tsync2-medium' } })
    expect(defaultProps.setAiTtsVoice).toHaveBeenCalledWith('th_TH-tsync2-medium')
```

`frontend/src/pages/__tests__/ChatPage.test.tsx` lines 33-34:

```typescript
    questioner_voice: 'th_TH-tsync2-medium',
    responder_voice: 'th_TH-tsync2-medium',
```

`frontend/src/services/api.test.ts` — add a test after the existing `generate posts and returns blob` test inside the `ttsApi` describe:

```typescript
  it('generate defaults to piper thai voice', async () => {
    const mockBlob = new Blob(['audio'], { type: 'audio/mpeg' })
    mockedAxios.post.mockResolvedValueOnce({ data: mockBlob })
    await ttsApi.generate('Hello')
    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/tts/generate/',
      { text: 'Hello', voice: 'th_TH-tsync2-medium', rate: '+0%' },
      { responseType: 'blob' }
    )
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (in `frontend`): `npm test -- src/services/api.test.ts src/components/ui/TtsConfigModal.test.tsx src/pages/__tests__/ChatPage.test.tsx`
Expected: the generate-default and modal tests FAIL (old default strings).

- [ ] **Step 3: Update the source defaults**

`frontend/src/services/api.ts:143`:

```typescript
      voice: voice || 'th_TH-tsync2-medium',
```

`frontend/src/pages/ChatPage.tsx:765`:

```typescript
        userTtsVoice={tts.settings?.questioner_voice ?? 'th_TH-tsync2-medium'}
```

`frontend/src/pages/ChatPage.tsx:769`:

```typescript
        aiTtsVoice={tts.settings?.responder_voice ?? 'th_TH-tsync2-medium'}
```

`frontend/src/hooks/useHowlerTTS.ts:58` and `:62`:

```typescript
  questioner_voice: 'th_TH-tsync2-medium',
```

```typescript
  responder_voice: 'th_TH-tsync2-medium',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (in `frontend`): `npm test`
Expected: PASS (full frontend suite).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/services/api.test.ts frontend/src/pages/ChatPage.tsx frontend/src/pages/__tests__/ChatPage.test.tsx frontend/src/hooks/useHowlerTTS.ts frontend/src/components/ui/TtsConfigModal.test.tsx
git commit -m "feat: use Piper voice id as frontend TTS default"
```

---

### Task 6: End-to-end verification + full stack rebuild

Verify the full stack works with the piper sidecar: backend serves MP3 TTS through the public API,
frontend still plays it, and cache hits return instantly.

**Files:**
- (no code changes expected)

- [ ] **Step 1: Rebuild the whole stack**

```powershell
docker compose up -d --build
```

Expected: all services start; `piper` healthy (no `edge-tts` dependency errors in backend build).

- [ ] **Step 2: Generate TTS end-to-end (via public API)**

Create `C:\Users\warit\AppData\Local\Temp\opencode\tts_e2e.py`:

```python
import io
import requests

BASE = "http://localhost:8000"
payload = {"text": "สวัสดีจ้า ดีใจที่ได้เจอทุกคนเลยนะ", "voice": "th_TH-tsync2-medium", "rate": "+0%"}
r = requests.post(f"{BASE}/api/tts/generate/", json=payload, timeout=30)
print("status:", r.status_code)
print("content-type:", r.headers.get("Content-Type"))
print("bytes:", len(r.content))
assert r.status_code == 200
assert r.content[:2] == b"\xff\xfb" or r.content[:3] == b"ID3", "not a valid mp3"
open(r"C:\Users\warit\AppData\Local\Temp\opencode\tts_e2e.mp3", "wb").write(r.content)
```

Run and import the file into a media player to confirm it is audible Thai speech:

```powershell
& .\.venv\Scripts\python.exe C:\Users\warit\AppData\Local\Temp\opencode\tts_e2e.py
```

Expected: `status: 200`, valid MP3 of a few KB.

- [ ] **Step 3: Verify cache hit**

Re-run the same script. Expected: identical output; backend log line `TTS cache hit`.
Observe: no `NoAudioReceived`, no rate-limit errors in `docker compose logs backend`.

- [ ] **Step 4: Verify legacy voice id still works (alias)**

Edit `tts_e2e.py` payload to `"voice": "th-TH-PremwadeeNeural"` and re-run.
Expected: `status: 200`, valid MP3 (alias resolved).

- [ ] **Step 5: Verify celery path**

Run: `docker compose exec backend python -c "from core.tasks import generate_tts; print(generate_tts('สวัสดีครับ', 'th-TH-PremwadeeNeural', '+0%'))"`
Expected: `{'success': True, ...}` dict printed.

- [ ] **Step 6: Run the full test suites**

Backend: `docker compose exec backend python -m pytest -q` → PASS.
Frontend: `npm test` (in `frontend`) → PASS.

- [ ] **Step 7: Commit any leftover changes**

```bash
git status --short
git add -A
git commit -m "chore: verify Piper TTS end-to-end"
```

(Only if `git status` shows anything; otherwise skip.)