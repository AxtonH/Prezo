from __future__ import annotations

import asyncio
import sys
import types
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock

import httpx


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

from app.models import QnaMode, Session, SessionSnapshot, SessionStatus  # noqa: E402
from app.store_supabase import SupabaseError, SupabaseStore  # noqa: E402


def build_snapshot(session_id: str = "session-1") -> SessionSnapshot:
    return SessionSnapshot(
        session=Session(
            id=session_id,
            code="9H6B22",
            title="Demo",
            status=SessionStatus.active,
            qna_open=False,
            qna_mode=QnaMode.audience,
            qna_prompt=None,
            allow_host_join=False,
            created_at=datetime.now(timezone.utc),
        ),
        questions=[],
        polls=[],
        prompts=[],
    )


class SupabaseStoreTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.store = SupabaseStore("https://example.supabase.co", "service-role-key")

    async def asyncTearDown(self) -> None:
        await self.store._client.aclose()

    async def test_get_request_retries_transport_errors_and_raises_supabase_error(self) -> None:
        request_mock = AsyncMock(side_effect=httpx.ConnectError("boom"))
        self.store._client.request = request_mock

        with self.assertRaises(SupabaseError) as exc_info:
            await self.store._request("GET", "sessions")

        self.assertEqual(request_mock.await_count, 3)
        self.assertEqual(exc_info.exception.status_code, 503)
        self.assertEqual(exc_info.exception.code, "supabase_unavailable")
        self.assertIn("Supabase request failed for GET", exc_info.exception.detail)

    async def test_non_get_request_does_not_retry_transport_errors(self) -> None:
        request_mock = AsyncMock(side_effect=httpx.ConnectError("boom"))
        self.store._client.request = request_mock

        with self.assertRaises(SupabaseError) as exc_info:
            await self.store._request("POST", "sessions", json={"id": "123"})

        self.assertEqual(request_mock.await_count, 1)
        self.assertEqual(exc_info.exception.status_code, 503)
        self.assertEqual(exc_info.exception.code, "supabase_unavailable")

    async def test_snapshot_coalesces_concurrent_loads(self) -> None:
        snapshot = build_snapshot()

        async def delayed_snapshot(session_id: str) -> SessionSnapshot:
            await asyncio.sleep(0.01)
            self.assertEqual(session_id, "session-1")
            return snapshot

        load_mock = AsyncMock(side_effect=delayed_snapshot)
        self.store._load_snapshot = load_mock

        first, second = await asyncio.gather(
            self.store.snapshot("session-1"),
            self.store.snapshot("session-1"),
        )

        self.assertEqual(load_mock.await_count, 1)
        self.assertEqual(first.session.id, "session-1")
        self.assertEqual(second.session.id, "session-1")
        self.assertIsNot(first, second)

    async def test_snapshot_serves_stale_cache_when_supabase_is_temporarily_unavailable(
        self,
    ) -> None:
        snapshot = build_snapshot()
        self.store._snapshot_cache["session-1"] = (time.monotonic() - 2.0, snapshot)
        load_mock = AsyncMock(
            side_effect=SupabaseError(503, "temporary upstream timeout", "supabase_unavailable")
        )
        self.store._load_snapshot = load_mock

        result = await self.store.snapshot("session-1")

        self.assertEqual(load_mock.await_count, 1)
        self.assertEqual(result.session.id, "session-1")
        self.assertIsNot(result, snapshot)


if __name__ == "__main__":
    unittest.main()
