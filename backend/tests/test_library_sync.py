from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from pathlib import Path
import sys
from unittest import TestCase
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import auth


class LibrarySyncTokenTests(TestCase):
    def test_issue_and_verify_library_sync_token_round_trip(self) -> None:
        user = auth.AuthUser(id="user-123", email="user@example.com")
        with patch.object(auth.settings, "supabase_service_role_key", "secret-key"), patch.object(
            auth.settings, "library_sync_secret", None
        ), patch.object(auth.settings, "library_sync_ttl_seconds", 3600):
            token, expires_at = auth.issue_library_sync_token(user)
            verified = auth.verify_library_sync_token(token)

        self.assertIsNotNone(verified)
        assert verified is not None
        self.assertEqual(verified.id, user.id)
        self.assertEqual(verified.email, user.email)
        self.assertGreater(expires_at, datetime.now(timezone.utc))

    def test_verify_library_sync_token_rejects_expired_token(self) -> None:
        payload = {
            "sub": "user-123",
            "email": "user@example.com",
            "purpose": auth.LIBRARY_SYNC_PURPOSE,
            "exp": int((datetime.now(timezone.utc) - timedelta(minutes=1)).timestamp()),
        }
        payload_segment = auth._b64url_encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        with patch.object(auth.settings, "supabase_service_role_key", "secret-key"), patch.object(
            auth.settings, "library_sync_secret", None
        ):
            signature_segment = auth._b64url_encode(
                hmac.new(
                    b"secret-key", payload_segment.encode("ascii"), hashlib.sha256
                ).digest()
            )
            verified = auth.verify_library_sync_token(
                f"{payload_segment}.{signature_segment}"
            )

        self.assertIsNone(verified)

    def test_get_library_user_accepts_sync_token(self) -> None:
        user = auth.AuthUser(id="user-456", email="viewer@example.com")
        with patch.object(auth.settings, "supabase_service_role_key", "secret-key"), patch.object(
            auth.settings, "library_sync_secret", None
        ), patch.object(auth.settings, "library_sync_ttl_seconds", 3600):
            token, _expires_at = auth.issue_library_sync_token(user)
            credentials = HTTPAuthorizationCredentials(
                scheme="Bearer", credentials=token
            )
            resolved = asyncio.run(auth.get_library_user(credentials))

        self.assertEqual(resolved.id, user.id)
        self.assertEqual(resolved.email, user.email)

    def test_get_library_user_falls_back_to_supabase_token_validation(self) -> None:
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials="plain-supabase-token"
        )
        expected_user = auth.AuthUser(id="real-user", email="real@example.com")
        with patch.object(auth, "verify_library_sync_token", return_value=None), patch.object(
            auth,
            "get_current_user_from_supabase_token",
            AsyncMock(return_value=expected_user),
        ):
            resolved = asyncio.run(auth.get_library_user(credentials))

        self.assertEqual(resolved.id, expected_user.id)
        self.assertEqual(resolved.email, expected_user.email)

    def test_get_library_user_rejects_missing_credentials(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            asyncio.run(auth.get_library_user(None))

        self.assertEqual(exc.exception.status_code, 401)
