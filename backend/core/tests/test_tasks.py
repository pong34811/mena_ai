"""
Tests for Celery tasks (TTS generation).
"""

import os
from pathlib import Path
from unittest import mock

import pytest
from django.conf import settings

from core.tasks import generate_tts, debug_task
from core.tts_service import DEFAULT_VOICE, get_cache_path


@pytest.mark.django_db
class TestTTSTasks:
    """Tests for TTS generation tasks."""

    def test_generate_tts_requires_text_and_voice(self):
        """Test that generate_tts returns error when text or voice is missing."""
        result1 = generate_tts(text="", voice="voice")
        assert result1["success"] is False
        assert "Text and voice are required" in result1["error"]

        result2 = generate_tts(text="Hello", voice="")
        assert result2["success"] is False
        assert "Text and voice are required" in result2["error"]

    def test_generate_tts_uses_cache(self, monkeypatch, tmp_path):
        """Test that generate_tts returns cached file if exists."""
        monkeypatch.setattr("core.tts_service.CACHE_DIR", tmp_path)

        cache_file = get_cache_path("Hello world", DEFAULT_VOICE, "+0%")
        cache_file.write_bytes(b"fake audio data")

        result = generate_tts("Hello world", "th-TH-PremwadeeNeural", "+0%")
        assert result["success"] is True
        assert result["cache_key"] == cache_file.stem
        assert result["audio_path"] == os.path.relpath(cache_file, settings.BASE_DIR)

    def test_generate_tts_synthesizes_new_audio(self, monkeypatch, tmp_path):
        """Test that generate_tts synthesizes new audio when cache miss."""
        monkeypatch.setattr("core.tts_service.CACHE_DIR", tmp_path)

        fake_post = mock.Mock(return_value=b"fake mp3")
        monkeypatch.setattr("core.tts_service.call_piper_synthesize", fake_post)

        text = "สวัสดีครับ"
        voice = "th-TH-PremwadeeNeural"
        result = generate_tts(text, voice, "+0%")

        assert result["success"] is True
        assert result["cache_key"] is not None
        assert "audio_path" in result

        # Delegated to TTSService: alias resolved to the piper voice id
        fake_post.assert_called_once_with(text, DEFAULT_VOICE, pytest.approx(1.0))
        assert Path(result["audio_path"]).exists()

    def test_generate_tts_handles_synthesis_error(self, monkeypatch, tmp_path):
        """Test that generate_tts handles synthesis errors gracefully."""
        monkeypatch.setattr("core.tts_service.CACHE_DIR", tmp_path)

        monkeypatch.setattr("core.tts_service.call_piper_synthesize", mock.Mock(return_value=None))

        result = generate_tts("Hello", "voice", "+0%")
        assert result["success"] is False
        assert "TTS" in result["error"]

    def test_generate_tts_retries_on_failure(self):
        """Test that generate_tts has retry logic via Celery bind."""
        # The task has max_retries=2, test that it's set
        assert generate_tts.max_retries == 2

    def test_debug_task(self):
        """Test that debug_task returns status via eager execution.

        bind=True means Celery injects the task instance as `self`, so we
        run it through .apply() (eager) instead of calling it by hand.
        """
        result = debug_task.apply()
        assert result.successful()
        assert result.result["status"] == "ok"
        assert result.result["task_id"] == result.id