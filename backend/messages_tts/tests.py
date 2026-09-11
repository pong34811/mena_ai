"""Tests for messages_tts models and views."""

import pytest
from django.test import RequestFactory
from rest_framework import status

from messages_tts.models import TTSSettings
from messages_tts.views import tts_settings_get, tts_settings_update
from messages_tts.serializers import TTSSettingsSerializer


@pytest.mark.django_db
class TestTTSSettingsModel:
    """Tests for the TTSSettings model."""

    def test_singleton_creation(self):
        settings = TTSSettings.get_instance()
        assert settings.pk == TTSSettings.SINGLETON_PK
        assert settings.questioner_enabled is True
        assert settings.questioner_voice == "th-TH-PremwadeeNeural"
        assert settings.questioner_rate == "+0%"
        assert settings.questioner_say_username is True
        assert settings.responder_enabled is True
        assert settings.responder_voice == "th-TH-PremwadeeNeural"
        assert settings.responder_rate == "+0%"
        assert settings.responder_delay_ms == 1000

    def test_singleton_persistence(self):
        settings1 = TTSSettings.get_instance()
        settings1.questioner_voice = "th-TH-NiwatNeural"
        settings1.save()

        settings2 = TTSSettings.get_instance()
        assert settings2.pk == settings1.pk
        assert settings2.questioner_voice == "th-TH-NiwatNeural"

    def test_save_forces_singleton_pk(self):
        settings = TTSSettings(pk=999, questioner_voice="test")
        settings.save()
        assert settings.pk == TTSSettings.SINGLETON_PK

    def test_str_representation(self):
        settings = TTSSettings.get_instance()
        assert str(settings) == "TTS Settings"

    def test_update_fields(self):
        settings = TTSSettings.get_instance()
        settings.questioner_enabled = False
        settings.responder_rate = "+10%"
        settings.responder_delay_ms = 5000
        settings.save()

        refreshed = TTSSettings.get_instance()
        assert refreshed.questioner_enabled is False
        assert refreshed.responder_rate == "+10%"
        assert refreshed.responder_delay_ms == 5000


@pytest.mark.django_db
class TestTTSSettingsSerializer:
    """Tests for TTSSettingsSerializer."""

    def test_serialize(self):
        settings = TTSSettings.get_instance()
        serializer = TTSSettingsSerializer(settings)
        data = serializer.data
        assert "questioner_enabled" in data
        assert "questioner_voice" in data
        assert "questioner_rate" in data
        assert "questioner_say_username" in data
        assert "responder_enabled" in data
        assert "responder_voice" in data
        assert "responder_rate" in data
        assert "responder_delay_ms" in data
        assert "updated_at" in data

    def test_read_only_updated_at(self):
        settings = TTSSettings.get_instance()
        serializer = TTSSettingsSerializer(settings, data={"updated_at": "2020-01-01T00:00:00Z"})
        assert "updated_at" in serializer.fields
        assert serializer.fields["updated_at"].read_only


@pytest.mark.django_db
class TestTTSSettingsGetView:
    """Tests for tts_settings_get view."""

    def test_get_settings(self):
        factory = RequestFactory()
        request = factory.get("/api/tts/settings/")
        response = tts_settings_get(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["questioner_enabled"] is True
        assert response.data["questioner_voice"] == "th-TH-PremwadeeNeural"
        assert response.data["responder_enabled"] is True
        assert response.data["responder_delay_ms"] == 1000

    def test_get_settings_after_update(self):
        # First update
        settings = TTSSettings.get_instance()
        settings.questioner_voice = "th-TH-AcharaNeural"
        settings.save()

        factory = RequestFactory()
        request = factory.get("/api/tts/settings/")
        response = tts_settings_get(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["questioner_voice"] == "th-TH-AcharaNeural"


@pytest.mark.django_db
class TestTTSSettingsUpdateView:
    """Tests for tts_settings_update view."""

    def test_update_single_field(self):
        factory = RequestFactory()
        request = factory.patch(
            "/api/tts/settings/update/",
            {"questioner_voice": "th-TH-NiwatNeural"},
            content_type="application/json",
        )
        response = tts_settings_update(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["questioner_voice"] == "th-TH-NiwatNeural"

    def test_update_multiple_fields(self):
        factory = RequestFactory()
        request = factory.patch(
            "/api/tts/settings/update/",
            {
                "questioner_enabled": False,
                "responder_rate": "+20%",
                "responder_delay_ms": 5000,
            },
            content_type="application/json",
        )
        response = tts_settings_update(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["questioner_enabled"] is False
        assert response.data["responder_rate"] == "+20%"
        assert response.data["responder_delay_ms"] == 5000

    def test_update_persists(self):
        factory = RequestFactory()
        request = factory.patch(
            "/api/tts/settings/update/",
            {"questioner_say_username": False},
            content_type="application/json",
        )
        response = tts_settings_update(request)
        assert response.status_code == status.HTTP_200_OK

        # Verify persistence
        settings = TTSSettings.get_instance()
        assert settings.questioner_say_username is False

    def test_update_ignores_unknown_fields(self):
        factory = RequestFactory()
        request = factory.patch(
            "/api/tts/settings/update/",
            {"unknown_field": "some_value", "questioner_rate": "-10%"},
            content_type="application/json",
        )
        response = tts_settings_update(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["questioner_rate"] == "-10%"
        assert "unknown_field" not in response.data

    def test_update_boolean_toggle(self):
        # First disable
        factory = RequestFactory()
        request = factory.patch(
            "/api/tts/settings/update/",
            {"responder_enabled": False},
            content_type="application/json",
        )
        response = tts_settings_update(request)
        assert response.data["responder_enabled"] is False

        # Then re-enable
        request = factory.patch(
            "/api/tts/settings/update/",
            {"responder_enabled": True},
            content_type="application/json",
        )
        response = tts_settings_update(request)
        assert response.data["responder_enabled"] is True

    def test_update_delay_ms_zero(self):
        factory = RequestFactory()
        request = factory.patch(
            "/api/tts/settings/update/",
            {"responder_delay_ms": 0},
            content_type="application/json",
        )
        response = tts_settings_update(request)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["responder_delay_ms"] == 0
