"""
API views for AI VTuber system.
"""

import logging

from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.request import Request

from .models import Character, ChatMessage, LLMProvider
from .serializers import (
    CharacterSerializer,
    ChatMessageSerializer,
    ChatRequestSerializer,
    ChatResponseSerializer,
    LLMProviderSerializer,
)
from .services import LLMService, LLMServiceError

logger = logging.getLogger(__name__)


class CharacterViewSet(viewsets.ModelViewSet):
    """CRUD for AI VTuber characters."""
    
    queryset = Character.objects.all()
    serializer_class = CharacterSerializer


class LLMProviderViewSet(viewsets.ModelViewSet):
    """CRUD for LLM provider configurations."""
    
    queryset = LLMProvider.objects.all()
    serializer_class = LLMProviderSerializer


class ChatMessageViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for chat messages."""
    
    queryset = ChatMessage.objects.all()
    serializer_class = ChatMessageSerializer


from django.views.decorators.csrf import csrf_exempt


@csrf_exempt
@api_view(['POST'])
def chat(request: Request) -> Response:
    """
    Chat endpoint - sends message to LLM and returns response.
    
    Expected payload:
    {
        "character_id": "uuid",
        "message": "user message",
        "stream": false
    }
    """
    serializer = ChatRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    character_id = serializer.validated_data['character_id']
    user_message = serializer.validated_data['message']
    
    # Get character
    try:
        character = Character.objects.get(id=character_id)
    except Character.DoesNotExist:
        return Response(
            {'error': 'Character not found'},
            status=status.HTTP_404_NOT_FOUND,
        )
    
    # Build messages with recent conversation history (last 20, capped for latency)
    history = list(
        ChatMessage.objects.filter(character=character)
        .order_by('-created_at')
        .values('role', 'content')[:20]
    )
    
    # Inject language instruction into system prompt
    language = character.response_language or 'thai'
    language_instruction = f"\n\n**สำคัญมาก: คุณต้องตอบกลับเป็นภาษา{language}เท่านั้น อย่าตอบเป็นภาษาอื่น**"
    system_prompt = character.system_prompt + language_instruction
    
    messages = [{'role': 'system', 'content': system_prompt}]
    messages += [{'role': h['role'], 'content': h['content']} for h in reversed(history)]
    messages.append({'role': 'user', 'content': user_message})
    
    # Call LLM with auto model selection
    llm = LLMService()
    try:
        response_text = llm.chat(messages)
    except LLMServiceError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    
    # Save messages
    ChatMessage.objects.create(
        character=character,
        role=ChatMessage.Role.USER,
        content=user_message,
    )
    assistant_message = ChatMessage.objects.create(
        character=character,
        role=ChatMessage.Role.ASSISTANT,
        content=response_text,
    )
    
    return Response({
        'response': response_text,
        'character_id': str(character.id),
        'message_id': str(assistant_message.id),
    })


@api_view(['GET'])
def health_check(request: Request) -> Response:
    """Health check endpoint with model info."""
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
    """LLM service status endpoint."""
    llm = LLMService()
    return Response(llm.get_status())
