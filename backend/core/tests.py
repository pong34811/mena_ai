"""Tests for the LLM service reply-quality retry logic."""

from unittest import mock

import requests
from django.test import SimpleTestCase

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
