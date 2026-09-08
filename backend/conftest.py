"""Shared pytest fixtures for the MENA AI VTuber backend."""

import os
import sys
from unittest import mock
from pathlib import Path

import django
import pytest
from django.conf import settings as django_settings

# Ensure the backend directory is on sys.path so `config.settings` resolves.
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Configure Django settings before importing models.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()


@pytest.fixture
def db():
    """Provide a clean database per test (transaction rollback)."""
    from django.db import transaction
    with transaction.atomic():
        sid = transaction.savepoint()
        yield
        transaction.savepoint_rollback(sid)


@pytest.fixture
def character(db):
    """Create a default Character instance."""
    from core.models import Character
    return Character.objects.create(
        name="Mena",
        name_th="มีนา",
        name_en="Mena",
        system_prompt="You are a friendly AI VTuber named {name_th}.",
        response_language="thai",
        response_length="short",
    )


@pytest.fixture
def character_long(db):
    """Create a Character with long response length."""
    from core.models import Character
    return Character.objects.create(
        name="Mena Long",
        name_th="มีนา",
        name_en="Mena",
        system_prompt="You are a friendly AI VTuber.",
        response_language="thai",
        response_length="long",
    )


@pytest.fixture
def character_english(db):
    """Create a Character with English response language."""
    from core.models import Character
    return Character.objects.create(
        name="Mena EN",
        name_th="มีนา",
        name_en="Mena",
        system_prompt="You are a friendly AI VTuber.",
        response_language="english",
        response_length="normal",
    )


@pytest.fixture
def chat_message(db, character):
    """Create a ChatMessage instance."""
    from chat_messages.models import ChatMessage
    return ChatMessage.objects.create(
        character=character,
        role=ChatMessage.Role.USER,
        content="สวัสดีจ้า",
        user_name="testuser",
    )


@pytest.fixture
def llm_service():
    """Create an LLMService with mocked HTTP layer."""
    from core.services import LLMService
    svc = LLMService(api_url="http://llm.test/v1/chat/completions")
    svc._session = mock.Mock()
    return svc


@pytest.fixture
def fake_response():
    """Factory for fake OpenAI-style responses."""
    import requests

    def _make(choices, status=200):
        resp = mock.Mock()
        resp.status_code = status
        resp.json.return_value = {"choices": choices}
        if status >= 400:
            err = requests.exceptions.HTTPError(f"HTTP {status}")
            err.response = resp
            resp.raise_for_status.side_effect = err
        else:
            resp.raise_for_status.return_value = None
        return resp

    return _make


@pytest.fixture
def mock_character_cache():
    """Clear the character cache before and after each test."""
    from core.views import _character_cache
    _character_cache.clear()
    yield
    _character_cache.clear()


@pytest.fixture
def mock_rate_limit():
    """Clear the rate limit store before and after each test."""
    from core.views import _rate_limit_store
    _rate_limit_store.clear()
    yield
    _rate_limit_store.clear()
