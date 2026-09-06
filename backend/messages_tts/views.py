"""
API views for messages_tts.
"""

import logging

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from .models import TTSSettings

logger = logging.getLogger(__name__)


@api_view(['GET'])
def tts_settings_get(request: Request) -> Response:
    """Get current TTS settings."""
    settings = TTSSettings.get_instance()
    return Response({
        'questioner_enabled': settings.questioner_enabled,
        'questioner_voice': settings.questioner_voice,
        'questioner_rate': settings.questioner_rate,
        'questioner_say_username': settings.questioner_say_username,
        'responder_enabled': settings.responder_enabled,
        'responder_voice': settings.responder_voice,
        'responder_rate': settings.responder_rate,
        'responder_delay_ms': settings.responder_delay_ms,
    })


@api_view(['PATCH'])
def tts_settings_update(request: Request) -> Response:
    """Update TTS settings (partial update)."""
    settings = TTSSettings.get_instance()

    fields = [
        'questioner_enabled', 'questioner_voice', 'questioner_rate', 'questioner_say_username',
        'responder_enabled', 'responder_voice', 'responder_rate', 'responder_delay_ms',
    ]

    for field in fields:
        if field in request.data:
            setattr(settings, field, request.data[field])

    settings.save()

    return Response({
        'questioner_enabled': settings.questioner_enabled,
        'questioner_voice': settings.questioner_voice,
        'questioner_rate': settings.questioner_rate,
        'questioner_say_username': settings.questioner_say_username,
        'responder_enabled': settings.responder_enabled,
        'responder_voice': settings.responder_voice,
        'responder_rate': settings.responder_rate,
        'responder_delay_ms': settings.responder_delay_ms,
    })
