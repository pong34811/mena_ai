"""
Celery tasks for core app.

TTS generation is offloaded to Celery workers to avoid blocking HTTP requests.
"""

import asyncio
import hashlib
import os
from pathlib import Path

import edge_tts
from celery import shared_task
from django.conf import settings

logger = getattr(__import__("logging"), "getLogger")(__name__)

TTS_CACHE_DIR = Path(settings.BASE_DIR) / "tts_cache"
TTS_CACHE_DIR.mkdir(exist_ok=True)


def _get_cache_key(text: str, voice: str, rate: str = "+0%") -> str:
    """Generate a deterministic cache key for TTS."""
    key = f"{text}|{voice}|{rate}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


@shared_task(bind=True, max_retries=2)
def generate_tts(self, text: str, voice: str, rate: str = "+0%") -> dict:
    """
    Generate TTS audio file using edge-tts.

    Args:
        text: Text to synthesize
        voice: Azure voice name (e.g., "th-TH-PremwadeeNeural")
        rate: Speech rate (e.g., "+0%", "+10%", "-10%")

    Returns:
        dict: {"success": bool, "audio_path": str, "cache_key": str, "error": str}
    """
    if not text or not voice:
        return {"success": False, "error": "Text and voice are required"}

    try:
        cache_key = _get_cache_key(text, voice, rate)
        cache_path = TTS_CACHE_DIR / f"{cache_key}.mp3"

        # Return cached file if exists
        if cache_path.exists():
            logger.debug(f"TTS cache hit: {cache_key}")
            return {
                "success": True,
                "audio_path": os.path.relpath(cache_path, settings.BASE_DIR),
                "cache_key": cache_key,
            }

        # Synthesize with edge-tts
        async def _synthesize():
            communicate = edge_tts.Communicate(text, voice, rate=rate)
            await communicate.save(str(cache_path))

        asyncio.run(_synthesize())

        logger.info(f"TTS synthesized: {cache_key} ({len(text)} chars)")

        return {
            "success": True,
            "audio_path": os.path.relpath(cache_path, settings.BASE_DIR),
            "cache_key": cache_key,
        }

    except Exception as e:
        logger.exception(f"TTS generation failed for voice={voice}, text={text[:50]}")
        return {"success": False, "error": str(e)}


@shared_task(bind=True)
def debug_task(self):
    """Simple debug task to verify Celery is working."""
    logger.info("Debug task executed successfully")
    return {"status": "ok", "task_id": self.request.id}