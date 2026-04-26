"""Supabase-backed store for the `embed_instances` table.

Isolated from `store_supabase.py` so the embed persistence layer can be
added, modified, or removed without touching the core store. One row per
content add-in instance; the row id matches the UUID that the iframe
stores in `Office.context.document.settings["embedId"]`.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from .config import settings
from .models import EmbedInstance, EmbedInstanceCreate, EmbedInstanceUpdate

logger = logging.getLogger("prezo.embed_instances")

TABLE = "embed_instances"


class EmbedInstanceStoreError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class EmbedInstanceNotFoundError(EmbedInstanceStoreError):
    def __init__(self, embed_id: str) -> None:
        super().__init__(404, f"Embed instance {embed_id} not found")


class EmbedInstancesStore:
    def __init__(self, supabase_url: str, service_role_key: str) -> None:
        self._base_url = supabase_url.rstrip("/") + "/rest/v1"
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0))

    async def close(self) -> None:
        await self._client.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json: Any | None = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        headers = dict(self._headers)
        if prefer:
            headers["Prefer"] = prefer
        url = f"{self._base_url}/{path}"
        try:
            response = await self._client.request(
                method.upper(), url, params=params, json=json, headers=headers
            )
        except httpx.RequestError as exc:
            logger.warning("embed_instances request failed: %s %s – %s", method, url, exc)
            raise EmbedInstanceStoreError(
                503, f"Supabase request failed: {exc.__class__.__name__}"
            ) from exc
        if response.status_code >= 400:
            detail = response.text
            try:
                payload = response.json()
            except ValueError:
                payload = None
            if isinstance(payload, dict):
                message = payload.get("message") or payload.get("details") or response.text
                detail = str(message)
            raise EmbedInstanceStoreError(response.status_code, detail)
        return response

    @staticmethod
    def _row_to_model(row: dict[str, Any]) -> EmbedInstance:
        return EmbedInstance(
            id=str(row["id"]),
            owner_user_id=str(row["owner_user_id"]) if row.get("owner_user_id") else None,
            session_id=str(row["session_id"]) if row.get("session_id") else None,
            poll_id=str(row["poll_id"]) if row.get("poll_id") else None,
            artifact_kind=row.get("artifact_kind") or "poll-game",
            artifact_name=row.get("artifact_name"),
            screen_mode=row.get("screen_mode"),
            present_mode=bool(row.get("present_mode")),
            metadata=row.get("metadata") or {},
            created_at=_parse_timestamp(row["created_at"]),
            updated_at=_parse_timestamp(row["updated_at"]),
            last_seen_at=_parse_timestamp(row["last_seen_at"]),
        )

    async def get(self, embed_id: str) -> EmbedInstance:
        response = await self._request(
            "GET", TABLE, params={"id": f"eq.{embed_id}", "select": "*"}
        )
        rows = response.json()
        if not rows:
            raise EmbedInstanceNotFoundError(embed_id)
        return self._row_to_model(rows[0])

    async def create(
        self, payload: EmbedInstanceCreate, owner_user_id: str | None
    ) -> EmbedInstance:
        body = {
            "id": payload.id,
            "owner_user_id": owner_user_id,
            "session_id": payload.session_id,
            "poll_id": payload.poll_id,
            "artifact_kind": payload.artifact_kind,
            "artifact_name": payload.artifact_name,
            "screen_mode": payload.screen_mode,
            "present_mode": payload.present_mode,
            "metadata": payload.metadata,
        }
        response = await self._request(
            "POST",
            TABLE,
            json=body,
            prefer="return=representation,resolution=merge-duplicates",
        )
        rows = response.json()
        if not rows:
            raise EmbedInstanceStoreError(
                500, "Embed instance create returned no rows"
            )
        return self._row_to_model(rows[0])

    async def update(
        self, embed_id: str, patch: EmbedInstanceUpdate
    ) -> EmbedInstance:
        body: dict[str, Any] = {}
        if patch.session_id is not None:
            body["session_id"] = patch.session_id or None
        if patch.poll_id is not None:
            body["poll_id"] = patch.poll_id or None
        if patch.artifact_kind is not None:
            body["artifact_kind"] = patch.artifact_kind
        if patch.artifact_name is not None:
            body["artifact_name"] = patch.artifact_name or None
        if patch.screen_mode is not None:
            body["screen_mode"] = patch.screen_mode or None
        if patch.present_mode is not None:
            body["present_mode"] = bool(patch.present_mode)
        if patch.metadata is not None:
            body["metadata"] = patch.metadata
        body["last_seen_at"] = datetime.now(timezone.utc).isoformat()
        response = await self._request(
            "PATCH",
            TABLE,
            params={"id": f"eq.{embed_id}"},
            json=body,
            prefer="return=representation",
        )
        rows = response.json()
        if not rows:
            raise EmbedInstanceNotFoundError(embed_id)
        return self._row_to_model(rows[0])

    async def touch_last_seen(self, embed_id: str) -> None:
        await self._request(
            "PATCH",
            TABLE,
            params={"id": f"eq.{embed_id}"},
            json={"last_seen_at": datetime.now(timezone.utc).isoformat()},
        )

    async def delete(self, embed_id: str) -> None:
        await self._request(
            "DELETE", TABLE, params={"id": f"eq.{embed_id}"}
        )


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    text = str(value).replace("Z", "+00:00")
    return datetime.fromisoformat(text)


_store: EmbedInstancesStore | None = None


def get_embed_instances_store() -> EmbedInstancesStore:
    """Lazy singleton. Returns the live store instance.

    Raises a clean 503 if Supabase isn't configured, so the router can
    surface a useful error rather than crashing at import time.
    """
    global _store
    if _store is not None:
        return _store
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise EmbedInstanceStoreError(
            503, "Embed instance persistence requires Supabase configuration"
        )
    _store = EmbedInstancesStore(
        settings.supabase_url, settings.supabase_service_role_key
    )
    return _store
