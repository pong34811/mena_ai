"""
TTS API views for AI VTuber system.

Provides endpoints for text-to-speech conversion with edge-tts.
"""

import logging
from pathlib import Path

from django.http import FileResponse, HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from .tts_service import TTSService, get_voices_for_language, get_all_voices, DEFAULT_VOICE

logger = logging.getLogger(__name__)


@api_view(['POST'])
def tts_generate(request: Request) -> Response:
    """
    Generate speech from text.
    
    Request body:
        - text: Text to convert to speech (required)
        - voice: Voice ID (optional, default: th-TH-Neural2-A)
        - rate: Speech rate adjustment (optional, default: +0%)
        - format: Response format - 'file' or 'json' (optional, default: file)
    
    Returns:
        MP3 audio file or JSON with audio data
    """
    text = request.data.get('text', '').strip()
    voice = request.data.get('voice', DEFAULT_VOICE)
    rate = request.data.get('rate', '+0%')
    response_format = request.data.get('format', 'file')
    
    if not text:
        return Response(
            {'error': 'Text is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if len(text) > 5000:
        return Response(
            {'error': 'Text too long (max 5000 characters)'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        tts = TTSService(voice=voice, rate=rate)
        
        if response_format == 'json':
            # Return base64-encoded audio in JSON
            import base64
            audio_bytes = tts.get_audio_bytes(text)
            if audio_bytes is None:
                return Response(
                    {'error': 'TTS generation failed'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
            return Response({
                'audio': audio_b64,
                'format': 'mp3',
                'voice': voice,
                'text_length': len(text),
            })
        else:
            # Return audio file directly
            cache_path = tts.generate(text)
            if cache_path is None:
                return Response(
                    {'error': 'TTS generation failed'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            response = FileResponse(
                open(cache_path, 'rb'),
                content_type='audio/mpeg',
                as_attachment=False,
            )
            response['Content-Disposition'] = f'inline; filename="tts_{cache_path.stem}.mp3"'
            return response
            
    except Exception as e:
        logger.error(f"TTS endpoint error: {e}")
        return Response(
            {'error': f'TTS generation failed: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def tts_voices(request: Request) -> Response:
    """
    Get available TTS voices.
    
    Query params:
        - language: Filter by language (optional)
    
    Returns:
        List of available voices
    """
    language = request.query_params.get('language', '')
    
    if language:
        voices = get_voices_for_language(language)
    else:
        voices = get_all_voices()
    
    return Response({
        'voices': voices,
        'default_voice': DEFAULT_VOICE,
    })


@api_view(['POST'])
def tts_chat_message(request: Request) -> Response:
    """
    Generate TTS for a chat message with character voice settings.
    
    Request body:
        - text: Message text (required)
        - character_id: Character ID to use voice settings (optional)
        - voice: Override voice ID (optional)
        - rate: Speech rate (optional)
    
    Returns:
        MP3 audio file
    """
    text = request.data.get('text', '').strip()
    character_id = request.data.get('character_id')
    voice = request.data.get('voice')
    rate = request.data.get('rate', '+0%')
    
    if not text:
        return Response(
            {'error': 'Text is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Try to get character's preferred voice
    if character_id and not voice:
        try:
            from .models import Character
            character = Character.objects.get(id=character_id)
            # Use character response language to pick voice
            language = character.response_language or 'thai'
            voices = get_voices_for_language(language)
            if voices:
                voice = voices[0]['id']
        except Exception:
            pass
    
    if not voice:
        voice = DEFAULT_VOICE
    
    try:
        tts = TTSService(voice=voice, rate=rate)
        cache_path = tts.generate(text)
        
        if cache_path is None:
            return Response(
                {'error': 'TTS generation failed'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        response = FileResponse(
            open(cache_path, 'rb'),
            content_type='audio/mpeg',
            as_attachment=False,
        )
        response['Content-Disposition'] = f'inline; filename="tts_{cache_path.stem}.mp3"'
        return response
        
    except Exception as e:
        logger.error(f"TTS chat message error: {e}")
        return Response(
            {'error': f'TTS generation failed: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
