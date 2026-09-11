"""Tests for core models, services, and views."""

import uuid
from unittest import mock

import pytest
from django.test import RequestFactory
from rest_framework import status

from core.models import Character
from core.services import LLMService, LLMServiceError
from core.views import (
    chat,
    health_check,
    llm_status,
    generate_character_prompt,
    _get_character,
    _check_rate_limit,
    _character_cache,
    _rate_limit_store,
)
from core.serializers import CharacterSerializer, ChatRequestSerializer


@pytest.fixture(autouse=True)
def clear_caches():
    """Clear caches before each test."""
    _character_cache.clear()
    _rate_limit_store.clear()
    yield
    _character_cache.clear()
    _rate_limit_store.clear()


@pytest.mark.django_db
class TestCharacterModel:
    """Tests for the Character model."""

    def test_create_character(self):
        char = Character.objects.create(
            name="Mena",
            name_th="มีนา",
            name_en="Mena",
            system_prompt="You are a friendly AI VTuber.",
            response_language="thai",
            response_length="short",
        )
        assert char.id is not None
        assert char.name == "Mena"
        assert char.name_th == "มีนา"
        assert char.name_en == "Mena"
        assert char.response_language == "thai"
        assert char.response_length == "short"
        assert char.enable_per_user_memory is True
        assert char.memory_duration_days == 3
        assert char.is_active is True

    def test_str_representation(self):
        char = Character.objects.create(name="TestChar")
        assert str(char) == "TestChar"

    def test_default_values(self):
        char = Character.objects.create(name="Defaults")
        assert char.response_language == "thai"
        assert char.response_length == "short"
        assert char.enable_per_user_memory is True
        assert char.memory_duration_days == 3
        assert char.is_active is True
        assert char.avatar_border_color == "#ffffff"

    def test_get_language_name(self):
        char = Character.objects.create(name="Test", response_language="thai")
        assert char.get_language_name() == "ไทย"

        char_en = Character.objects.create(name="TestEN", response_language="english")
        assert char_en.get_language_name() == "อังกฤษ"

        char_jp = Character.objects.create(name="TestJP", response_language="japanese")
        assert char_jp.get_language_name() == "ญี่ปุ่น"

    def test_get_language_name_unknown(self):
        char = Character.objects.create(name="Test", response_language="klingon")
        assert char.get_language_name() == "klingon"

    def test_build_system_prompt_basic(self):
        char = Character.objects.create(
            name="Mena",
            name_th="มีนา",
            name_en="Mena",
            system_prompt="You are {name_th} ({name_en}).",
        )
        prompt = char.build_system_prompt()
        assert "มีนา" in prompt
        assert "Mena" in prompt
        assert "{name_th}" not in prompt
        assert "{name_en}" not in prompt

    def test_build_system_prompt_with_ai_prompt(self):
        char = Character.objects.create(
            name="Mena",
            system_prompt="Base prompt.",
            system_prompt_ai="AI-generated personality.",
        )
        prompt = char.build_system_prompt()
        assert "Base prompt." in prompt
        assert "AI-generated personality." in prompt

    def test_build_system_prompt_appends_language_instruction(self):
        char = Character.objects.create(
            name="Mena",
            system_prompt="Test",
            response_language="thai",
        )
        prompt = char.build_system_prompt()
        assert "ภาษาไทย" in prompt
        assert "สตรีมเมอร์" in prompt



    def test_get_max_tokens(self):
        char = Character.objects.create(name="Test", response_length="short")
        assert char.get_max_tokens() == 128

        char_normal = Character.objects.create(name="Test2", response_length="normal")
        assert char_normal.get_max_tokens() == 256

        char_long = Character.objects.create(name="Test3", response_length="long")
        assert char_long.get_max_tokens() == 512

        char_custom = Character.objects.create(
            name="Test4", response_length="custom", custom_max_tokens=1024
        )
        assert char_custom.get_max_tokens() == 1024

    def test_get_response_limit(self):
        char_short = Character.objects.create(name="Test", response_length="short")
        limit = char_short.get_response_limit()
        assert limit["sentences"] == 2
        assert limit["chars"] == 160

        char_long = Character.objects.create(name="Test", response_length="long")
        assert char_long.get_response_limit() is None

    def test_enforce_response_length_short(self):
        char = Character.objects.create(name="Test", response_length="short")
        text = "หนึ่งนะจ๊ะ! สองจ้า! 🦋 สามเกินมาแล้ว! สี่ก็เกิน!"
        result = char.enforce_response_length(text)
        assert "สามเกินมาแล้ว" not in result
        assert "หนึ่งนะจ๊ะ" in result

    def test_enforce_response_length_long(self):
        char = Character.objects.create(name="Test", response_length="long")
        text = "หนึ่ง สอง สาม สี่ ห้า " * 50
        result = char.enforce_response_length(text)
        assert result == text.strip()

    def test_enforce_response_length_empty(self):
        char = Character.objects.create(name="Test", response_length="short")
        assert char.enforce_response_length("") == ""

    def test_is_over_budget(self):
        char = Character.objects.create(name="Test", response_length="short")
        assert char.is_over_budget("หนึ่ง! สอง! สามเกิน!") is True
        assert char.is_over_budget("หนึ่ง! สอง!") is False

    def test_matches_language_thai(self):
        char = Character.objects.create(name="Test", response_language="thai")
        assert char.matches_language("สวัสดีจ้า! สู้ๆ นะคะ 🦋") is True

    def test_matches_language_japanese_rejected_for_thai(self):
        char = Character.objects.create(name="Test", response_language="thai")
        assert char.matches_language("がんばれ！応援してるよ") is False

    def test_matches_language_thai_with_quoted_japanese(self):
        char = Character.objects.create(name="Test", response_language="thai")
        assert char.matches_language("คำว่า すべるな แปลว่า อย่าลื่นนะคะ") is True

    def test_matches_language_emoji_only(self):
        char = Character.objects.create(name="Test", response_language="thai")
        assert char.matches_language("🦋✨🌸") is True

    def test_matches_language_english(self):
        char = Character.objects.create(name="Test", response_language="english")
        assert char.matches_language("Hello! How are you?") is True
        assert char.matches_language("สวัสดีจ้า") is False


@pytest.mark.django_db
class TestCharacterSerializer:
    """Tests for CharacterSerializer."""

    def test_serialize(self, character):
        serializer = CharacterSerializer(character)
        data = serializer.data
        assert data["name"] == "Mena"
        assert data["name_th"] == "มีนา"
        assert "id" in data
        assert "created_at" in data

    def test_deserialize_create(self):
        payload = {
            "name": "NewChar",
            "name_th": "ใหม่",
            "system_prompt": "Test prompt",
            "response_language": "thai",
            "response_length": "short",
        }
        serializer = CharacterSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors
        char = serializer.save()
        assert char.name == "NewChar"

    def test_read_only_fields(self, character):
        serializer = CharacterSerializer(character)
        assert serializer.fields["id"].read_only
        assert serializer.fields["created_at"].read_only
        assert serializer.fields["updated_at"].read_only

    def test_system_prompt_ai_max_length(self):
        payload = {
            "name": "Test",
            "system_prompt_ai": "x" * 8001,  # Exceeds max_length
        }
        serializer = CharacterSerializer(data=payload)
        assert not serializer.is_valid()
        assert "system_prompt_ai" in serializer.errors


@pytest.mark.django_db
class TestChatRequestSerializer:
    """Tests for ChatRequestSerializer."""

    def test_valid_payload(self, character):
        payload = {
            "character_id": str(character.id),
            "message": "Hello!",
            "user_name": "testuser",
        }
        serializer = ChatRequestSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors
        assert str(serializer.validated_data["character_id"]) == str(character.id)
        assert serializer.validated_data["message"] == "Hello!"
        assert serializer.validated_data["user_name"] == "testuser"

    def test_minimal_payload(self, character):
        payload = {
            "character_id": str(character.id),
            "message": "Hi",
        }
        serializer = ChatRequestSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["user_name"] == ""
        assert serializer.validated_data["stream"] is False

    def test_character_id_required(self):
        serializer = ChatRequestSerializer(data={"message": "Hello"})
        assert not serializer.is_valid()
        assert "character_id" in serializer.errors

    def test_message_required(self, character):
        serializer = ChatRequestSerializer(data={"character_id": str(character.id)})
        assert not serializer.is_valid()
        assert "message" in serializer.errors

    def test_invalid_character_id(self):
        serializer = ChatRequestSerializer(
            data={"character_id": "not-a-uuid", "message": "Hi"}
        )
        assert not serializer.is_valid()
        assert "character_id" in serializer.errors


@pytest.mark.django_db
class TestGetCharacter:
    """Tests for _get_character helper."""

    def test_get_existing_character(self, character):
        result = _get_character(str(character.id))
        assert result is not None
        assert result.name == "Mena"

    def test_get_nonexistent_character(self):
        result = _get_character(str(uuid.uuid4()))
        assert result is None

    def test_character_caching(self, character):
        # First call should cache
        result1 = _get_character(str(character.id))
        assert str(character.id) in _character_cache

        # Second call should use cache
        result2 = _get_character(str(character.id))
        assert result1 == result2


@pytest.mark.django_db
class TestRateLimit:
    """Tests for _check_rate_limit helper."""

    def test_allows_within_limit(self):
        key = "test_key"
        for _ in range(5):
            assert _check_rate_limit(key, max_requests=5, window_seconds=60) is True

    def test_blocks_over_limit(self):
        key = "test_key"
        for _ in range(5):
            _check_rate_limit(key, max_requests=5, window_seconds=60)
        assert _check_rate_limit(key, max_requests=5, window_seconds=60) is False

    def test_different_keys_independent(self):
        key1 = "key1"
        key2 = "key2"
        for _ in range(5):
            _check_rate_limit(key1, max_requests=5, window_seconds=60)
        assert _check_rate_limit(key1, max_requests=5, window_seconds=60) is False
        assert _check_rate_limit(key2, max_requests=5, window_seconds=60) is True


@pytest.mark.django_db
class TestChatView:
    """Tests for the chat view."""

    def test_chat_success(self, character, monkeypatch):
        mock_llm = mock.Mock()
        mock_llm.chat_for_character.return_value = "สวัสดีจ้า!"
        monkeypatch.setattr("core.views.LLMService", lambda: mock_llm)

        factory = RequestFactory()
        request = factory.post(
            "/api/chat/",
            {
                "character_id": str(character.id),
                "message": "สวัสดี",
                "user_name": "testuser",
            },
            content_type="application/json",
        )
        response = chat(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["response"] == "สวัสดีจ้า!"
        assert "message_id" in response.data

    def test_chat_character_not_found(self):
        factory = RequestFactory()
        request = factory.post(
            "/api/chat/",
            {
                "character_id": str(uuid.uuid4()),
                "message": "Hello",
            },
            content_type="application/json",
        )
        response = chat(request)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_chat_invalid_payload(self):
        factory = RequestFactory()
        request = factory.post(
            "/api/chat/",
            {"message": "Hello"},  # Missing character_id
            content_type="application/json",
        )
        response = chat(request)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_chat_llm_error(self, character, monkeypatch):
        mock_llm = mock.Mock()
        mock_llm.chat_for_character.side_effect = LLMServiceError("API down")
        monkeypatch.setattr("core.views.LLMService", lambda: mock_llm)

        factory = RequestFactory()
        request = factory.post(
            "/api/chat/",
            {
                "character_id": str(character.id),
                "message": "Hello",
            },
            content_type="application/json",
        )
        response = chat(request)
        assert response.status_code == status.HTTP_502_BAD_GATEWAY

    def test_chat_saves_messages(self, character, monkeypatch):
        mock_llm = mock.Mock()
        mock_llm.chat_for_character.return_value = "Reply!"
        monkeypatch.setattr("core.views.LLMService", lambda: mock_llm)

        factory = RequestFactory()
        request = factory.post(
            "/api/chat/",
            {
                "character_id": str(character.id),
                "message": "Hello",
                "user_name": "testuser",
            },
            content_type="application/json",
        )
        response = chat(request)
        assert response.status_code == status.HTTP_200_OK

        # Verify messages were saved
        from chat_messages.models import ChatMessage
        user_msgs = ChatMessage.objects.filter(
            character=character, role=ChatMessage.Role.USER
        )
        assistant_msgs = ChatMessage.objects.filter(
            character=character, role=ChatMessage.Role.ASSISTANT
        )
        assert user_msgs.count() >= 1
        assert assistant_msgs.count() >= 1


@pytest.mark.django_db
class TestHealthCheckView:
    """Tests for health_check view."""

    def test_health_check_success(self, monkeypatch):
        mock_llm = mock.Mock()
        mock_llm.health_check.return_value = {
            "reachable": True,
            "models_available": 5,
            "models": ["auto", "gpt-3.5"],
            "selected_model": "auto",
        }
        monkeypatch.setattr("core.views.LLMService", lambda: mock_llm)

        factory = RequestFactory()
        request = factory.get("/api/health/")
        response = health_check(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ok"

    def test_health_check_llm_down(self, monkeypatch):
        mock_llm = mock.Mock()
        mock_llm.health_check.return_value = {
            "reachable": False,
            "models_available": 0,
            "models": [],
            "selected_model": None,
        }
        monkeypatch.setattr("core.views.LLMService", lambda: mock_llm)

        factory = RequestFactory()
        request = factory.get("/api/health/")
        response = health_check(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["llm_api"] == "disconnected"


@pytest.mark.django_db
class TestLLMStatusView:
    """Tests for llm_status view."""

    def test_get_status(self, monkeypatch):
        mock_llm = mock.Mock()
        mock_llm.get_status.return_value = {
            "api_url": "http://test/v1/chat/completions",
            "configured_model": "auto",
            "working_model": "auto",
            "auto_model": "auto",
            "cached_models_count": 5,
            "rate_limit": {
                "max_requests": 25,
                "window_seconds": 60,
                "current_requests": 0,
                "wait_time": 0.0,
            },
        }
        monkeypatch.setattr("core.views.LLMService", lambda: mock_llm)

        factory = RequestFactory()
        request = factory.get("/api/llm-status/")
        response = llm_status(request)
        assert response.status_code == status.HTTP_200_OK
        assert "api_url" in response.data
        assert "rate_limit" in response.data


@pytest.mark.django_db
class TestGenerateCharacterPromptView:
    """Tests for generate_character_prompt view."""

    def test_insufficient_messages(self, character, monkeypatch):
        # Create only 3 messages (need at least 5)
        from chat_messages.models import ChatMessage
        for i in range(3):
            ChatMessage.objects.create(
                character=character,
                role=ChatMessage.Role.USER,
                content=f"Message {i}",
            )

        factory = RequestFactory()
        request = factory.post(f"/api/characters/{character.id}/generate-prompt/")
        response = generate_character_prompt(request, character_id=str(character.id))
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Need at least 5 messages" in response.data["error"]

    def test_character_not_found(self):
        factory = RequestFactory()
        request = factory.post(f"/api/characters/{uuid.uuid4()}/generate-prompt/")
        response = generate_character_prompt(request, character_id=str(uuid.uuid4()))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_invalid_character_id(self):
        factory = RequestFactory()
        request = factory.post("/api/characters/invalid-uuid/generate-prompt/")
        response = generate_character_prompt(request, character_id="invalid-uuid")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_successful_generation(self, character, monkeypatch):
        from chat_messages.models import ChatMessage
        # Create 5 messages
        for i in range(5):
            ChatMessage.objects.create(
                character=character,
                role=ChatMessage.Role.USER,
                content=f"Message {i}",
            )

        mock_llm = mock.Mock()
        mock_llm.chat.return_value = "Generated prompt in Thai"
        monkeypatch.setattr("core.views.LLMService", lambda: mock_llm)

        factory = RequestFactory()
        request = factory.post(f"/api/characters/{character.id}/generate-prompt/")
        response = generate_character_prompt(request, character_id=str(character.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["system_prompt_ai"] == "Generated prompt in Thai"
        assert response.data["messages_analyzed"] == 5

    def test_rate_limit(self, character, monkeypatch):
        from chat_messages.models import ChatMessage
        for i in range(5):
            ChatMessage.objects.create(
                character=character,
                role=ChatMessage.Role.USER,
                content=f"Message {i}",
            )

        mock_llm = mock.Mock()
        mock_llm.chat.return_value = "Generated"
        monkeypatch.setattr("core.views.LLMService", lambda: mock_llm)

        factory = RequestFactory()
        # Exhaust rate limit
        for _ in range(5):
            request = factory.post(f"/api/characters/{character.id}/generate-prompt/")
            generate_character_prompt(request, character_id=str(character.id))

        # Next request should be rate limited
        request = factory.post(f"/api/characters/{character.id}/generate-prompt/")
        response = generate_character_prompt(request, character_id=str(character.id))
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


# ─── LLMService Tests ───────────────────────────────────────────────────────

class FakeResp:
    """Minimal OpenAI-style response with a controllable status code."""

    def __init__(self, choices, status=200):
        self.choices = choices
        self.status_code = status

    def json(self):
        return {"choices": self.choices}

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests
            err = requests.exceptions.HTTPError(f"HTTP {self.status_code}")
            err.response = self
            raise err


def _svc(responses):
    """LLMService whose HTTP layer returns the given FakeResp objects in order."""
    s = LLMService(api_url="http://llm.test/v1/chat/completions")
    s._session = mock.Mock()
    s._session.post.side_effect = responses
    return s


def _choice(content, finish_reason):
    return {"message": {"content": content}, "finish_reason": finish_reason}


class TestLLMTruncationRetryTests:
    """Tests for LLMService truncation retry logic."""

    def test_truncated_reply_is_retried_with_larger_budget(self):
        truncated = FakeResp([_choice("สวัสดีครับ ผมเป็นป", "length")])
        complete = FakeResp([_choice("สวัสดีครับ! ตอบเต็มประโยคแล้ว", "stop")])
        svc = _svc([truncated, complete])

        result = svc._make_request(
            [{"role": "user", "content": "hi"}], model="auto",
            temperature=0.7, max_tokens=2048,
        )

        assert result == "สวัสดีครับ! ตอบเต็มประโยคแล้ว"
        posts = svc._session.post.call_args_list
        assert len(posts) == 2
        # The retry must ask for a doubled token budget so the reply can finish.
        assert posts[1].kwargs["json"]["max_tokens"] == 4096

    def test_empty_reply_raises_after_retries(self):
        empty = FakeResp([_choice("", "stop")])
        svc = _svc([empty, empty, empty])

        with pytest.raises(LLMServiceError, match="Empty content"):
            svc._make_request(
                [{"role": "user", "content": "hi"}], model="auto",
                temperature=0.7, max_tokens=2048,
            )
        assert len(svc._session.post.call_args_list) == 3

    def test_still_truncated_after_retries_returns_partial(self):
        truncated = FakeResp([_choice("ยังไม่จบประโยค", "length")])
        svc = _svc([truncated, truncated, truncated])

        result = svc._make_request(
            [{"role": "user", "content": "hi"}], model="auto",
            temperature=0.7, max_tokens=2048,
        )

        assert result == "ยังไม่จบประโยค"
        assert len(svc._session.post.call_args_list) == 3

    def test_fallback_skips_truncated_and_uses_next_model(self):
        unsupported = FakeResp([], status=404)
        truncated = FakeResp([_choice("คำตอบถูกตัด", "length")])
        complete = FakeResp([_choice("คำตอบที่สมบูรณ์จาก fallback", "stop")])
        svc = _svc([unsupported, truncated, complete])

        result = svc._make_request(
            [{"role": "user", "content": "hi"}], model="auto",
            temperature=0.7, max_tokens=2048,
        )

        assert result == "คำตอบที่สมบูรณ์จาก fallback"
        assert len(svc._session.post.call_args_list) == 3


def _char(**kwargs):
    defaults = {
        "name": "Test", "system_prompt": "test",
        "response_language": "thai", "response_length": "short",
    }
    defaults.update(kwargs)
    return Character(**defaults)


class TestResponseLengthEnforcementTests:
    """Tests for Character.enforce_response_length."""

    def test_short_keeps_two_sentences(self):
        c = _char(response_length="short")
        out = c.enforce_response_length("หนึ่งนะจ๊ะ! สองจ้า! 🦋 สามเกินมาแล้ว! สี่ก็เกิน!")
        assert "สามเกินมาแล้ว" not in out
        assert "หนึ่งนะจ๊ะ" in out

    def test_short_splits_on_newlines(self):
        c = _char(response_length="short")
        out = c.enforce_response_length("บรรทัดหนึ่งจ๊ะ\nบรรทัดสองจ้า\nบรรทัดสามเกิน")
        assert "บรรทัดสามเกิน" not in out

    def test_short_hard_char_cap(self):
        c = _char(response_length="short")
        out = c.enforce_response_length("ก" * 500)
        assert len(out) <= 160

    def test_long_passes_through(self):
        c = _char(response_length="long")
        text = "หนึ่ง สอง สาม สี่ ห้า " * 50
        assert c.enforce_response_length(text) == text.strip()

    def test_over_budget_detects_third_sentence(self):
        c = _char(response_length="short")
        assert c.is_over_budget("หนึ่ง! สอง! สามเกิน!") is True
        assert c.is_over_budget("หนึ่ง! สอง!") is False


class TestResponseLanguageTests:
    """Tests for Character.matches_language and chat_for_character repair."""

    def test_thai_reply_passes(self):
        c = _char(response_language="thai")
        assert c.matches_language("สวัสดีจ้า! สู้ๆ นะคะ 🦋") is True

    def test_japanese_reply_rejected_for_thai(self):
        c = _char(response_language="thai")
        assert c.matches_language("がんばれ！応援してるよ") is False

    def test_thai_with_quoted_japanese_passes(self):
        c = _char(response_language="thai")
        assert c.matches_language("คำว่า すべるな แปลว่า อย่าลื่นนะคะ สู้ต่อไปนะจ๊ะ") is True

    def test_emoji_only_passes(self):
        c = _char(response_language="thai")
        assert c.matches_language("🦋✨🌸") is True

    def test_chat_for_character_repairs_wrong_language(self):
        foreign = FakeResp([_choice("がんばれ！応援してるよ", "stop")])
        repaired = FakeResp([_choice("สู้ๆ นะคะ! เป็นกำลังใจให้จ้า", "stop")])
        svc = _svc([foreign, repaired])
        c = _char(response_language="thai", response_length="short")

        result = svc.chat_for_character(c, [{"role": "user", "content": "がんばれ"}])

        assert "สู้ๆ" in result
        assert len(svc._session.post.call_args_list) == 2

    def test_chat_for_character_truncates_long_thai(self):
        long_thai = FakeResp([_choice("หนึ่งจ๊ะ! สองจ้า! สามเกินมาแล้ว! สี่ก็เกิน!", "stop")])
        svc = _svc([long_thai])
        c = _char(response_language="thai", response_length="short")

        result = svc.chat_for_character(c, [{"role": "user", "content": "hi"}])

        assert "สามเกินมาแล้ว" not in result
        assert len(svc._session.post.call_args_list) == 1
