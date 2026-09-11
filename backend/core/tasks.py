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
