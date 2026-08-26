from __future__ import annotations

import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    import pydantic_settings  # noqa: F401
except ModuleNotFoundError:
    stub_module = types.ModuleType("pydantic_settings")

    class BaseSettings:
        def __init__(self, **kwargs):
            for cls in reversed(self.__class__.mro()):
                for name, value in cls.__dict__.items():
                    if name.startswith("_") or callable(value) or isinstance(value, property):
                        continue
                    setattr(self, name, kwargs.get(name, value))
            for name, value in kwargs.items():
                setattr(self, name, value)

    class SettingsConfigDict(dict):
        pass

    stub_module.BaseSettings = BaseSettings
    stub_module.SettingsConfigDict = SettingsConfigDict
    sys.modules["pydantic_settings"] = stub_module

import httpx  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app import ai_providers  # noqa: E402


def sse_bytes(events: list[dict]) -> bytes:
    lines: list[str] = []
    for event in events:
        lines.append(f"event: {event.get('type', '')}")
        lines.append(f"data: {json.dumps(event)}")
        lines.append("")
    return ("\n".join(lines) + "\n").encode("utf-8")


def make_stream_client_factory(handler):
    real_async_client = httpx.AsyncClient

    def factory(**kwargs):
        kwargs.pop("timeout", None)
        return real_async_client(transport=httpx.MockTransport(handler), **kwargs)

    return factory


class RequestAnthropicTextStreamingTest(unittest.IsolatedAsyncioTestCase):
    async def _call(self, handler, effort: str | None = None) -> tuple[str, str]:
        with patch.object(
            ai_providers.httpx, "AsyncClient", make_stream_client_factory(handler)
        ):
            return await ai_providers.request_anthropic_text(
                api_key="test-key",
                model="claude-opus-5",
                system_instruction="system",
                prompt_text="prompt",
                temperature=0.8,
                max_tokens=64,
                timeout_seconds=30.0,
                request_stage="artifact initial build",
                remaining_budget_seconds=60.0,
                effort=effort,
            )

    async def test_streaming_build_assembles_text_and_stop_reason(self) -> None:
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.content.decode("utf-8"))
            events = [
                {"type": "message_start", "message": {}},
                {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {"type": "text", "text": ""},
                },
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": "<!doctype html>"},
                },
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": "<html></html>"},
                },
                {"type": "content_block_stop", "index": 0},
                {
                    "type": "message_delta",
                    "delta": {"stop_reason": "end_turn"},
                    "usage": {"output_tokens": 12},
                },
                {"type": "message_stop"},
            ]
            return httpx.Response(
                200,
                content=sse_bytes(events),
                headers={"content-type": "text/event-stream"},
            )

        text, stop_reason = await self._call(handler)

        self.assertEqual(text, "<!doctype html><html></html>")
        self.assertEqual(stop_reason, "end_turn")
        self.assertIs(captured["body"]["stream"], True)
        # claude-opus-5 rejects sampling params; the body must omit temperature.
        self.assertNotIn("temperature", captured["body"])
        # No effort passed → no output_config (the API default applies).
        self.assertNotIn("output_config", captured["body"])

    async def test_streaming_build_sends_output_config_effort_when_passed(self) -> None:
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.content.decode("utf-8"))
            events = [
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": "<html></html>"},
                },
                {"type": "message_stop"},
            ]
            return httpx.Response(
                200,
                content=sse_bytes(events),
                headers={"content-type": "text/event-stream"},
            )

        await self._call(handler, effort="medium")

        self.assertEqual(captured["body"]["output_config"], {"effort": "medium"})

    async def test_streaming_joins_multiple_text_blocks_with_newline(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            events = [
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": "block one "},
                },
                {
                    "type": "content_block_delta",
                    "index": 1,
                    "delta": {"type": "text_delta", "text": " block two"},
                },
                {"type": "message_stop"},
            ]
            return httpx.Response(
                200,
                content=sse_bytes(events),
                headers={"content-type": "text/event-stream"},
            )

        text, _stop_reason = await self._call(handler)

        self.assertEqual(text, "block one\nblock two")

    async def test_error_status_raises_502_with_api_detail(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                429,
                json={
                    "type": "error",
                    "error": {"type": "overloaded_error", "message": "Overloaded"},
                },
            )

        with self.assertRaises(HTTPException) as exc_info:
            await self._call(handler)

        self.assertEqual(exc_info.exception.status_code, 502)
        self.assertEqual(exc_info.exception.detail, "Overloaded")

    async def test_mid_stream_error_event_raises_502(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            events = [
                {"type": "message_start", "message": {}},
                {
                    "type": "error",
                    "error": {"type": "api_error", "message": "Internal stream error"},
                },
            ]
            return httpx.Response(
                200,
                content=sse_bytes(events),
                headers={"content-type": "text/event-stream"},
            )

        with self.assertRaises(HTTPException) as exc_info:
            await self._call(handler)

        self.assertEqual(exc_info.exception.status_code, 502)
        self.assertEqual(exc_info.exception.detail, "Internal stream error")

    async def test_empty_stream_raises_502_missing_text(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            events = [
                {"type": "message_start", "message": {}},
                {"type": "message_stop"},
            ]
            return httpx.Response(
                200,
                content=sse_bytes(events),
                headers={"content-type": "text/event-stream"},
            )

        with self.assertRaises(HTTPException) as exc_info:
            await self._call(handler)

        self.assertEqual(exc_info.exception.status_code, 502)
        self.assertIn("did not include text content", exc_info.exception.detail)


if __name__ == "__main__":
    unittest.main()
