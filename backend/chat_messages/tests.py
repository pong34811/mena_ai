"""Tests for chat_messages models and views."""

import uuid
from unittest import mock

import pytest
from django.test import RequestFactory
from rest_framework import status

from chat_messages.models import ChatMessage, YouTubeLiveChatSession, YouTubeChatMessage
from chat_messages.views import (
    ChatMessageViewSet,
    YouTubeLiveChatSessionViewSet,
    YouTubeChatMessageViewSet,
    start_youtube_chat,
    stop_youtube_chat,
    youtube_chat_status,
)
from chat_messages.serializers import (
    ChatMessageSerializer,
    YouTubeChatMessageSerializer,
    YouTubeLiveChatSessionSerializer,
    YouTubeChatStartSerializer,
)


@pytest.mark.django_db
class TestChatMessageModel:
    """Tests for the ChatMessage model."""

    def test_create_chat_message(self, character):
        msg = ChatMessage.objects.create(
            character=character,
            role=ChatMessage.Role.USER,
            content="Hello!",
            user_name="testuser",
        )
        assert msg.id is not None
        assert msg.character == character
        assert msg.role == "user"
        assert msg.content == "Hello!"
        assert msg.user_name == "testuser"

    def test_str_representation(self, character):
        msg = ChatMessage.objects.create(
            character=character,
            role=ChatMessage.Role.ASSISTANT,
            content="Hi there! This is a long message that should be truncated.",
        )
        assert "Mena" in str(msg)
        assert "assistant" in str(msg)

    def test_role_choices(self, character):
        user_msg = ChatMessage.objects.create(
            character=character, role=ChatMessage.Role.USER, content="user"
        )
        assistant_msg = ChatMessage.objects.create(
            character=character, role=ChatMessage.Role.ASSISTANT, content="assistant"
        )
        system_msg = ChatMessage.objects.create(
            character=character, role=ChatMessage.Role.SYSTEM, content="system"
        )
        assert user_msg.role == "user"
        assert assistant_msg.role == "assistant"
        assert system_msg.role == "system"

    def test_ordering(self, character):
        msg1 = ChatMessage.objects.create(
            character=character, role=ChatMessage.Role.USER, content="first"
        )
        msg2 = ChatMessage.objects.create(
            character=character, role=ChatMessage.Role.USER, content="second"
        )
        messages = list(ChatMessage.objects.filter(character=character))
        assert messages[0].content == "first"
        assert messages[1].content == "second"

    def test_user_name_default_empty(self, character):
        msg = ChatMessage.objects.create(
            character=character, role=ChatMessage.Role.USER, content="test"
        )
        assert msg.user_name == ""


@pytest.mark.django_db
class TestYouTubeLiveChatSessionModel:
    """Tests for the YouTubeLiveChatSession model."""

    def test_create_session(self, character):
        session = YouTubeLiveChatSession.objects.create(
            video_id="abc123",
            character=character,
            status=YouTubeLiveChatSession.Status.ACTIVE,
            auto_reply=True,
        )
        assert session.id is not None
        assert session.video_id == "abc123"
        assert session.character == character
        assert session.status == "active"
        assert session.auto_reply is True
        assert session.messages_received == 0
        assert session.replies_sent == 0

    def test_default_status(self, character):
        session = YouTubeLiveChatSession.objects.create(
            video_id="xyz789", character=character
        )
        assert session.status == "active"

    def test_str_representation(self, character):
        session = YouTubeLiveChatSession.objects.create(
            video_id="test123", character=character
        )
        assert "test123" in str(session)
        assert "Mena" in str(session)


@pytest.mark.django_db
class TestYouTubeChatMessageModel:
    """Tests for the YouTubeChatMessage model."""

    def test_create_message(self, character):
        session = YouTubeLiveChatSession.objects.create(
            video_id="vid1", character=character
        )
        msg = YouTubeChatMessage.objects.create(
            session=session,
            author_name="viewer1",
            text="Hello from YouTube!",
            is_mod=False,
            is_owner=False,
            is_super_chat=False,
        )
        assert msg.id is not None
        assert msg.session == session
        assert msg.author_name == "viewer1"
        assert msg.text == "Hello from YouTube!"
        assert msg.is_mod is False
        assert msg.is_owner is False
        assert msg.is_super_chat is False
        assert msg.ai_responded is False

    def test_ai_response_fields(self, character):
        session = YouTubeLiveChatSession.objects.create(
            video_id="vid2", character=character
        )
        msg = YouTubeChatMessage.objects.create(
            session=session,
            author_name="viewer2",
            text="Test",
            ai_response="AI reply here",
            ai_responded=True,
        )
        assert msg.ai_responded is True
        assert msg.ai_response == "AI reply here"

    def test_str_representation(self, character):
        session = YouTubeLiveChatSession.objects.create(
            video_id="vid3", character=character
        )
        msg = YouTubeChatMessage.objects.create(
            session=session, author_name="long_name_viewer", text="A very long message that should be truncated in str"
        )
        assert "long_name_viewer" in str(msg)


@pytest.mark.django_db
class TestChatMessageSerializer:
    """Tests for ChatMessageSerializer."""

    def test_serialize(self, chat_message):
        serializer = ChatMessageSerializer(chat_message)
        data = serializer.data
        assert data["content"] == "สวัสดีจ้า"
        assert data["role"] == "user"
        assert data["user_name"] == "testuser"
        assert "id" in data
        assert "created_at" in data

    def test_deserialize(self, character):
        payload = {
            "character": str(character.id),
            "role": "user",
            "content": "Hello!",
            "user_name": "testuser",
        }
        serializer = ChatMessageSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors
        msg = serializer.save()
        assert msg.content == "Hello!"

    def test_read_only_fields(self, chat_message):
        serializer = ChatMessageSerializer(chat_message, data={"content": "updated", "id": str(uuid.uuid4())})
        # id and created_at should be read-only
        assert "id" in serializer.fields
        assert serializer.fields["id"].read_only
        assert serializer.fields["created_at"].read_only


@pytest.mark.django_db
class TestYouTubeChatStartSerializer:
    """Tests for YouTubeChatStartSerializer."""

    def test_valid_payload(self):
        payload = {"video_id": "abc123", "auto_reply": True}
        serializer = YouTubeChatStartSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["video_id"] == "abc123"
        assert serializer.validated_data["auto_reply"] is True

    def test_video_id_required(self):
        serializer = YouTubeChatStartSerializer(data={"auto_reply": False})
        assert not serializer.is_valid()
        assert "video_id" in serializer.errors

    def test_auto_reply_default_false(self):
        payload = {"video_id": "xyz"}
        serializer = YouTubeChatStartSerializer(data=payload)
        assert serializer.is_valid()
        assert serializer.validated_data["auto_reply"] is False

    def test_character_id_optional(self):
        payload = {"video_id": "abc", "character_id": str(uuid.uuid4())}
        serializer = YouTubeChatStartSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors

    def test_invalid_character_id(self):
        payload = {"video_id": "abc", "character_id": "not-a-uuid"}
        serializer = YouTubeChatStartSerializer(data=payload)
        assert not serializer.is_valid()
        assert "character_id" in serializer.errors


@pytest.mark.django_db
class TestYouTubeLiveChatSessionSerializer:
    """Tests for YouTubeLiveChatSessionSerializer."""

    def test_serialize(self, character):
        session = YouTubeLiveChatSession.objects.create(
            video_id="vid1", character=character
        )
        serializer = YouTubeLiveChatSessionSerializer(session)
        data = serializer.data
        assert data["video_id"] == "vid1"
        assert data["status"] == "active"
        assert "character_name" in data
        assert "messages" in data


@pytest.mark.django_db
class TestYouTubeChatMessageSerializer:
    """Tests for YouTubeChatMessageSerializer."""

    def test_serialize(self, character):
        session = YouTubeLiveChatSession.objects.create(
            video_id="vid1", character=character
        )
        msg = YouTubeChatMessage.objects.create(
            session=session, author_name="viewer", text="Hello"
        )
        serializer = YouTubeChatMessageSerializer(msg)
        data = serializer.data
        assert data["author_name"] == "viewer"
        assert data["text"] == "Hello"
        assert "id" in data
        assert "received_at" in data


@pytest.mark.django_db
class TestChatMessageViewSet:
    """Tests for ChatMessageViewSet."""

    def test_list_messages(self, chat_message):
        factory = RequestFactory()
        request = factory.get("/api/messages/")
        view = ChatMessageViewSet.as_view({"get": "list"})
        response = view(request)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_retrieve_message(self, chat_message):
        factory = RequestFactory()
        request = factory.get(f"/api/messages/{chat_message.id}/")
        view = ChatMessageViewSet.as_view({"get": "retrieve"})
        response = view(request, pk=chat_message.id)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["content"] == "สวัสดีจ้า"


@pytest.mark.django_db
class TestYouTubeChatMessageViewSet:
    """Tests for YouTubeChatMessageViewSet."""

    def test_filter_by_session(self, character):
        session = YouTubeLiveChatSession.objects.create(
            video_id="vid1", character=character
        )
        msg1 = YouTubeChatMessage.objects.create(
            session=session, author_name="v1", text="msg1"
        )
        msg2 = YouTubeChatMessage.objects.create(
            session=session, author_name="v2", text="msg2"
        )
        factory = RequestFactory()
        request = factory.get(f"/api/yt-messages/?session_id={session.id}")
        view = YouTubeChatMessageViewSet.as_view({"get": "list"})
        response = view(request)
        assert response.status_code == status.HTTP_200_OK
        # DRF paginates by default - check results
        assert len(response.data["results"]) == 2


@pytest.mark.django_db
class TestStartYouTubeChat:
    """Tests for start_youtube_chat view."""

    def test_start_session_success(self, character, mock_character_cache, monkeypatch):
        # Mock the session manager
        mock_manager = mock.Mock()
        mock_manager.is_active = False
        # Mock serializer to avoid issues with mock session
        monkeypatch.setattr(
            "chat_messages.views.YouTubeLiveChatSessionSerializer",
            lambda *a, **k: mock.Mock(data={"video_id": "abc123", "status": "active"}),
        )
        mock_session = mock.Mock()
        mock_manager.start_session.return_value = mock_session

        monkeypatch.setattr("chat_messages.views.session_manager", mock_manager)

        factory = RequestFactory()
        request = factory.post(
            "/api/yt-chat/start/",
            {"video_id": "abc123", "character_id": str(character.id)},
            content_type="application/json",
        )
        response = start_youtube_chat(request)
        assert response.status_code == status.HTTP_201_CREATED
        mock_manager.start_session.assert_called_once()

    def test_start_session_already_active(self, character, mock_character_cache, monkeypatch):
        mock_manager = mock.Mock()
        mock_manager.is_active = True
        monkeypatch.setattr("chat_messages.views.session_manager", mock_manager)

        factory = RequestFactory()
        request = factory.post(
            "/api/yt-chat/start/",
            {"video_id": "abc123", "character_id": str(character.id)},
            content_type="application/json",
        )
        response = start_youtube_chat(request)
        assert response.status_code == status.HTTP_409_CONFLICT

    def test_start_session_invalid_video_id(self, mock_character_cache):
        factory = RequestFactory()
        request = factory.post(
            "/api/yt-chat/start/",
            {"video_id": ""},  # empty video_id
            content_type="application/json",
        )
        response = start_youtube_chat(request)
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestStopYouTubeChat:
    """Tests for stop_youtube_chat view."""

    def test_stop_active_session(self, monkeypatch):
        mock_manager = mock.Mock()
        mock_manager.is_active = True
        monkeypatch.setattr("chat_messages.views.session_manager", mock_manager)

        factory = RequestFactory()
        request = factory.post("/api/yt-chat/stop/")
        response = stop_youtube_chat(request)
        assert response.status_code == status.HTTP_200_OK
        mock_manager.stop_session.assert_called_once()

    def test_stop_no_active_session(self, monkeypatch):
        mock_manager = mock.Mock()
        mock_manager.is_active = False
        monkeypatch.setattr("chat_messages.views.session_manager", mock_manager)

        factory = RequestFactory()
        request = factory.post("/api/yt-chat/stop/")
        response = stop_youtube_chat(request)
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestYouTubeChatStatus:
    """Tests for youtube_chat_status view."""

    def test_status_active(self, monkeypatch):
        mock_manager = mock.Mock()
        mock_manager.is_active = True
        monkeypatch.setattr(
            "chat_messages.views.YouTubeLiveChatSessionSerializer",
            lambda *a, **k: mock.Mock(data={"video_id": "abc", "status": "active"}),
        )
        mock_session = mock.Mock()
        mock_manager.current_session = mock_session
        monkeypatch.setattr("chat_messages.views.session_manager", mock_manager)

        factory = RequestFactory()
        request = factory.get("/api/yt-chat/status/")
        response = youtube_chat_status(request)
        assert response.status_code == status.HTTP_200_OK

    def test_status_inactive(self, monkeypatch):
        mock_manager = mock.Mock()
        mock_manager.is_active = False
        monkeypatch.setattr("chat_messages.views.session_manager", mock_manager)

        factory = RequestFactory()
        request = factory.get("/api/yt-chat/status/")
        response = youtube_chat_status(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["active"] is False
