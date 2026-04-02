from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any

import httpx

logger = logging.getLogger("prezo.supabase")
SNAPSHOT_CACHE_TTL_SECONDS = 1.0
SNAPSHOT_STALE_MAX_SECONDS = 30.0
SUPABASE_TRANSPORT_BACKOFF_SECONDS = 15.0

from .artifact_package import build_saved_artifact_snapshot_signature
from .models import (
    BrandProfile,
    Poll,
    PollOption,
    PollStatus,
    SavedArtifactVersion,
    QnaPrompt,
    QnaPromptStatus,
    QnaMode,
    Question,
    QuestionStatus,
    SavedArtifact,
    SavedTheme,
    Session,
    SessionSnapshot,
    SessionStatus,
)
from .store import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    generate_code,
)


class SupabaseError(Exception):
    def __init__(self, status_code: int, detail: str, code: str | None = None) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.code = code


class SupabaseStore:
    def __init__(self, supabase_url: str, service_role_key: str) -> None:
        self._base_url = supabase_url.rstrip("/") + "/rest/v1"
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=15.0),
        )
        self._snapshot_cache: dict[str, tuple[float, SessionSnapshot]] = {}
        self._snapshot_inflight: dict[str, asyncio.Task[SessionSnapshot]] = {}
        self._transport_unavailable_until = 0.0
        self._transport_failure_detail = ""

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
        normalized_method = method.upper()
        now = time.monotonic()
        if now < self._transport_unavailable_until:
            detail = self._transport_failure_detail or (
                "Supabase is temporarily unreachable after repeated transport failures."
            )
            raise SupabaseError(503, detail, "supabase_unavailable")
        max_attempts = 3 if normalized_method == "GET" else 1
        last_exc: Exception | None = None
        for attempt in range(max_attempts):
            try:
                response = await self._client.request(
                    normalized_method,
                    url,
                    params=params,
                    json=json,
                    headers=headers,
                )
                self._transport_unavailable_until = 0.0
                self._transport_failure_detail = ""
                break
            except (
                httpx.ConnectTimeout,
                httpx.ConnectError,
                httpx.ReadTimeout,
                httpx.ReadError,
                httpx.PoolTimeout,
                httpx.RemoteProtocolError,
            ) as exc:
                last_exc = exc
                logger.warning(
                    "Supabase request transport failed (attempt %d/%d): %s %s – %s",
                    attempt + 1,
                    max_attempts,
                    normalized_method,
                    url,
                    exc,
                )
                if attempt < max_attempts - 1:
                    await asyncio.sleep(0.5 * (attempt + 1))
            except httpx.RequestError as exc:
                last_exc = exc
                logger.warning(
                    "Supabase request failed (attempt %d/%d): %s %s – %s",
                    attempt + 1,
                    max_attempts,
                    normalized_method,
                    url,
                    exc,
                )
                if attempt < max_attempts - 1:
                    await asyncio.sleep(0.5 * (attempt + 1))
        else:
            detail = (
                f"Supabase request failed for {normalized_method} {url}: "
                f"{last_exc.__class__.__name__}: {last_exc}"
                if last_exc
                else f"Supabase request failed for {normalized_method} {url}"
            )
            self._transport_unavailable_until = (
                time.monotonic() + SUPABASE_TRANSPORT_BACKOFF_SECONDS
            )
            self._transport_failure_detail = detail
            raise SupabaseError(503, detail, "supabase_unavailable")
        if response.status_code >= 400:
            detail = response.text
            code: str | None = None
            try:
                payload = response.json()
            except ValueError:
                payload = None
            if isinstance(payload, dict):
                message = payload.get("message")
                details = payload.get("details")
                detail = (
                    str(message)
                    if message not in (None, "")
                    else str(details)
                    if details not in (None, "")
                    else response.text
                )
                raw_code = payload.get("code")
                code = str(raw_code) if raw_code is not None else None
            raise SupabaseError(response.status_code, detail, code)
        return response

    async def _select(
        self, table: str, params: dict[str, str]
    ) -> list[dict[str, Any]]:
        response = await self._request("GET", table, params=params)
        return response.json()

    async def _rpc(self, function_name: str, payload: dict[str, Any]) -> Any:
        response = await self._request("POST", f"rpc/{function_name}", json=payload)
        return response.json()

    def _invalidate_session_snapshot(self, session_id: str) -> None:
        self._snapshot_cache.pop(session_id, None)

    def _get_cached_snapshot_copy(
        self, session_id: str, now: float, max_age_seconds: float
    ) -> SessionSnapshot | None:
        cached = self._snapshot_cache.get(session_id)
        if not cached:
            return None
        cached_at, snapshot = cached
        if now - cached_at > max_age_seconds:
            return None
        return snapshot.model_copy(deep=True)

    def _get_stale_snapshot_copy(self, session_id: str) -> SessionSnapshot | None:
        stale_snapshot = self._get_cached_snapshot_copy(
            session_id, time.monotonic(), SNAPSHOT_STALE_MAX_SECONDS
        )
        if stale_snapshot:
            logger.warning(
                "Serving stale snapshot for session %s after Supabase request failure",
                session_id,
            )
        return stale_snapshot

    async def _load_snapshot(self, session_id: str) -> SessionSnapshot:
        sessions = await self._select(
            "sessions", {"select": "*", "id": f"eq.{session_id}"}
        )
        if not sessions:
            raise NotFoundError("session not found")
        session = self._to_session(sessions[0])

        questions = await self._select(
            "questions",
            {"select": "*", "session_id": f"eq.{session_id}", "order": "created_at.desc"},
        )
        prompts = await self._select(
            "qna_prompts",
            {"select": "*", "session_id": f"eq.{session_id}", "order": "created_at.desc"},
        )
        polls = await self._select(
            "polls",
            {"select": "*", "session_id": f"eq.{session_id}", "order": "created_at.desc"},
        )
        poll_ids = [poll["id"] for poll in polls]
        options: list[dict[str, Any]] = []
        if poll_ids:
            in_list = ",".join(f'"{poll_id}"' for poll_id in poll_ids)
            options = await self._select(
                "poll_options",
                {"select": "*", "poll_id": f"in.({in_list})", "order": "position.asc"},
            )
        options_by_poll: dict[str, list[dict[str, Any]]] = {}
        for option in options:
            options_by_poll.setdefault(option["poll_id"], []).append(option)

        poll_models = [
            self._to_poll(poll, options_by_poll.get(poll["id"], []))
            for poll in polls
        ]
        question_models = [self._to_question(item) for item in questions]
        prompt_models = [self._to_prompt(item) for item in prompts]

        return SessionSnapshot(
            session=session,
            questions=question_models,
            polls=poll_models,
            prompts=prompt_models,
        )

    async def _get_session_row(self, session_id: str) -> dict[str, Any]:
        rows = await self._select("sessions", {"select": "*", "id": f"eq.{session_id}"})
        if not rows:
            raise NotFoundError("session not found")
        return rows[0]

    async def _has_cohost_access(self, session_id: str, user_id: str) -> bool:
        rows = await self._select(
            "session_hosts",
            {
                "select": "session_id",
                "session_id": f"eq.{session_id}",
                "user_id": f"eq.{user_id}",
            },
        )
        return bool(rows)

    async def _ensure_host_access(self, session_id: str, user_id: str) -> dict[str, Any]:
        session = await self._get_session_row(session_id)
        if session.get("user_id") == user_id:
            return session
        if await self._has_cohost_access(session_id, user_id):
            return session
        raise NotFoundError("session not found")

    async def _ensure_owner_access(
        self, session_id: str, user_id: str
    ) -> dict[str, Any]:
        session = await self._get_session_row(session_id)
        if session.get("user_id") != user_id:
            raise PermissionDeniedError(
                "Only the original host can perform this action."
            )
        return session

    def _to_session(
        self, data: dict[str, Any], viewer_user_id: str | None = None
    ) -> Session:
        is_original_host: bool | None = None
        if viewer_user_id is not None:
            is_original_host = data.get("user_id") == viewer_user_id
        payload = {k: v for k, v in data.items() if k != "user_id"}
        payload.setdefault("allow_host_join", False)
        payload["is_original_host"] = is_original_host
        return Session(**payload)

    def _to_question(self, data: dict[str, Any]) -> Question:
        return Question(**data)

    def _to_poll(self, data: dict[str, Any], options: list[dict[str, Any]]) -> Poll:
        option_models = [
            PollOption(id=opt["id"], label=opt["label"], votes=opt["votes"])
            for opt in options
        ]
        return Poll(options=option_models, **data)

    def _to_prompt(self, data: dict[str, Any]) -> QnaPrompt:
        return QnaPrompt(**data)

    def _to_saved_theme(self, data: dict[str, Any]) -> SavedTheme:
        payload = {key: value for key, value in data.items() if key != "user_id"}
        return SavedTheme(**payload)

    def _to_brand_profile(self, data: dict[str, Any]) -> BrandProfile:
        payload = {key: value for key, value in data.items() if key != "user_id"}
        return BrandProfile(**payload)

    def _to_saved_artifact(self, data: dict[str, Any]) -> SavedArtifact:
        payload = {key: value for key, value in data.items() if key != "user_id"}
        return SavedArtifact(**payload)

    def _to_saved_artifact_version(
        self, data: dict[str, Any]
    ) -> SavedArtifactVersion:
        payload = {key: value for key, value in data.items() if key != "user_id"}
        return SavedArtifactVersion(**payload)

    async def _record_saved_artifact_version(
        self,
        *,
        user_id: str,
        artifact: SavedArtifact,
        source: str,
    ) -> None:
        rows = await self._select(
            "saved_poll_game_artifact_versions",
            {
                "select": "*",
                "artifact_id": f"eq.{artifact.id}",
                "order": "version.desc",
                "limit": "1",
            },
        )
        latest = rows[0] if rows else None
        latest_signature = ""
        next_version = 1
        if latest:
            next_version = max(1, int(latest.get("version") or 0) + 1)
            latest_signature = build_saved_artifact_snapshot_signature(
                html=str(latest.get("html") or ""),
                artifact_package=(
                    latest.get("artifact_package")
                    if isinstance(latest.get("artifact_package"), dict)
                    else None
                ),
                last_prompt=(
                    str(latest.get("last_prompt"))
                    if latest.get("last_prompt") is not None
                    else None
                ),
                last_answers=(
                    latest.get("last_answers")
                    if isinstance(latest.get("last_answers"), dict)
                    else {}
                ),
                theme_snapshot=(
                    latest.get("theme_snapshot")
                    if isinstance(latest.get("theme_snapshot"), dict)
                    else None
                ),
                style_overrides=(
                    latest.get("style_overrides")
                    if isinstance(latest.get("style_overrides"), dict)
                    else None
                ),
            )

        next_signature = build_saved_artifact_snapshot_signature(
            html=artifact.html,
            artifact_package=(
                artifact.artifact_package.model_dump(mode="json")
                if artifact.artifact_package
                else None
            ),
            last_prompt=artifact.last_prompt,
            last_answers=artifact.last_answers,
            theme_snapshot=artifact.theme_snapshot,
            style_overrides=artifact.style_overrides,
        )
        if latest and next_signature == latest_signature:
            return

        await self._request(
            "POST",
            "saved_poll_game_artifact_versions",
            json={
                "id": str(uuid.uuid4()),
                "artifact_id": artifact.id,
                "user_id": user_id,
                "name": artifact.name,
                "version": next_version,
                "html": artifact.html,
                "artifact_package": (
                    artifact.artifact_package.model_dump(mode="json")
                    if artifact.artifact_package
                    else None
                ),
                "last_prompt": artifact.last_prompt,
                "last_answers": artifact.last_answers,
                "theme_snapshot": artifact.theme_snapshot,
                "style_overrides": artifact.style_overrides,
                "source": source,
            },
            prefer="return=representation",
        )

    async def create_session(self, title: str | None, user_id: str) -> Session:
        for _ in range(6):
            session_id = str(uuid.uuid4())
            code = generate_code()
            payload = {
                "id": session_id,
                "user_id": user_id,
                "code": code,
                "title": title,
                "status": SessionStatus.active.value,
                "qna_open": False,
                "qna_mode": QnaMode.audience.value,
                "qna_prompt": None,
                "allow_host_join": False,
            }
            try:
                response = await self._request(
                    "POST",
                    "sessions",
                    json=payload,
                    prefer="return=representation",
                )
            except SupabaseError as exc:
                if exc.status_code == 409:
                    continue
                raise
            data = response.json()
            if data:
                return self._to_session(data[0], user_id)
        raise ConflictError("failed to allocate session code")

    async def get_session(self, session_id: str, user_id: str | None = None) -> Session:
        if user_id:
            row = await self._ensure_host_access(session_id, user_id)
            return self._to_session(row, user_id)
        row = await self._get_session_row(session_id)
        return self._to_session(row)

    async def get_session_by_code(self, code: str) -> Session:
        rows = await self._select(
            "sessions", {"select": "*", "code": f"eq.{code.upper()}"}
        )
        if not rows:
            raise NotFoundError("session not found")
        return self._to_session(rows[0])

    async def list_sessions(
        self,
        user_id: str,
        status: SessionStatus | None = None,
        limit: int | None = None,
    ) -> list[Session]:
        owned_params = {
            "select": "*",
            "user_id": f"eq.{user_id}",
            "order": "created_at.desc",
        }
        owned_rows = await self._select("sessions", owned_params)

        cohost_links = await self._select(
            "session_hosts",
            {"select": "session_id", "user_id": f"eq.{user_id}"},
        )
        cohost_ids = sorted(
            {
                str(row.get("session_id"))
                for row in cohost_links
                if row.get("session_id")
            }
        )
        cohost_rows: list[dict[str, Any]] = []
        if cohost_ids:
            in_list = ",".join(f'"{session_id}"' for session_id in cohost_ids)
            cohost_rows = await self._select(
                "sessions",
                {"select": "*", "id": f"in.({in_list})", "order": "created_at.desc"},
            )

        rows_by_id: dict[str, dict[str, Any]] = {}
        for row in owned_rows:
            rows_by_id[row["id"]] = row
        for row in cohost_rows:
            rows_by_id.setdefault(row["id"], row)

        rows = list(rows_by_id.values())
        if status:
            rows = [row for row in rows if row.get("status") == status.value]
        rows.sort(key=lambda row: str(row.get("created_at", "")), reverse=True)
        if limit:
            rows = rows[:limit]
        return [self._to_session(row, user_id) for row in rows]

    async def delete_session(self, session_id: str, user_id: str) -> Session:
        await self._ensure_owner_access(session_id, user_id)
        response = await self._request(
            "DELETE",
            "sessions",
            params={"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("session not found")
        self._invalidate_session_snapshot(session_id)
        return self._to_session(data[0], user_id)

    async def join_session_as_host(self, code: str, user_id: str) -> Session:
        rows = await self._select(
            "sessions", {"select": "*", "code": f"eq.{code.upper()}"}
        )
        if not rows:
            raise NotFoundError("session not found")
        session = rows[0]
        session_id = session["id"]
        owner_id = session.get("user_id")

        if owner_id == user_id:
            return self._to_session(session, user_id)
        if await self._has_cohost_access(session_id, user_id):
            return self._to_session(session, user_id)
        if not session.get("allow_host_join", False):
            raise PermissionDeniedError(
                "The original host has not allowed additional hosts for this session."
            )

        try:
            await self._request(
                "POST",
                "session_hosts",
                json={
                    "session_id": session_id,
                    "user_id": user_id,
                    "approved_by": owner_id,
                },
                prefer="return=representation",
            )
        except SupabaseError as exc:
            if exc.status_code != 409:
                raise

        updated = await self._get_session_row(session_id)
        self._invalidate_session_snapshot(session_id)
        return self._to_session(updated, user_id)

    async def set_host_join_access(
        self, session_id: str, allow_host_join: bool, user_id: str
    ) -> Session:
        await self._ensure_owner_access(session_id, user_id)
        response = await self._request(
            "PATCH",
            "sessions",
            params={"id": f"eq.{session_id}"},
            json={"allow_host_join": allow_host_join},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("session not found")
        self._invalidate_session_snapshot(session_id)
        return self._to_session(data[0], user_id)

    async def create_question(
        self, session_id: str, text: str, prompt_id: str | None = None
    ) -> Question:
        session_rows = await self._select(
            "sessions",
            {"select": "id,qna_open", "id": f"eq.{session_id}"},
        )
        if not session_rows:
            raise NotFoundError("session not found")
        if prompt_id:
            prompt_rows = await self._select(
                "qna_prompts",
                {"select": "*", "id": f"eq.{prompt_id}", "session_id": f"eq.{session_id}"},
            )
            if not prompt_rows:
                raise NotFoundError("prompt not found")
            if prompt_rows[0].get("status") != QnaPromptStatus.open.value:
                raise ConflictError("prompt is closed")
            status = QuestionStatus.pending
        else:
            if not session_rows[0].get("qna_open"):
                raise ConflictError("q&a is closed")
            status = QuestionStatus.pending
        question_id = str(uuid.uuid4())
        payload = {
            "id": question_id,
            "session_id": session_id,
            "prompt_id": prompt_id,
            "text": text,
            "status": status.value,
            "votes": 0,
        }
        response = await self._request(
            "POST", "questions", json=payload, prefer="return=representation"
        )
        data = response.json()
        self._invalidate_session_snapshot(session_id)
        return self._to_question(data[0])

    async def set_qna_status(
        self, session_id: str, is_open: bool, user_id: str
    ) -> Session:
        await self._ensure_host_access(session_id, user_id)
        response = await self._request(
            "PATCH",
            "sessions",
            params={"id": f"eq.{session_id}"},
            json={"qna_open": is_open},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("session not found")
        self._invalidate_session_snapshot(session_id)
        return self._to_session(data[0], user_id)

    async def set_qna_config(
        self,
        session_id: str,
        mode: QnaMode,
        prompt: str | None,
        user_id: str,
    ) -> Session:
        await self._ensure_host_access(session_id, user_id)
        response = await self._request(
            "PATCH",
            "sessions",
            params={"id": f"eq.{session_id}"},
            json={"qna_mode": mode.value, "qna_prompt": prompt},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("session not found")
        self._invalidate_session_snapshot(session_id)
        return self._to_session(data[0], user_id)

    async def create_qna_prompt(
        self, session_id: str, prompt: str, user_id: str
    ) -> QnaPrompt:
        await self.get_session(session_id, user_id)
        prompt_id = str(uuid.uuid4())
        payload = {
            "id": prompt_id,
            "session_id": session_id,
            "prompt": prompt,
            "status": QnaPromptStatus.closed.value,
        }
        response = await self._request(
            "POST", "qna_prompts", json=payload, prefer="return=representation"
        )
        data = response.json()
        self._invalidate_session_snapshot(session_id)
        return self._to_prompt(data[0])

    async def set_qna_prompt_status(
        self,
        session_id: str,
        prompt_id: str,
        status: QnaPromptStatus,
        user_id: str,
    ) -> QnaPrompt:
        await self.get_session(session_id, user_id)
        response = await self._request(
            "PATCH",
            "qna_prompts",
            params={"id": f"eq.{prompt_id}", "session_id": f"eq.{session_id}"},
            json={"status": status.value},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("prompt not found")
        self._invalidate_session_snapshot(session_id)
        return self._to_prompt(data[0])

    async def set_question_status(
        self,
        session_id: str,
        question_id: str,
        status: QuestionStatus,
        user_id: str,
    ) -> Question:
        await self.get_session(session_id, user_id)
        response = await self._request(
            "PATCH",
            "questions",
            params={"id": f"eq.{question_id}", "session_id": f"eq.{session_id}"},
            json={"status": status.value},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("question not found")
        self._invalidate_session_snapshot(session_id)
        return self._to_question(data[0])

    async def vote_question(
        self, session_id: str, question_id: str, client_id: str | None
    ) -> Question:
        question_rows = await self._select(
            "questions",
            {"select": "*", "id": f"eq.{question_id}", "session_id": f"eq.{session_id}"},
        )
        if not question_rows:
            raise NotFoundError("question not found")
        question = question_rows[0]

        if client_id:
            existing = await self._select(
                "question_votes",
                {
                    "select": "id",
                    "question_id": f"eq.{question_id}",
                    "client_id": f"eq.{client_id}",
                },
            )
            if existing:
                return self._to_question(question)

            await self._request(
                "POST",
                "question_votes",
                json={
                    "question_id": question_id,
                    "client_id": client_id,
                },
                prefer="return=representation",
            )

        updated_votes = (question.get("votes") or 0) + 1
        response = await self._request(
            "PATCH",
            "questions",
            params={"id": f"eq.{question_id}"},
            json={"votes": updated_votes},
            prefer="return=representation",
        )
        data = response.json()
        self._invalidate_session_snapshot(session_id)
        return self._to_question(data[0])

    async def create_poll(
        self,
        session_id: str,
        question: str,
        options: list[str],
        allow_multiple: bool,
        user_id: str,
    ) -> Poll:
        await self.get_session(session_id, user_id)
        poll_id = str(uuid.uuid4())
        poll_payload = {
            "id": poll_id,
            "session_id": session_id,
            "question": question,
            "status": PollStatus.closed.value,
            "allow_multiple": allow_multiple,
        }
        poll_response = await self._request(
            "POST", "polls", json=poll_payload, prefer="return=representation"
        )
        poll_data = poll_response.json()[0]
        option_payload = [
            {
                "id": str(uuid.uuid4()),
                "poll_id": poll_id,
                "label": label,
                "votes": 0,
                "position": index,
            }
            for index, label in enumerate(options)
        ]
        options_response = await self._request(
            "POST", "poll_options", json=option_payload, prefer="return=representation"
        )
        options_data = options_response.json()
        self._invalidate_session_snapshot(session_id)
        return self._to_poll(poll_data, options_data)

    async def set_poll_status(
        self, session_id: str, poll_id: str, status: PollStatus, user_id: str
    ) -> Poll:
        await self.get_session(session_id, user_id)
        response = await self._request(
            "PATCH",
            "polls",
            params={"id": f"eq.{poll_id}", "session_id": f"eq.{session_id}"},
            json={"status": status.value},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("poll not found")
        options = await self._select(
            "poll_options",
            {"select": "*", "poll_id": f"eq.{poll_id}", "order": "position.asc"},
        )
        self._invalidate_session_snapshot(session_id)
        return self._to_poll(data[0], options)

    async def update_poll(
        self,
        session_id: str,
        poll_id: str,
        user_id: str,
        *,
        question: str | None = None,
        option_labels: dict[str, str] | None = None,
    ) -> Poll:
        await self.get_session(session_id, user_id)
        if question is not None:
            response = await self._request(
                "PATCH",
                "polls",
                params={"id": f"eq.{poll_id}", "session_id": f"eq.{session_id}"},
                json={"question": question},
                prefer="return=representation",
            )
            data = response.json()
            if not data:
                raise NotFoundError("poll not found")
        else:
            rows = await self._select(
                "polls",
                {"select": "*", "id": f"eq.{poll_id}", "session_id": f"eq.{session_id}"},
            )
            if not rows:
                raise NotFoundError("poll not found")
            data = rows
        if option_labels:
            for opt_id, label in option_labels.items():
                await self._request(
                    "PATCH",
                    "poll_options",
                    params={"id": f"eq.{opt_id}", "poll_id": f"eq.{poll_id}"},
                    json={"label": label},
                    prefer="return=representation",
                )
        options = await self._select(
            "poll_options",
            {"select": "*", "poll_id": f"eq.{poll_id}", "order": "position.asc"},
        )
        self._invalidate_session_snapshot(session_id)
        return self._to_poll(data[0], options)

    async def vote_poll(
        self,
        session_id: str,
        poll_id: str,
        option_id: str,
        client_id: str | None,
    ) -> Poll:
        try:
            payload = await self._rpc(
                "vote_poll_atomic",
                {
                    "p_session_id": session_id,
                    "p_poll_id": poll_id,
                    "p_option_id": option_id,
                    "p_client_id": client_id,
                },
            )
        except SupabaseError as exc:
            detail = exc.detail.lower()
            if exc.code == "P0002" or "not found" in detail:
                raise NotFoundError(exc.detail) from exc
            if exc.code == "P0001" or "closed" in detail:
                raise ConflictError(exc.detail) from exc
            raise

        if not isinstance(payload, dict):
            raise SupabaseError(500, "vote_poll_atomic returned an invalid payload")
        options = payload.get("options")
        option_rows = options if isinstance(options, list) else []
        poll_data = {key: value for key, value in payload.items() if key != "options"}
        self._invalidate_session_snapshot(session_id)
        return self._to_poll(poll_data, option_rows)

    async def snapshot(self, session_id: str) -> SessionSnapshot:
        now = time.monotonic()
        cached_snapshot = self._get_cached_snapshot_copy(
            session_id, now, SNAPSHOT_CACHE_TTL_SECONDS
        )
        if cached_snapshot:
            return cached_snapshot

        inflight = self._snapshot_inflight.get(session_id)
        if inflight:
            try:
                snapshot = await inflight
            except SupabaseError:
                stale_snapshot = self._get_stale_snapshot_copy(session_id)
                if stale_snapshot:
                    return stale_snapshot
                raise
            return snapshot.model_copy(deep=True)

        task = asyncio.create_task(self._load_snapshot(session_id))
        self._snapshot_inflight[session_id] = task
        try:
            snapshot = await task
        except SupabaseError:
            stale_snapshot = self._get_stale_snapshot_copy(session_id)
            if stale_snapshot:
                return stale_snapshot
            raise
        finally:
            if self._snapshot_inflight.get(session_id) is task:
                self._snapshot_inflight.pop(session_id, None)

        self._snapshot_cache[session_id] = (time.monotonic(), snapshot)
        return snapshot.model_copy(deep=True)

    async def list_saved_themes(self, user_id: str) -> list[SavedTheme]:
        rows = await self._select(
            "saved_poll_game_themes",
            {
                "select": "*",
                "user_id": f"eq.{user_id}",
                "order": "updated_at.desc",
            },
        )
        return [self._to_saved_theme(row) for row in rows]

    async def save_saved_theme(
        self, user_id: str, name: str, theme: dict[str, Any]
    ) -> SavedTheme:
        response = await self._request(
            "POST",
            "saved_poll_game_themes",
            params={"on_conflict": "user_id,name"},
            json={"user_id": user_id, "name": name, "theme": theme},
            prefer="resolution=merge-duplicates,return=representation",
        )
        data = response.json()
        if not data:
            raise SupabaseError(500, "failed to save theme")
        return self._to_saved_theme(data[0])

    async def delete_saved_theme(self, user_id: str, name: str) -> SavedTheme:
        response = await self._request(
            "DELETE",
            "saved_poll_game_themes",
            params={"user_id": f"eq.{user_id}", "name": f"eq.{name}"},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("saved theme not found")
        return self._to_saved_theme(data[0])

    async def list_brand_profiles(self, user_id: str) -> list[BrandProfile]:
        rows = await self._select(
            "brand_profiles",
            {
                "select": "*",
                "user_id": f"eq.{user_id}",
                "order": "updated_at.desc",
            },
        )
        return [self._to_brand_profile(row) for row in rows]

    async def save_brand_profile(
        self,
        user_id: str,
        name: str,
        source_type: str,
        source_filename: str,
        guidelines: dict[str, Any],
        raw_summary: str,
    ) -> BrandProfile:
        response = await self._request(
            "POST",
            "brand_profiles",
            params={"on_conflict": "user_id,name"},
            json={
                "user_id": user_id,
                "name": name,
                "source_type": source_type,
                "source_filename": source_filename,
                "guidelines": guidelines,
                "raw_summary": raw_summary,
            },
            prefer="resolution=merge-duplicates,return=representation",
        )
        data = response.json()
        if not data:
            raise SupabaseError(500, "failed to save brand profile")
        return self._to_brand_profile(data[0])

    async def delete_brand_profile(self, user_id: str, name: str) -> BrandProfile:
        response = await self._request(
            "DELETE",
            "brand_profiles",
            params={"user_id": f"eq.{user_id}", "name": f"eq.{name}"},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("brand profile not found")
        return self._to_brand_profile(data[0])

    async def list_saved_artifacts(self, user_id: str) -> list[SavedArtifact]:
        rows = await self._select(
            "saved_poll_game_artifacts",
            {
                "select": "*",
                "user_id": f"eq.{user_id}",
                "order": "updated_at.desc",
            },
        )
        return [self._to_saved_artifact(row) for row in rows]

    async def save_saved_artifact(
        self,
        user_id: str,
        name: str,
        html: str,
        artifact_package: dict[str, Any] | None,
        last_prompt: str | None,
        last_answers: dict[str, Any],
        theme_snapshot: dict[str, Any] | None,
        style_overrides: dict[str, Any] | None = None,
    ) -> SavedArtifact:
        response = await self._request(
            "POST",
            "saved_poll_game_artifacts",
            params={"on_conflict": "user_id,name"},
            json={
                "user_id": user_id,
                "name": name,
                "html": html,
                "artifact_package": artifact_package,
                "last_prompt": last_prompt,
                "last_answers": last_answers,
                "theme_snapshot": theme_snapshot,
                "style_overrides": style_overrides,
            },
            prefer="resolution=merge-duplicates,return=representation",
        )
        data = response.json()
        if not data:
            raise SupabaseError(500, "failed to save artifact")
        saved = self._to_saved_artifact(data[0])
        try:
            await self._record_saved_artifact_version(
                user_id=user_id,
                artifact=saved,
                source="save",
            )
        except SupabaseError as exc:
            logger.warning(
                "Saved artifact versioning is unavailable; continuing without version snapshot: %s",
                exc.detail,
            )
        return saved

    async def delete_saved_artifact(self, user_id: str, name: str) -> SavedArtifact:
        response = await self._request(
            "DELETE",
            "saved_poll_game_artifacts",
            params={"user_id": f"eq.{user_id}", "name": f"eq.{name}"},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("saved artifact not found")
        return self._to_saved_artifact(data[0])

    async def list_saved_artifact_versions(
        self, user_id: str, name: str, limit: int = 30
    ) -> list[SavedArtifactVersion]:
        artifacts = await self._select(
            "saved_poll_game_artifacts",
            {
                "select": "*",
                "user_id": f"eq.{user_id}",
                "name": f"eq.{name}",
                "limit": "1",
            },
        )
        if not artifacts:
            raise NotFoundError("saved artifact not found")
        artifact_id = str(artifacts[0]["id"])
        params: dict[str, str] = {
            "select": "*",
            "artifact_id": f"eq.{artifact_id}",
            "user_id": f"eq.{user_id}",
            "order": "version.desc",
        }
        if limit > 0:
            params["limit"] = str(limit)
        try:
            rows = await self._select("saved_poll_game_artifact_versions", params)
        except SupabaseError as exc:
            logger.warning(
                "Saved artifact versions table is unavailable; using legacy fallback: %s",
                exc.detail,
            )
            rows = []
        if not rows:
            base = artifacts[0]
            return [
                SavedArtifactVersion(
                    id=str(base.get("id")),
                    artifact_id=str(base.get("id")),
                    name=str(base.get("name") or name),
                    version=1,
                    html=str(base.get("html") or ""),
                    artifact_package=(
                        base.get("artifact_package")
                        if isinstance(base.get("artifact_package"), dict)
                        else None
                    ),
                    last_prompt=(
                        str(base.get("last_prompt"))
                        if base.get("last_prompt") is not None
                        else None
                    ),
                    last_answers=(
                        base.get("last_answers")
                        if isinstance(base.get("last_answers"), dict)
                        else {}
                    ),
                    theme_snapshot=(
                        base.get("theme_snapshot")
                        if isinstance(base.get("theme_snapshot"), dict)
                        else None
                    ),
                    style_overrides=(
                        base.get("style_overrides")
                        if isinstance(base.get("style_overrides"), dict)
                        else None
                    ),
                    source="legacy-import",
                    created_at=base.get("updated_at") or base.get("created_at"),
                )
            ]
        return [self._to_saved_artifact_version(row) for row in rows]

    async def restore_saved_artifact_version(
        self,
        user_id: str,
        name: str,
        version: int,
    ) -> SavedArtifact:
        artifacts = await self._select(
            "saved_poll_game_artifacts",
            {
                "select": "*",
                "user_id": f"eq.{user_id}",
                "name": f"eq.{name}",
                "limit": "1",
            },
        )
        if not artifacts:
            raise NotFoundError("saved artifact not found")
        artifact_row = artifacts[0]
        artifact_id = str(artifact_row["id"])

        version_row: dict[str, Any] | None = None
        try:
            version_rows = await self._select(
                "saved_poll_game_artifact_versions",
                {
                    "select": "*",
                    "artifact_id": f"eq.{artifact_id}",
                    "user_id": f"eq.{user_id}",
                    "version": f"eq.{version}",
                    "limit": "1",
                },
            )
            version_row = version_rows[0] if version_rows else None
        except SupabaseError as exc:
            logger.warning(
                "Saved artifact versions table is unavailable during restore: %s",
                exc.detail,
            )

        if not version_row:
            if version != 1:
                raise NotFoundError("saved artifact version not found")
            version_row = artifact_row

        response = await self._request(
            "PATCH",
            "saved_poll_game_artifacts",
            params={
                "id": f"eq.{artifact_id}",
                "user_id": f"eq.{user_id}",
            },
            json={
                "html": str(version_row.get("html") or ""),
                "artifact_package": (
                    version_row.get("artifact_package")
                    if isinstance(version_row.get("artifact_package"), dict)
                    else None
                ),
                "last_prompt": (
                    str(version_row.get("last_prompt"))
                    if version_row.get("last_prompt") is not None
                    else None
                ),
                "last_answers": (
                    version_row.get("last_answers")
                    if isinstance(version_row.get("last_answers"), dict)
                    else {}
                ),
                "theme_snapshot": (
                    version_row.get("theme_snapshot")
                    if isinstance(version_row.get("theme_snapshot"), dict)
                    else None
                ),
                "style_overrides": (
                    version_row.get("style_overrides")
                    if isinstance(version_row.get("style_overrides"), dict)
                    else None
                ),
            },
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("saved artifact not found")
        restored = self._to_saved_artifact(data[0])
        try:
            await self._record_saved_artifact_version(
                user_id=user_id,
                artifact=restored,
                source="restore",
            )
        except SupabaseError as exc:
            logger.warning(
                "Saved artifact versioning is unavailable after restore: %s",
                exc.detail,
            )
        return restored

    async def record_event(self, session_id: str, event: object) -> None:
        return None
