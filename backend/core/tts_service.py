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
