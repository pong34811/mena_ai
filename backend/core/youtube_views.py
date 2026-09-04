"""
YouTube Chat API views — Optimized for performance.
"""

import logging
import threading
from typing import Optional
from collections import defaultdict

from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.request import Request

from .youtube_models import YouTubeLiveChatSession, YouTubeChatMessage
from .youtube_serializers import (
    YouTubeLiveChatSessionSerializer,
    YouTubeChatMessageSerializer,
    YouTubeChatStartSerializer,
)
from .youtube_chat import YouTubeLiveChatService, ChatMessage
from .services import LLMService, LLMServiceError
from .views import _get_character

logger = logging.getLogger(__name__)


class YouTubeChatSessionManager:
    """Singleton manager for active YouTube chat sessions."""

    _instance: Optional["YouTubeChatSessionManager"] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._service = None
                    cls._instance._db_session = None
                    cls._instance._llm = None
                    cls._instance._character = None
                    cls._instance._video_id = None
        return cls._instance

    def start_session(self, video_id: str, character, auto_reply: bool = False) -> YouTubeLiveChatSession:
        if self._service and self._service._running:
            self.stop_session()

        db_session = YouTubeLiveChatSession.objects.create(
            video_id=video_id,
            character=character,
            status=YouTubeLiveChatSession.Status.ACTIVE,
            auto_reply=auto_reply,
        )

        self._llm = LLMService() if auto_reply else None
        self._character = character
        self._video_id = video_id

        # Pre-build system prompt (avoid rebuilding per message)
        language = character.response_language or "thai"
        self._base_system_prompt = character.system_prompt
        if character.system_prompt_ai:
            self._base_system_prompt += "\n\n" + character.system_prompt_ai
        self._base_system_prompt += f"\n\n**สำคัญมาก: คุณต้องตอบกลับเป็นภาษา{language}เท่านั้น**"

        # Cache for per-author history (avoid repeated DB queries)
        self._author_history_cache = defaultdict(list)
        self._cache_max_per_author = 20

        self._service = YouTubeLiveChatService(video_id=video_id)
        self._db_session = db_session

        def on_message(msg: ChatMessage):
            yt_msg = YouTubeChatMessage.objects.create(
                session=db_session,
                author_name=msg.author_name,
                author_channel_id=msg.author_channel_id,
                text=msg.text[:2000],
                is_mod=msg.is_mod,
                is_owner=msg.is_owner,
                is_super_chat=msg.is_super_chat,
            )
            db_session.messages_received += 1
            db_session.save(update_fields=["messages_received"])

            if auto_reply and self._llm and self._character:
                try:
                    messages = [{"role": "system", "content": self._base_system_prompt}]

                    if self._character.enable_per_user_memory:
                        # Use cache if available, otherwise query DB
                        cache_key = msg.author_name
                        if cache_key not in self._author_history_cache:
                            from django.utils import timezone
                            from datetime import timedelta
                            since = timezone.now() - timedelta(days=self._character.memory_duration_days)
                            past = YouTubeChatMessage.objects.filter(
                                session__video_id=self._video_id,
                                author_name=msg.author_name,
                                received_at__gte=since,
                            ).order_by("-received_at").values("author_name", "text", "ai_responded", "ai_response")[:20]
                            self._author_history_cache[cache_key] = list(past)

                        # Add cached history (oldest first)
                        for past in reversed(self._author_history_cache[cache_key]):
                            messages.append({"role": "user", "content": f"[{past['author_name']}]: {past['text']}"})
                            if past["ai_responded"] and past["ai_response"]:
                                messages.append({"role": "assistant", "content": past["ai_response"]})

                    messages.append({"role": "user", "content": f"[{msg.author_name}]: {msg.text}"})

                    response = self._llm.chat(messages)
                    yt_msg.ai_response = response[:4000]
                    yt_msg.ai_responded = True
                    yt_msg.save(update_fields=["ai_response", "ai_responded"])
                    db_session.replies_sent += 1
                    db_session.save(update_fields=["replies_sent"])

                    # Update cache
                    self._author_history_cache[cache_key].append({
                        "author_name": msg.author_name,
                        "text": msg.text,
                        "ai_responded": True,
                        "ai_response": response[:4000],
                    })
                    # Trim cache if too large
                    if len(self._author_history_cache[cache_key]) > self._cache_max_per_author:
                        self._author_history_cache[cache_key] = self._author_history_cache[cache_key][-self._cache_max_per_author:]

                    logger.info(f"AI replied to {msg.author_name}: {response[:50]}")
                except LLMServiceError as e:
                    logger.error(f"LLM error: {e}")

        self._service.on_message(on_message)
        self._service.start(blocking=False)
        return db_session

    def stop_session(self):
        if self._service:
            self._service.stop()
        if self._db_session:
            from django.utils import timezone
            self._db_session.status = YouTubeLiveChatSession.Status.STOPPED
            self._db_session.stopped_at = timezone.now()
            self._db_session.save(update_fields=["status", "stopped_at"])
        self._author_history_cache = defaultdict(list)

    @property
    def is_active(self) -> bool:
        return self._service is not None and self._service._running

    @property
    def current_session(self) -> Optional[YouTubeLiveChatSession]:
        return self._db_session


session_manager = YouTubeChatSessionManager()


@api_view(["POST"])
def start_youtube_chat(request: Request) -> Response:
    serializer = YouTubeChatStartSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    video_id = serializer.validated_data["video_id"]
    character_id = serializer.validated_data.get("character_id")
    auto_reply = serializer.validated_data.get("auto_reply", False)

    if character_id:
        character = _get_character(str(character_id))
        if not character:
            return Response({"error": "Character not found"}, status=status.HTTP_404_NOT_FOUND)
    else:
        from .models import Character
        character = Character.objects.filter(is_active=True).only(
            'id', 'name', 'system_prompt', 'system_prompt_ai',
            'response_language', 'enable_per_user_memory', 'memory_duration_days'
        ).first()
        if not character:
            return Response({"error": "No active characters found"}, status=status.HTTP_400_BAD_REQUEST)

    if session_manager.is_active:
        return Response({"error": "A session is already active. Stop it first."}, status=status.HTTP_409_CONFLICT)

    db_session = session_manager.start_session(video_id=video_id, character=character, auto_reply=auto_reply)
    return Response(YouTubeLiveChatSessionSerializer(db_session).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def stop_youtube_chat(request: Request) -> Response:
    if not session_manager.is_active:
        return Response({"error": "No active session"}, status=status.HTTP_404_NOT_FOUND)
    session_manager.stop_session()
    return Response({"status": "stopped"})


@api_view(["GET"])
def youtube_chat_status(request: Request) -> Response:
    if session_manager.is_active and session_manager.current_session:
        return Response(YouTubeLiveChatSessionSerializer(session_manager.current_session).data)
    return Response({"active": False})


class YouTubeLiveChatSessionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = YouTubeLiveChatSession.objects.all()
    serializer_class = YouTubeLiveChatSessionSerializer


class YouTubeChatMessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = YouTubeChatMessage.objects.all()
    serializer_class = YouTubeChatMessageSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        session_id = self.request.query_params.get("session_id")
        if session_id:
            queryset = queryset.filter(session_id=session_id)
        return queryset
