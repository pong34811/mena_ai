"""
API views for AI VTuber system — Optimized for performance.
"""

import logging
import time
from functools import lru_cache

from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.request import Request

from .models import Character, ChatMessage, LLMProvider, TTSSettings
from .serializers import (
    CharacterSerializer,
    ChatMessageSerializer,
    ChatRequestSerializer,
    ChatResponseSerializer,
    LLMProviderSerializer,
    TTSSettingsSerializer,
)
from .services import LLMService, LLMServiceError

logger = logging.getLogger(__name__)


# ── Character cache (avoids repeated DB hits) ──────────────────────────
_character_cache = {}

def _get_character(char_id: str):
    """Get character with in-memory cache."""
    if char_id not in _character_cache:
        try:
            _character_cache[char_id] = Character.objects.only(
                'id', 'name', 'name_th', 'name_en', 'system_prompt', 'system_prompt_ai',
                'response_language', 'response_length', 'enable_per_user_memory', 'memory_duration_days'
            ).get(id=char_id)
        except Character.DoesNotExist:
            return None
    return _character_cache[char_id]


# ── Rate limiter ───────────────────────────────────────────────────────
_rate_limit_store = {}

def _check_rate_limit(key: str, max_requests: int = 5, window_seconds: int = 60) -> bool:
    now = time.time()
    if key not in _rate_limit_store:
        _rate_limit_store[key] = []
    _rate_limit_store[key] = [t for t in _rate_limit_store[key] if now - t < window_seconds]
    if len(_rate_limit_store[key]) >= max_requests:
        return False
    _rate_limit_store[key].append(now)
    return True


# ── ViewSets ───────────────────────────────────────────────────────────
class CharacterViewSet(viewsets.ModelViewSet):
    queryset = Character.objects.all()
    serializer_class = CharacterSerializer

    def perform_update(self, serializer):
        instance = serializer.save()
        _character_cache.pop(str(instance.id), None)

    def perform_destroy(self, instance):
        _character_cache.pop(str(instance.id), None)
        instance.delete()


class LLMProviderViewSet(viewsets.ModelViewSet):
    queryset = LLMProvider.objects.all()
    serializer_class = LLMProviderSerializer


class ChatMessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ChatMessage.objects.all()
    serializer_class = ChatMessageSerializer


# ── Chat endpoint ──────────────────────────────────────────────────────
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from datetime import timedelta


@csrf_exempt
@api_view(['POST'])
def chat(request: Request) -> Response:
    serializer = ChatRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    character_id = str(serializer.validated_data['character_id'])
    user_message = serializer.validated_data['message']
    user_name = serializer.validated_data.get('user_name', '')

    # Get character (cached)
    character = _get_character(character_id)
    if not character:
        return Response({'error': 'Character not found'}, status=status.HTTP_404_NOT_FOUND)

    # Build history query — only fetch needed fields
    since = timezone.now() - timedelta(days=character.memory_duration_days)
    history_filters = {
        'character': character,
        'created_at__gte': since,
    }

    if user_name and character.enable_per_user_memory:
        history_filters['user_name'] = user_name

    history = list(
        ChatMessage.objects.filter(**history_filters)
        .order_by('-created_at')
        .values('role', 'content')[:20]
    )

    # Build system prompt
    language = character.response_language or 'thai'
    system_prompt = character.system_prompt
    if character.system_prompt_ai:
        system_prompt += f"\n\n{character.system_prompt_ai}"
    
    # Replace name templates with actual names
    name_th = character.name_th or character.name
    name_en = character.name_en or character.name
    system_prompt = system_prompt.replace('{name_th}', name_th).replace('{name_en}', name_en)
    
    # Apply response_length instruction
    length_map = {
        'short': 'ตอบสั้นๆ ไม่เกิน 1-2 ประโยค หรือ 60 ตัวอักษร เหมือนสตรีมเมอร์ทั่วไป',
        'normal': 'ตอบปกติ ไม่เกิน 2-4 ประโยค หรือ 150 ตัวอักษร',
        'long': 'ตอบยาวเต็มที่ ให้รายละเอียด',
        'custom': f'ตอบตามความยาวที่กำหนด (max_tokens={character.custom_max_tokens or 1024})',
    }
    length_text = length_map.get(character.response_length, length_map['short'])
    system_prompt = system_prompt.replace('{response_length_instruction}', length_text)
    
    system_prompt += f"\n\n**สำคัญมาก: คุณต้องตอบกลับเป็นภาษา{language}เท่านั้น อย่าตอบเป็นภาษาอื่น**"

    messages = [{'role': 'system', 'content': system_prompt}]
    messages += [{'role': h['role'], 'content': h['content']} for h in reversed(history)]
    messages.append({'role': 'user', 'content': user_message})

    # Call LLM
    llm = LLMService()
    try:
        # Override max_tokens based on response_length (always use auto model)
        length_tokens = {'short': 128, 'normal': 256, 'long': 512, 'custom': character.custom_max_tokens or 512}
        max_tokens = length_tokens.get(character.response_length, 256)
        response_text = llm.chat(messages, max_tokens=max_tokens)
    except LLMServiceError as e:
        return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    # Save messages (batch)
    now = timezone.now()
    ChatMessage.objects.create(
        character=character,
        role=ChatMessage.Role.USER,
        content=user_message[:2000],  # cap length
        user_name=user_name[:100],
        created_at=now,
    )
    assistant_message = ChatMessage.objects.create(
        character=character,
        role=ChatMessage.Role.ASSISTANT,
        content=response_text[:4000],  # cap length
        user_name=user_name[:100],
    )

    return Response({
        'response': response_text,
        'character_id': character_id,
        'message_id': str(assistant_message.id),
    })


# ── Health check ───────────────────────────────────────────────────────
@api_view(['GET'])
def health_check(request: Request) -> Response:
    llm = LLMService()
    result = llm.health_check()
    return Response({
        'status': 'ok',
        'llm_api': 'connected' if result['reachable'] else 'disconnected',
        'models_available': result['models_available'],
        'models': result['models'],
        'selected_model': result['selected_model'],
    })


@api_view(['GET'])
def llm_status(request: Request) -> Response:
    llm = LLMService()
    return Response(llm.get_status())


# ── Generate AI prompt ─────────────────────────────────────────────────
@csrf_exempt
@api_view(['POST'])
def generate_character_prompt(request: Request, character_id: str) -> Response:
    # Rate limit
    if not _check_rate_limit(f'generate_prompt_{character_id}', max_requests=5, window_seconds=60):
        return Response({'error': 'Rate limit exceeded.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    try:
        import uuid
        uuid.UUID(character_id)
    except ValueError:
        return Response({'error': 'Invalid character ID'}, status=status.HTTP_404_NOT_FOUND)

    character = _get_character(character_id)
    if not character:
        return Response({'error': 'Character not found'}, status=status.HTTP_404_NOT_FOUND)

    # Count messages efficiently
    total_messages = ChatMessage.objects.filter(character=character).count()
    if total_messages < 5:
        return Response(
            {'error': f'Need at least 5 messages. Current: {total_messages}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Fetch last 50 messages with only needed fields
    recent = ChatMessage.objects.filter(
        character=character
    ).order_by('-created_at').values('role', 'content', 'user_name')[:50]

    # Build conversation text (oldest first, capped at 12000 chars)
    conversation_parts = []
    total_chars = 0
    for msg in reversed(list(recent)):
        role_label = "VTuber" if msg['role'] == "assistant" else "Viewer"
        user_label = f"[{msg['user_name']}]" if msg['user_name'] else ""
        line = f"{role_label}{user_label}: {msg['content']}\n"
        if total_chars + len(line) > 12000:
            break
        conversation_parts.append(line)
        total_chars += len(line)

    conversation_text = "".join(conversation_parts)

    # Compact analysis prompt
    analysis_prompt = f"""Analyze this VTuber chat history and create a detailed character prompt in Thai.

Character: {character.name}
System prompt: {character.system_prompt}

Chat ({len(recent)} messages):
{conversation_text}

Output ONLY the prompt text covering: personality, speaking style, favorite phrases, viewer interaction style, emotional range. Write in Thai."""

    llm = LLMService()
    try:
        generated_prompt = llm.chat([
            {"role": "system", "content": "You are a VTuber character designer. Output ONLY the prompt text in Thai."},
            {"role": "user", "content": analysis_prompt},
        ])
        return Response({
            'system_prompt_ai': generated_prompt,
            'messages_analyzed': len(recent),
            'total_messages': total_messages,
        })
    except LLMServiceError as e:
        return Response({'error': str(e)}, status=status.HTTP_502_BAD_GATEWAY)
