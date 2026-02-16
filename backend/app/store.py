from __future__ import annotations

import asyncio
import secrets
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from .models import (
    Event,
    Poll,
    PollOption,
    PollStatus,
    Question,
    QuestionStatus,
    Session,
    SessionSnapshot,
    SessionStatus,
)


class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    pass


ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def generate_code(length: int = 6) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


@dataclass(slots=True)
class SessionData:
    id: str
    user_id: str
    code: str
    title: str | None
    status: SessionStatus
    qna_open: bool
    created_at: datetime


@dataclass(slots=True)
class QuestionData:
    id: str
    session_id: str
    text: str
    status: QuestionStatus
    votes: int
    created_at: datetime


@dataclass(slots=True)
class PollOptionData:
    id: str
    label: str
    votes: int


@dataclass(slots=True)
class PollData:
    id: str
    session_id: str
    question: str
    options: list[PollOptionData]
    status: PollStatus
    allow_multiple: bool
    created_at: datetime


class InMemoryStore:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._sessions: dict[str, SessionData] = {}
        self._sessions_by_code: dict[str, str] = {}
        self._questions: dict[str, QuestionData] = {}
        self._questions_by_session: dict[str, list[str]] = defaultdict(list)
        self._polls: dict[str, PollData] = {}
        self._polls_by_session: dict[str, list[str]] = defaultdict(list)
        self._question_votes: dict[str, set[str]] = defaultdict(set)
        self._poll_votes: dict[str, dict[str, set[str]]] = defaultdict(dict)
        self._events_by_session: dict[str, list[Event]] = defaultdict(list)

    async def create_session(self, title: str | None, user_id: str) -> Session:
        async with self._lock:
            session_id = uuid.uuid4().hex
            code = generate_code()
            while code in self._sessions_by_code:
                code = generate_code()
            data = SessionData(
                id=session_id,
                user_id=user_id,
                code=code,
                title=title,
                status=SessionStatus.active,
                qna_open=False,
                created_at=utc_now(),
            )
            self._sessions[session_id] = data
            self._sessions_by_code[code] = session_id
            return self._to_session(data)

    async def get_session(self, session_id: str, user_id: str | None = None) -> Session:
        async with self._lock:
            data = self._sessions.get(session_id)
            if not data or (user_id and data.user_id != user_id):
                raise NotFoundError("session not found")
            return self._to_session(data)

    async def get_session_by_code(self, code: str) -> Session:
        async with self._lock:
            session_id = self._sessions_by_code.get(code)
            if not session_id:
                raise NotFoundError("session not found")
            return self._to_session(self._sessions[session_id])

    async def list_sessions(
        self,
        user_id: str,
        status: SessionStatus | None = None,
        limit: int | None = None,
    ) -> list[Session]:
        async with self._lock:
            sessions = [
                self._to_session(session)
                for session in self._sessions.values()
                if session.user_id == user_id
                and (status is None or session.status == status)
            ]
            sessions.sort(key=lambda item: item.created_at, reverse=True)
            if limit:
                sessions = sessions[:limit]
            return sessions

    async def create_question(self, session_id: str, text: str) -> Question:
        async with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                raise NotFoundError("session not found")
            if not session.qna_open:
                raise ConflictError("q&a is closed")
            question_id = uuid.uuid4().hex
            data = QuestionData(
                id=question_id,
                session_id=session_id,
                text=text,
                status=QuestionStatus.pending,
                votes=0,
                created_at=utc_now(),
            )
            self._questions[question_id] = data
            self._questions_by_session[session_id].append(question_id)
            return self._to_question(data)

    async def set_qna_status(
        self, session_id: str, is_open: bool, user_id: str
    ) -> Session:
        async with self._lock:
            self._ensure_session(session_id, user_id)
            session = self._sessions[session_id]
            session.qna_open = is_open
            return self._to_session(session)

    async def set_question_status(
        self,
        session_id: str,
        question_id: str,
        status: QuestionStatus,
        user_id: str,
    ) -> Question:
        async with self._lock:
            self._ensure_session(session_id, user_id)
            question = self._get_question(session_id, question_id)
            question.status = status
            return self._to_question(question)

    async def vote_question(
        self, session_id: str, question_id: str, client_id: str | None
    ) -> Question:
        async with self._lock:
            question = self._get_question(session_id, question_id)
            if client_id:
                if client_id in self._question_votes[question_id]:
                    return self._to_question(question)
                self._question_votes[question_id].add(client_id)
            question.votes += 1
            return self._to_question(question)

    async def create_poll(
        self,
        session_id: str,
        question: str,
        options: list[str],
        allow_multiple: bool,
        user_id: str,
    ) -> Poll:
        async with self._lock:
            self._ensure_session(session_id, user_id)
            poll_id = uuid.uuid4().hex
            option_objs = [
                PollOptionData(id=uuid.uuid4().hex, label=label, votes=0)
                for label in options
            ]
            data = PollData(
                id=poll_id,
                session_id=session_id,
                question=question,
                options=option_objs,
                status=PollStatus.closed,
                allow_multiple=allow_multiple,
                created_at=utc_now(),
            )
            self._polls[poll_id] = data
            self._polls_by_session[session_id].append(poll_id)
            return self._to_poll(data)

    async def set_poll_status(
        self, session_id: str, poll_id: str, status: PollStatus, user_id: str
    ) -> Poll:
        async with self._lock:
            self._ensure_session(session_id, user_id)
            poll = self._get_poll(session_id, poll_id)
            poll.status = status
            return self._to_poll(poll)

    async def vote_poll(
        self,
        session_id: str,
        poll_id: str,
        option_id: str,
        client_id: str | None,
    ) -> Poll:
        async with self._lock:
            poll = self._get_poll(session_id, poll_id)
            if poll.status != PollStatus.open:
                raise ConflictError("poll is closed")
            if client_id:
                history = self._poll_votes[poll_id].get(client_id, set())
                if option_id in history:
                    return self._to_poll(poll)
                if not poll.allow_multiple and history:
                    return self._to_poll(poll)
                history.add(option_id)
                self._poll_votes[poll_id][client_id] = history
            option = next((opt for opt in poll.options if opt.id == option_id), None)
            if not option:
                raise NotFoundError("option not found")
            option.votes += 1
            return self._to_poll(poll)

    async def snapshot(self, session_id: str) -> SessionSnapshot:
        async with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                raise NotFoundError("session not found")
            questions = [
                self._to_question(self._questions[qid])
                for qid in self._questions_by_session[session_id]
            ]
            polls = [
                self._to_poll(self._polls[pid])
                for pid in self._polls_by_session[session_id]
            ]
            return SessionSnapshot(
                session=self._to_session(session),
                questions=questions,
                polls=polls,
            )

    async def record_event(self, session_id: str, event: Event) -> None:
        async with self._lock:
            self._events_by_session[session_id].append(event)

    def _ensure_session(self, session_id: str, user_id: str | None = None) -> None:
        session = self._sessions.get(session_id)
        if not session or (user_id and session.user_id != user_id):
            raise NotFoundError("session not found")

    def _get_question(self, session_id: str, question_id: str) -> QuestionData:
        self._ensure_session(session_id)
        question = self._questions.get(question_id)
        if not question or question.session_id != session_id:
            raise NotFoundError("question not found")
        return question

    def _get_poll(self, session_id: str, poll_id: str) -> PollData:
        self._ensure_session(session_id)
        poll = self._polls.get(poll_id)
        if not poll or poll.session_id != session_id:
            raise NotFoundError("poll not found")
        return poll

    def _to_session(self, data: SessionData) -> Session:
        return Session(
            id=data.id,
            code=data.code,
            title=data.title,
            status=data.status,
            qna_open=data.qna_open,
            created_at=data.created_at,
        )

    def _to_question(self, data: QuestionData) -> Question:
        return Question(
            id=data.id,
            session_id=data.session_id,
            text=data.text,
            status=data.status,
            votes=data.votes,
            created_at=data.created_at,
        )

    def _to_poll(self, data: PollData) -> Poll:
        return Poll(
            id=data.id,
            session_id=data.session_id,
            question=data.question,
            options=[
                PollOption(id=opt.id, label=opt.label, votes=opt.votes)
                for opt in data.options
            ],
            status=data.status,
            allow_multiple=data.allow_multiple,
            created_at=data.created_at,
        )
