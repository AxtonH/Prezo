from __future__ import annotations

import sys
import types
import unittest
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

from app.store_supabase import SupabaseError, SupabaseStore  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
