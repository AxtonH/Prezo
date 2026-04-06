from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

security = HTTPBearer(auto_error=False)
LIBRARY_SYNC_PURPOSE = "library_sync"


@dataclass(slots=True)
class AuthUser:
    id: str
    email: str | None


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def _library_sync_secret() -> bytes:
    secret = settings.library_sync_secret or settings.supabase_service_role_key
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Library sync is not configured",
        )
    return secret.encode("utf-8")


async def get_current_user_from_supabase_token(token: str) -> AuthUser:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth is not configured",
        )

    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.supabase_service_role_key,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth service unavailable",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token"
        )

    data = response.json()
    return AuthUser(id=data["id"], email=data.get("email"))


def issue_library_sync_token(user: AuthUser) -> tuple[str, datetime]:
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=max(60, settings.library_sync_ttl_seconds)
    )
    payload = {
        "sub": user.id,
        "email": user.email,
        "purpose": LIBRARY_SYNC_PURPOSE,
        "exp": int(expires_at.timestamp()),
    }
    payload_blob = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_segment = _b64url_encode(payload_blob)
    signature_segment = _b64url_encode(
        hmac.new(_library_sync_secret(), payload_segment.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{payload_segment}.{signature_segment}", expires_at


def verify_library_sync_token(token: str) -> AuthUser | None:
    if not token or "." not in token:
        return None
    try:
        payload_segment, signature_segment = token.split(".", 1)
        expected_signature = _b64url_encode(
            hmac.new(
                _library_sync_secret(), payload_segment.encode("ascii"), hashlib.sha256
            ).digest()
        )
        if not hmac.compare_digest(signature_segment, expected_signature):
            return None
        payload = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
    except Exception:
        return None

    if payload.get("purpose") != LIBRARY_SYNC_PURPOSE:
        return None
    user_id = payload.get("sub")
    expires_at = payload.get("exp")
    if not user_id or not isinstance(expires_at, int):
        return None
    if expires_at <= int(datetime.now(timezone.utc).timestamp()):
        return None
    return AuthUser(id=str(user_id), email=payload.get("email"))


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> AuthUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth required")
    return await get_current_user_from_supabase_token(credentials.credentials)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> AuthUser | None:
    """Bearer token when present (e.g. host). No token → None (e.g. audience snapshot)."""
    if credentials is None:
        return None
    try:
        return await get_current_user_from_supabase_token(credentials.credentials)
    except HTTPException:
        return None


async def get_library_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> AuthUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth required")

    token = credentials.credentials
    sync_user = verify_library_sync_token(token)
    if sync_user is not None:
        return sync_user
    return await get_current_user_from_supabase_token(token)


async def get_optional_library_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> AuthUser | None:
    """Same identity resolution as `get_library_user`, but returns None if no Bearer token."""
    if credentials is None:
        return None
    token = credentials.credentials
    sync_user = verify_library_sync_token(token)
    if sync_user is not None:
        return sync_user
    return await get_current_user_from_supabase_token(token)
