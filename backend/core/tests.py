"""Tests for the LLM service reply-quality retry logic + response enforcement."""

from unittest import mock

import requests
from django.test import SimpleTestCase

from core.models import Character
from core.services import LLMService, LLMServiceError


class FakeResp:
    """Minimal OpenAI-style response with a controllable status code."""

    def __init__(self, choices, status=200):
        self.choices = choices
        self.status_code = status

    def json(self):
        return {"choices": self.choices}

    def raise_for_status(self):
        if self.status_code >= 400:
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


class LLMTruncationRetryTests(SimpleTestCase):
    def test_truncated_reply_is_retried_with_larger_budget(self):
        truncated = FakeResp([_choice("สวัสดีครับ ผมเป็นป", "length")])
        complete = FakeResp([_choice("สวัสดีครับ! ตอบเต็มประโยคแล้ว", "stop")])
        svc = _svc([truncated, complete])

        result = svc._make_request(
            [{"role": "user", "content": "hi"}], model="auto",
            temperature=0.7, max_tokens=2048,
        )

        self.assertEqual(result, "สวัสดีครับ! ตอบเต็มประโยคแล้ว")
        posts = svc._session.post.call_args_list
        self.assertEqual(len(posts), 2)
        # The retry must ask for a doubled token budget so the reply can finish.
        self.assertEqual(posts[1].kwargs["json"]["max_tokens"], 4096)

    def test_empty_reply_raises_after_retries(self):
        empty = FakeResp([_choice("", "stop")])
        svc = _svc([empty, empty, empty])

        with self.assertRaisesRegex(LLMServiceError, "Empty content"):
            svc._make_request(
                [{"role": "user", "content": "hi"}], model="auto",
                temperature=0.7, max_tokens=2048,
            )
        self.assertEqual(len(svc._session.post.call_args_list), 3)

    def test_still_truncated_after_retries_returns_partial(self):
        truncated = FakeResp([_choice("ยังไม่จบประโยค", "length")])
        svc = _svc([truncated, truncated, truncated])

        result = svc._make_request(
            [{"role": "user", "content": "hi"}], model="auto",
            temperature=0.7, max_tokens=2048,
        )

        self.assertEqual(result, "ยังไม่จบประโยค")
        self.assertEqual(len(svc._session.post.call_args_list), 3)

    def test_fallback_skips_truncated_and_uses_next_model(self):
        unsupported = FakeResp([], status=404)
        truncated = FakeResp([_choice("คำตอบถูกตัด", "length")])
        complete = FakeResp([_choice("คำตอบที่สมบูรณ์จาก fallback", "stop")])
        svc = _svc([unsupported, truncated, complete])

        result = svc._make_request(
            [{"role": "user", "content": "hi"}], model="auto",
            temperature=0.7, max_tokens=2048,
        )

        self.assertEqual(result, "คำตอบที่สมบูรณ์จาก fallback")
        self.assertEqual(len(svc._session.post.call_args_list), 3)


def _char(**kwargs):
    defaults = {
        "name": "Test", "system_prompt": "test",
        "response_language": "thai", "response_length": "short",
    }
    defaults.update(kwargs)
    return Character(**defaults)


class ResponseLengthEnforcementTests(SimpleTestCase):
    def test_short_keeps_two_sentences(self):
        c = _char(response_length="short")
        out = c.enforce_response_length("หนึ่งนะจ๊ะ! สองจ้า! 🦋 สามเกินมาแล้ว! สี่ก็เกิน!")
        self.assertNotIn("สามเกินมาแล้ว", out)
        self.assertIn("หนึ่งนะจ๊ะ", out)

    def test_short_splits_on_newlines(self):
        c = _char(response_length="short")
        out = c.enforce_response_length("บรรทัดหนึ่งจ๊ะ\nบรรทัดสองจ้า\nบรรทัดสามเกิน")
        self.assertNotIn("บรรทัดสามเกิน", out)

    def test_short_hard_char_cap(self):
        c = _char(response_length="short")
        out = c.enforce_response_length("ก" * 500)
        self.assertLessEqual(len(out), 160)

    def test_long_passes_through(self):
        c = _char(response_length="long")
        text = "หนึ่ง สอง สาม สี่ ห้า " * 50
        self.assertEqual(c.enforce_response_length(text), text.strip())

    def test_over_budget_detects_third_sentence(self):
        c = _char(response_length="short")
        self.assertTrue(c.is_over_budget("หนึ่ง! สอง! สามเกิน!"))
        self.assertFalse(c.is_over_budget("หนึ่ง! สอง!"))


class ResponseLanguageTests(SimpleTestCase):
    def test_thai_reply_passes(self):
        c = _char(response_language="thai")
        self.assertTrue(c.matches_language("สวัสดีจ้า! สู้ๆ นะคะ 🦋"))

    def test_japanese_reply_rejected_for_thai(self):
        c = _char(response_language="thai")
        self.assertFalse(c.matches_language("がんばれ！応援してるよ"))

    def test_thai_with_quoted_japanese_passes(self):
        c = _char(response_language="thai")
        self.assertTrue(c.matches_language("คำว่า すべるな แปลว่า อย่าลื่นนะคะ สู้ต่อไปนะจ๊ะ"))

    def test_emoji_only_passes(self):
        c = _char(response_language="thai")
        self.assertTrue(c.matches_language("🦋✨🌸"))

    def test_chat_for_character_repairs_wrong_language(self):
        foreign = FakeResp([_choice("がんばれ！応援してるよ", "stop")])
        repaired = FakeResp([_choice("สู้ๆ นะคะ! เป็นกำลังใจให้จ้า", "stop")])
        svc = _svc([foreign, repaired])
        c = _char(response_language="thai", response_length="short")

        result = svc.chat_for_character(c, [{"role": "user", "content": "がんばれ"}])

        self.assertIn("สู้ๆ", result)
        self.assertEqual(len(svc._session.post.call_args_list), 2)

    def test_chat_for_character_truncates_long_thai(self):
        long_thai = FakeResp([_choice("หนึ่งจ๊ะ! สองจ้า! สามเกินมาแล้ว! สี่ก็เกิน!", "stop")])
        svc = _svc([long_thai])
        c = _char(response_language="thai", response_length="short")

        result = svc.chat_for_character(c, [{"role": "user", "content": "hi"}])

        self.assertNotIn("สามเกินมาแล้ว", result)
        self.assertEqual(len(svc._session.post.call_args_list), 1)
