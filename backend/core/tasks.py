"""
Celery tasks for core app.

TTS generation is offloaded to Celery workers to avoid blocking HTTP requests.
"""

import logging
import os

from celery import shared_task
from django.conf import settings

from core.tts_service import TTSService

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2)
def generate_tts(self, text: str, voice: str, rate: str = "+0%") -> dict:
    """
    Generate TTS audio file via the local Piper sidecar.

    Delegates to TTSService so emoji stripping, cache keying and retry logic
    stay identical to the HTTP API path (single shared TTS pipeline).

    Args:
        text: Text to synthesize
        voice: Voice id (any legacy edge id is aliased to the piper voice)
        rate: Speech rate (e.g., "+0%", "+10%", "-10%")

    Returns:
        dict: {"success": bool, "audio_path": str, "cache_key": str, "error": str}
    """
    if not text or not voice:
        return {"success": False, "error": "Text and voice are required"}

    try:
        service = TTSService(voice=voice, rate=rate)
        cache_path = service.generate(text, use_cache=True)
        if cache_path is None:
            logger.error("TTS generation failed for voice=%s", voice)
            return {"success": False, "error": "TTS generation failed"}

        return {
            "success": True,
            "audio_path": os.path.relpath(cache_path, settings.BASE_DIR),
            "cache_key": cache_path.stem,
        }

    except Exception as e:
        logger.exception("TTS generation failed for voice=%s, text=%s", voice, text[:50])
        return {"success": False, "error": str(e)}


@shared_task(bind=True)
def debug_task(self):
    """Simple debug task to verify Celery is working."""
    logger.info("Debug task executed successfully")
    return {"status": "ok", "task_id": self.request.id}