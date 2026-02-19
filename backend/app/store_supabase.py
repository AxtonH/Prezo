from __future__ import annotations

import uuid
from typing import Any

import httpx

from .models import (
    Poll,
    PollOption,
    PollStatus,
    QnaPrompt,
    QnaPromptStatus,
    QnaMode,
    Question,
    QuestionStatus,
    Session,
    SessionSnapshot,
    SessionStatus,
)
from .store import ConflictError, NotFoundError, generate_code


class SupabaseError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class SupabaseStore:
    def __init__(self, supabase_url: str, service_role_key: str) -> None:
        self._base_url = supabase_url.rstrip("/") + "/rest/v1"
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }

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
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.request(
                method,
                f"{self._base_url}/{path}",
                params=params,
                json=json,
                headers=headers,
            )
        if response.status_code >= 400:
            raise SupabaseError(response.status_code, response.text)
        return response

    async def _select(
        self, table: str, params: dict[str, str]
    ) -> list[dict[str, Any]]:
        response = await self._request("GET", table, params=params)
        return response.json()

    def _to_session(self, data: dict[str, Any]) -> Session:
        payload = {k: v for k, v in data.items() if k != "user_id"}
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
                return self._to_session(data[0])
        raise ConflictError("failed to allocate session code")

    async def get_session(self, session_id: str, user_id: str | None = None) -> Session:
        params = {"select": "*", "id": f"eq.{session_id}"}
        if user_id:
            params["user_id"] = f"eq.{user_id}"
        rows = await self._select("sessions", params)
        if not rows:
            raise NotFoundError("session not found")
        return self._to_session(rows[0])

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
        params = {
            "select": "*",
            "user_id": f"eq.{user_id}",
            "order": "created_at.desc",
        }
        if status:
            params["status"] = f"eq.{status.value}"
        if limit:
            params["limit"] = str(limit)
        rows = await self._select("sessions", params)
        return [self._to_session(row) for row in rows]

    async def delete_session(self, session_id: str, user_id: str) -> Session:
        response = await self._request(
            "DELETE",
            "sessions",
            params={"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("session not found")
        return self._to_session(data[0])

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
        return self._to_question(data[0])

    async def set_qna_status(
        self, session_id: str, is_open: bool, user_id: str
    ) -> Session:
        response = await self._request(
            "PATCH",
            "sessions",
            params={"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
            json={"qna_open": is_open},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("session not found")
        return self._to_session(data[0])

    async def set_qna_config(
        self,
        session_id: str,
        mode: QnaMode,
        prompt: str | None,
        user_id: str,
    ) -> Session:
        response = await self._request(
            "PATCH",
            "sessions",
            params={"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
            json={"qna_mode": mode.value, "qna_prompt": prompt},
            prefer="return=representation",
        )
        data = response.json()
        if not data:
            raise NotFoundError("session not found")
        return self._to_session(data[0])

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
        return self._to_poll(data[0], options)

    async def vote_poll(
        self,
        session_id: str,
        poll_id: str,
        option_id: str,
        client_id: str | None,
    ) -> Poll:
        poll_rows = await self._select(
            "polls",
            {"select": "*", "id": f"eq.{poll_id}", "session_id": f"eq.{session_id}"},
        )
        if not poll_rows:
            raise NotFoundError("poll not found")
        poll = poll_rows[0]
        if poll.get("status") != PollStatus.open.value:
            raise ConflictError("poll is closed")

        option_rows = await self._select(
            "poll_options",
            {"select": "*", "id": f"eq.{option_id}", "poll_id": f"eq.{poll_id}"},
        )
        if not option_rows:
            raise NotFoundError("option not found")
        option = option_rows[0]

        if client_id:
            if not poll.get("allow_multiple"):
                existing_votes = await self._select(
                    "poll_votes",
                    {
                        "select": "id, option_id",
                        "poll_id": f"eq.{poll_id}",
                        "client_id": f"eq.{client_id}",
                    },
                )
                if existing_votes:
                    if any(row.get("option_id") == option_id for row in existing_votes):
                        options = await self._select(
                            "poll_options",
                            {
                                "select": "*",
                                "poll_id": f"eq.{poll_id}",
                                "order": "position.asc",
                            },
                        )
                        return self._to_poll(poll, options)

                    await self._request(
                        "DELETE",
                        "poll_votes",
                        params={
                            "poll_id": f"eq.{poll_id}",
                            "client_id": f"eq.{client_id}",
                        },
                    )
                    for row in existing_votes:
                        previous_option_id = row.get("option_id")
                        if not previous_option_id:
                            continue
                        previous_option_rows = await self._select(
                            "poll_options",
                            {
                                "select": "id, votes",
                                "poll_id": f"eq.{poll_id}",
                                "id": f"eq.{previous_option_id}",
                            },
                        )
                        if not previous_option_rows:
                            continue
                        previous_option = previous_option_rows[0]
                        updated_prev_votes = max(
                            0, (previous_option.get("votes") or 0) - 1
                        )
                        await self._request(
                            "PATCH",
                            "poll_options",
                            params={"id": f"eq.{previous_option_id}"},
                            json={"votes": updated_prev_votes},
                            prefer="return=representation",
                        )
            else:
                existing_option = await self._select(
                    "poll_votes",
                    {
                        "select": "id",
                        "poll_id": f"eq.{poll_id}",
                        "client_id": f"eq.{client_id}",
                        "option_id": f"eq.{option_id}",
                    },
                )
                if existing_option:
                    options = await self._select(
                        "poll_options",
                        {
                            "select": "*",
                            "poll_id": f"eq.{poll_id}",
                            "order": "position.asc",
                        },
                    )
                    return self._to_poll(poll, options)

            await self._request(
                "POST",
                "poll_votes",
                json={
                    "poll_id": poll_id,
                    "option_id": option_id,
                    "client_id": client_id,
                },
                prefer="return=representation",
            )

        updated_votes = (option.get("votes") or 0) + 1
        await self._request(
            "PATCH",
            "poll_options",
            params={"id": f"eq.{option_id}"},
            json={"votes": updated_votes},
            prefer="return=representation",
        )

        options = await self._select(
            "poll_options",
            {"select": "*", "poll_id": f"eq.{poll_id}", "order": "position.asc"},
        )
        return self._to_poll(poll, options)

    async def snapshot(self, session_id: str) -> SessionSnapshot:
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

    async def record_event(self, session_id: str, event: object) -> None:
        return None
