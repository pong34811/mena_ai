"""Tests for the Piper-backed TTS service."""

from pathlib import Path
from unittest import mock

import pytest

from core import tts_service as svc
from core.tts_service import (
    TTSService,
    DEFAULT_VOICE,
    EN_VOICE,
    VOICE_ALIAS_MAP,
    VOICE_OPTIONS,
    call_piper_synthesize,
    rate_to_length_scale,
    resolve_voice,
    get_all_voices,
)


class TestPiperConfig:
    def test_voice_options_tracks_local_models(self):
        assert list(VOICE_OPTIONS.keys()) == ["thai", "english"]
        assert VOICE_OPTIONS["thai"][0]["id"] == "th_TH-tsync2-medium"
        assert VOICE_OPTIONS["english"][0]["id"] == EN_VOICE
        assert DEFAULT_VOICE == "th_TH-tsync2-medium"

    def test_alias_map_covers_all_legacy_voices(self):
        old_ids = [
            "th-TH-PremwadeeNeural", "th-TH-NiwatNeural",
            "en-US-AriaNeural", "en-US-GuyNeural", "en-US-JennyNeural",
            "en-US-MichelleNeural", "en-GB-SoniaNeural", "en-GB-RyanNeural",
            "ja-JP-NanamiNeural", "ja-JP-KeitaNeural",
        ]
        assert all(VOICE_ALIAS_MAP[oid] == DEFAULT_VOICE for oid in old_ids[:2])
        assert all(VOICE_ALIAS_MAP[oid] == EN_VOICE for oid in old_ids[2:-2])
        assert all(VOICE_ALIAS_MAP[oid] == DEFAULT_VOICE for oid in old_ids[-2:])

    def test_get_all_voices_tracks_local_models(self):
        assert get_all_voices() == VOICE_OPTIONS
        assert len(get_all_voices()["thai"]) == 1
        assert get_all_voices()["english"][0]["id"] == EN_VOICE


class TestResolveVoice:
    def test_unknown_voice_falls_back(self):
        assert resolve_voice("nonexistent-voice") == DEFAULT_VOICE

    def test_legacy_alias_resolves(self):
        assert resolve_voice("th-TH-PremwadeeNeural") == DEFAULT_VOICE

    def test_none_uses_default(self):
        assert resolve_voice(None) == DEFAULT_VOICE

    def test_new_id_passes_through(self):
        assert resolve_voice("th_TH-tsync2-medium") == DEFAULT_VOICE


class TestRateToLengthScale:
    def test_default_zero(self):
        assert rate_to_length_scale("+0%") == 1.0

    def test_speed_up(self):
        assert rate_to_length_scale("+50%") == pytest.approx(100 / 150)

    def test_slow_down(self):
        assert rate_to_length_scale("-20%") == pytest.approx(100 / 80)

    def test_multiplier_input(self):
        assert rate_to_length_scale("1.5") == pytest.approx(100 / 150)

    def test_minus_100_clamps_not_divzero(self):
        assert rate_to_length_scale("-100%") == 100.0


class TestCallPiperSynthesize:
    def test_success_returns_bytes(self, monkeypatch):
        resp = mock.Mock(status_code=200, content=b"ID3-fake-mp3")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        out = call_piper_synthesize("สวัสดี", "th_TH-tsync2-medium", 1.0)
        assert out == b"ID3-fake-mp3"

    def test_http_error_returns_none(self, monkeypatch):
        resp = mock.Mock(status_code=500, text="boom")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        assert call_piper_synthesize("hi", "th_TH-tsync2-medium", 1.0) is None

    def test_connection_error_returns_none(self, monkeypatch):
        import requests
        def raise_error(*a, **k):
            raise requests.exceptions.ConnectionError("down")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(side_effect=raise_error))
        assert call_piper_synthesize("hi", "th_TH-tsync2-medium", 1.0) is None


class TestRomanToThai:
    def test_latin_name_transliterates(self):
        assert svc._roman_to_thai("warit") == "วอารอิต"

    def test_thai_text_unchanged(self):
        assert svc._roman_to_thai("สวัสดี") == "สวัสดี"

    def test_digits_map_to_thai_words(self):
        assert svc._roman_to_thai("007") == "ศูนย์ศูนย์เจ็ด"

    def test_mixed_keeps_thai(self):
        assert svc._roman_to_thai("johnแอน") == "จโอฮนแอน"

    def test_spaces_preserved(self):
        # Piper tokenizes Thai on spaces; dropping them yields silent audio.
        assert svc._roman_to_thai("warit แมว") == "วอารอิต แมว"
        assert svc._roman_to_thai("สวัสดี ครับ") == "สวัสดี ครับ"


class TestGenerators:
    def test_generate_returns_cached_file(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        tts = TTSService(voice="th-TH-PremwadeeNeural", rate="+0%")
        cache_path = svc.get_cache_path("สวัสดีจ้า", DEFAULT_VOICE, "+0%")
        cache_path.write_bytes(b"cached")
        assert tts.generate("สวัสดีจ้า") == cache_path

    def test_generate_strips_emoji_only_text(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        tts = TTSService(voice=DEFAULT_VOICE, rate="+0%")
        assert tts.generate("🦋✨") is None

    def test_generate_writes_mp3_and_cleans_cache(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        resp = mock.Mock(status_code=200, content=b"new-mp3-bytes")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        tts = TTSService(voice=DEFAULT_VOICE, rate="+10%")
        out = tts.generate("สวัสดีครับ")
        assert out is not None
        assert out.read_bytes() == b"new-mp3-bytes"
        call = svc.requests.post.call_args
        assert call.kwargs["json"]["length_scale"] == pytest.approx(100 / 110)
        assert call.kwargs["json"]["voice"] == DEFAULT_VOICE

    def test_generate_retries_once_on_connection_error(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        import requests as req_mod
        calls = {"n": 0}
        def flaky(*a, **k):
            calls["n"] += 1
            if calls["n"] == 1:
                raise req_mod.exceptions.ConnectionError("down")
            return mock.Mock(status_code=200, content=b"ok-mp3")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(side_effect=flaky))
        tts = TTSService(voice=DEFAULT_VOICE, rate="+0%")
        out = tts.generate("hello")
        assert out is not None and out.read_bytes() == b"ok-mp3"
        assert calls["n"] == 2

    def test_generate_piper_down_returns_none(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        import requests as req_mod
        def down(*a, **k):
            raise req_mod.exceptions.ConnectionError("down")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(side_effect=down))
        tts = TTSService(voice=DEFAULT_VOICE, rate="+0%")
        assert tts.generate("hello") is None

    def test_generate_uses_alias_voice_in_cache_key(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        resp = mock.Mock(status_code=200, content=b"x")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        tts = TTSService(voice="th-TH-PremwadeeNeural", rate="+0%")
        # English text routes to the EN voice regardless of the Thai alias.
        expected = svc.get_cache_path("สวัสดีจ้า", DEFAULT_VOICE, "+0%")
        tts.generate("สวัสดีจ้า")
        assert expected.exists()

    def test_generate_routes_english_text_to_en_voice(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        resp = mock.Mock(status_code=200, content=b"en-mp3")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        tts = TTSService(voice=DEFAULT_VOICE, rate="+0%")
        out = tts.generate("warit")
        assert out is not None
        call = svc.requests.post.call_args
        assert call.kwargs["json"]["voice"] == EN_VOICE
        assert call.kwargs["json"]["text"] == "warit"  # not transliterated

    def test_generate_routes_thai_text_to_thai_voice(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        resp = mock.Mock(status_code=200, content=b"th-mp3")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        tts = TTSService(voice=EN_VOICE, rate="+0%")
        out = tts.generate("สวัสดีครับ")
        assert out is not None
        call = svc.requests.post.call_args
        assert call.kwargs["json"]["voice"] == DEFAULT_VOICE

    def test_generate_transliterates_latin_embedded_in_thai(self, monkeypatch, tmp_path):
        monkeypatch.setattr(svc, "CACHE_DIR", tmp_path)
        resp = mock.Mock(status_code=200, content=b"th-mp3")
        monkeypatch.setattr(svc.requests, "post", mock.Mock(return_value=resp))
        tts = TTSService(voice=DEFAULT_VOICE, rate="+0%")
        out = tts.generate("johnแอน")
        assert out is not None
        call = svc.requests.post.call_args
        assert call.kwargs["json"]["voice"] == DEFAULT_VOICE
        assert call.kwargs["json"]["text"] == "จโอฮนแอน"
