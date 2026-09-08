"""
Tests for WebSocket consumers (ChatStreamConsumer, YouTubeChatConsumer).

Uses channels.testing for in-memory WebSocket testing.
"""

import asyncio
import json
import uuid
from unittest import mock
from unittest.mock import AsyncMock

import pytest
from channels.testing import WebsocketCommunicator

from core.consumers import ChatStreamConsumer, YouTubeChatConsumer
from core.services import LLMServiceError

# Keep the original method so patched tests can restore it.
_ORIGINAL_HANDLE_CHAT = ChatStreamConsumer.handle_chat


@pytest.fixture
def restore_handle_chat():
    """Restore ChatStreamConsumer.handle_chat after a test patches it."""
    yield
    ChatStreamConsumer.handle_chat = _ORIGINAL_HANDLE_CHAT


@pytest.fixture
def mock_channel_layer():
    """Patch the channel layer used by consumers.

    InMemoryChannelLayer has no group support, so YouTubeChatConsumer
    (which joins a group on connect) needs a layer stub in tests.
    The stub's receive() drains an asyncio queue so tests can inject
    group events exactly like a real channel layer would.
    """
    incoming = asyncio.Queue()

    async def _receive(channel_name=None):
        return await incoming.get()

    layer = mock.Mock()
    # RedisChannelLayer group API: group_add/group_discard (async).
    layer.group_add = AsyncMock()
    layer.group_discard = AsyncMock()
    layer.send = AsyncMock()
    layer.channel_name = "test-channel"
    layer.new_channel = AsyncMock(return_value="test-channel")
    layer.receive = _receive
    layer.incoming = incoming
    with mock.patch("channels.consumer.get_channel_layer", return_value=layer):
        yield layer


@pytest.mark.django_db
@pytest.mark.asyncio
class TestChatStreamConsumer:
    """Tests for ChatStreamConsumer WebSocket."""

    async def test_connect_and_accept(self):
        """Test that client can connect and receives connected message."""
        communicator = WebsocketCommunicator(ChatStreamConsumer.as_asgi(), "/ws/chat/")
        connected, _ = await communicator.connect()
        assert connected is True

        # Should receive a "connected" message
        response = await communicator.receive_from()
        data = json.loads(response)
        assert data["type"] == "connected"

        await communicator.disconnect()

    async def test_handle_chat_success(self, character, restore_handle_chat):
        """Test successful chat message processing with LLM streaming."""
        # Patch handle_chat to simulate streaming tokens + done frame.
        async def mock_handle_chat(self, data):
            await self.send(text_data=json.dumps({"type": "token", "content": "Hello"}))
            await self.send(text_data=json.dumps({"type": "token", "content": " World!"}))
            await self.send(
                text_data=json.dumps(
                    {"type": "done", "message_id": str(uuid.uuid4()), "content": "Hello World!"}
                )
            )

        ChatStreamConsumer.handle_chat = mock_handle_chat

        communicator = WebsocketCommunicator(ChatStreamConsumer.as_asgi(), "/ws/chat/")
        await communicator.connect()
        await communicator.receive_from()  # consume "connected"

        payload = {
            "type": "chat",
            "character_id": str(character.id),
            "message": "Hello",
            "user_name": "testuser",
        }
        await communicator.send_to(text_data=json.dumps(payload))

        response1 = await communicator.receive_from()
        data1 = json.loads(response1)
        assert data1["type"] == "token"

        response2 = await communicator.receive_from()
        data2 = json.loads(response2)
        assert data2["type"] == "token"

        response3 = await communicator.receive_from()
        data3 = json.loads(response3)
        assert data3["type"] == "done"
        assert "message_id" in data3
        assert "content" in data3

        await communicator.disconnect()

    async def test_handle_chat_missing_fields(self, character):
        """Test that missing required fields return error."""
        communicator = WebsocketCommunicator(ChatStreamConsumer.as_asgi(), "/ws/chat/")
        await communicator.connect()
        await communicator.receive_from()  # consume "connected"

        # Missing character_id
        payload = {"type": "chat", "message": "Hello"}
        await communicator.send_to(text_data=json.dumps(payload))

        response = await communicator.receive_from()
        data = json.loads(response)
        assert data["type"] == "error"
        assert "character_id and message are required" in data["error"]

        await communicator.disconnect()

    async def test_handle_chat_invalid_uuid(self, character):
        """Test that invalid UUID format returns error."""
        communicator = WebsocketCommunicator(ChatStreamConsumer.as_asgi(), "/ws/chat/")
        await communicator.connect()
        await communicator.receive_from()  # consume "connected"

        payload = {"type": "chat", "character_id": "not-a-uuid", "message": "Hello"}
        await communicator.send_to(text_data=json.dumps(payload))

        response = await communicator.receive_from()
        data = json.loads(response)
        assert data["type"] == "error"
        assert "Invalid character_id format" in data["error"]

        await communicator.disconnect()

    async def test_handle_chat_character_not_found(self, character):
        """Test that non-existent character returns error."""
        communicator = WebsocketCommunicator(ChatStreamConsumer.as_asgi(), "/ws/chat/")
        await communicator.connect()
        await communicator.receive_from()  # consume "connected"

        non_existent_uuid = str(uuid.uuid4())
        payload = {"type": "chat", "character_id": non_existent_uuid, "message": "Hello"}
        await communicator.send_to(text_data=json.dumps(payload))

        response = await communicator.receive_from()
        data = json.loads(response)
        assert data["type"] == "error"
        assert "Character not found" in data["error"]

        await communicator.disconnect()

    async def test_handle_chat_llm_error(self, transactional_db, monkeypatch):
        """Test that an LLM failure during streaming is converted into an
        error frame by the real handle_chat's exception handling.

        transactional_db is required because the consumer reads the DB from
        a worker thread with its own connection — it can only see committed
        rows, not the test's rolled-back transaction. The character is
        created directly here (committed) rather than via the fixture.

        We make the HTTP call inside the stream thread fail, so the thread
        puts the exception on the queue and the consumer's outer
        except-branch ("Internal error: ...") is exercised.
        """
        import requests
        from asgiref.sync import sync_to_async
        from core.models import Character

        character = await sync_to_async(Character.objects.create)(
            name="LLMErr",
            system_prompt="test",
            response_language="thai",
            response_length="short",
        )

        original_session = requests.Session

        class FailingSession(original_session):
            def post(self, *args, **kwargs):
                raise requests.exceptions.ConnectionError("Cannot connect to LLM API")

        monkeypatch.setattr(requests, "Session", FailingSession)

        communicator = WebsocketCommunicator(ChatStreamConsumer.as_asgi(), "/ws/chat/")
        await communicator.connect()
        await communicator.receive_from()  # consume "connected"

        payload = {
            "type": "chat",
            "character_id": str(character.id),
            "message": "Hello",
        }
        await communicator.send_to(text_data=json.dumps(payload))

        response = await communicator.receive_from()
        data = json.loads(response)
        assert data["type"] == "error"
        # The consumer wraps the exception as "Internal error: <reason>"
        assert "Internal error" in data["error"] or "Cannot connect" in data["error"]

        await communicator.disconnect()

    async def test_handle_chat_unknown_type(self):
        """Test that unknown message type returns error."""
        communicator = WebsocketCommunicator(ChatStreamConsumer.as_asgi(), "/ws/chat/")
        await communicator.connect()
        await communicator.receive_from()  # consume "connected"

        payload = {"type": "unknown", "data": "something"}
        await communicator.send_to(text_data=json.dumps(payload))

        response = await communicator.receive_from()
        data = json.loads(response)
        assert data["type"] == "error"
        assert "Unknown message type" in data["error"]

        await communicator.disconnect()

    async def test_handle_chat_invalid_json(self):
        """Test that invalid JSON returns error."""
        communicator = WebsocketCommunicator(ChatStreamConsumer.as_asgi(), "/ws/chat/")
        await communicator.connect()
        await communicator.receive_from()  # consume "connected"

        await communicator.send_to(text_data="this is not json")

        response = await communicator.receive_from()
        data = json.loads(response)
        assert data["type"] == "error"
        assert data["type"] == "error"
        assert "Invalid JSON" in data["error"]

        await communicator.disconnect()


@pytest.mark.django_db
@pytest.mark.asyncio
class TestYouTubeChatConsumer:
    """Tests for YouTubeChatConsumer WebSocket."""

    async def test_connect_and_join_group(self, mock_channel_layer):
        """Test that client connects and joins the youtube_chat group."""
        communicator = WebsocketCommunicator(YouTubeChatConsumer.as_asgi(), "/ws/youtube/")
        connected, _ = await communicator.connect()
        assert connected is True

        # Should receive a "yt_connected" message
        response = await communicator.receive_from()
        data = json.loads(response)
        assert data["type"] == "yt_connected"

        # Consumer should have joined the broadcast group
        mock_channel_layer.group_add.assert_called_once_with(
            "youtube_chat", "test-channel"
        )

        await communicator.disconnect()
        mock_channel_layer.group_discard.assert_called_once_with(
            "youtube_chat", "test-channel"
        )

    async def test_receive_ignores_incoming_messages(self, mock_channel_layer):
        """Test that client messages are ignored."""
        communicator = WebsocketCommunicator(YouTubeChatConsumer.as_asgi(), "/ws/youtube/")
        await communicator.connect()
        await communicator.receive_from()  # consume "yt_connected"

        # Send a message - consumer.receive() passes, no response expected
        await communicator.send_to(text_data="hello")

        await communicator.disconnect()

    async def test_yt_message_event_broadcast(self, mock_channel_layer):
        """Test that yt_message_event handler sends data to client."""
        communicator = WebsocketCommunicator(YouTubeChatConsumer.as_asgi(), "/ws/youtube/")
        await communicator.connect()
        await communicator.receive_from()  # consume "yt_connected"

        # Simulate a broadcast from the channel layer: the consumer's
        # dispatch loop picks this up via layer.receive().
        event_data = {
            "type": "yt_message_event",
            "data": {
                "type": "yt_message",
                "id": "msg-123",
                "author_name": "testuser",
                "text": "Hello YouTube!",
                "is_mod": False,
                "is_owner": False,
                "is_super_chat": False,
                "ai_responded": False,
                "ai_response": "",
                "received_at": "2026-09-08T00:00:00Z",
            },
        }
        await mock_channel_layer.incoming.put(event_data)

        response = await communicator.receive_from()
        data = json.loads(response)
        assert data["type"] == "yt_message"
        assert data["author_name"] == "testuser"
        assert data["text"] == "Hello YouTube!"

        await communicator.disconnect()

    async def test_yt_reply_event_broadcast(self, mock_channel_layer):
        """Test that yt_reply event handler sends data to client."""
        communicator = WebsocketCommunicator(YouTubeChatConsumer.as_asgi(), "/ws/youtube/")
        await communicator.connect()
        await communicator.receive_from()  # consume "yt_connected"

        event_data = {
            "type": "yt_message_event",
            "data": {
                "type": "yt_reply",
                "id": "msg-123",
                "ai_response": "AI reply here",
            },
        }
        await mock_channel_layer.incoming.put(event_data)

        response = await communicator.receive_from()
        data = json.loads(response)
        assert data["type"] == "yt_reply"
        assert data["ai_response"] == "AI reply here"

        await communicator.disconnect()
