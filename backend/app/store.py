from __future__ import annotations

import asyncio
import secrets
import uuid
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .artifact_package import build_saved_artifact_snapshot_signature
from .models import (
    BrandProfile,
    Event,
    HostDashboardStats,
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


class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    pass


class PermissionDeniedError(Exception):
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
    qna_mode: QnaMode
    qna_prompt: str | None
    allow_host_join: bool
    created_at: datetime


@dataclass(slots=True)
class QuestionData:
    id: str
    session_id: str
    prompt_id: str | None
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


@dataclass(slots=True)
class QnaPromptData:
    id: str
    session_id: str
    prompt: str
    status: QnaPromptStatus
    created_at: datetime


@dataclass(slots=True)
class BrandProfileData:
    id: str
    user_id: str
    name: str
    source_type: str
    source_filename: str
    guidelines: dict[str, Any]
    raw_summary: str
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class SavedThemeData:
    id: str
    user_id: str
    name: str
    theme: dict[str, Any]
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class SavedArtifactData:
    id: str
    user_id: str
    name: str
    html: str
    artifact_package: dict[str, Any] | None
    last_prompt: str | None
    last_answers: dict[str, Any]
    theme_snapshot: dict[str, Any] | None
    style_overrides: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class SavedArtifactVersionData:
    id: str
    artifact_id: str
    user_id: str
    name: str
    version: int
    html: str
    artifact_package: dict[str, Any] | None
    last_prompt: str | None
    last_answers: dict[str, Any]
    theme_snapshot: dict[str, Any] | None
    style_overrides: dict[str, Any] | None
    source: str | None
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
        self._prompts: dict[str, QnaPromptData] = {}
        self._prompts_by_session: dict[str, list[str]] = defaultdict(list)
        self._question_votes: dict[str, set[str]] = defaultdict(set)
        self._poll_votes: dict[str, dict[str, set[str]]] = defaultdict(dict)
        self._events_by_session: dict[str, list[Event]] = defaultdict(list)
        self._session_hosts: dict[str, set[str]] = defaultdict(set)
        self._saved_themes_by_user: dict[str, dict[str, SavedThemeData]] = defaultdict(dict)
        self._saved_artifacts_by_user: dict[str, dict[str, SavedArtifactData]] = defaultdict(dict)
        self._brand_profiles_by_user: dict[str, dict[str, BrandProfileData]] = defaultdict(dict)
        self._saved_artifact_versions_by_user: dict[
            str, dict[str, list[SavedArtifactVersionData]]
        ] = defaultdict(lambda: defaultdict(list))

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
                qna_mode=QnaMode.audience,
                qna_prompt=None,
                allow_host_join=False,
                created_at=utc_now(),
            )
            self._sessions[session_id] = data
            self._sessions_by_code[code] = session_id
            self._session_hosts[session_id].add(user_id)
            return self._to_session(data, user_id)

    async def get_session(self, session_id: str, user_id: str | None = None) -> Session:
        async with self._lock:
            if user_id:
                self._ensure_host_access(session_id, user_id)
            data = self._sessions.get(session_id)
            if not data:
                raise NotFoundError("session not found")
            return self._to_session(data, user_id)

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
                self._to_session(session, user_id)
                for session in self._sessions.values()
                if user_id in self._session_hosts.get(session.id, set())
                and (status is None or session.status == status)
            ]
            sessions.sort(key=lambda item: item.created_at, reverse=True)
            if limit:
                sessions = sessions[:limit]
            return sessions

    async def host_dashboard_stats(self, user_id: str) -> HostDashboardStats:
        async with self._lock:
            session_ids = [
                sid
                for sid, hosts in self._session_hosts.items()
                if user_id in hosts
            ]
            if not session_ids:
                return HostDashboardStats(
                    active_sessions=0,
                    active_events=0,
                    unique_participants=0,
                )

            active_sessions = 0
            active_events = 0
            unique_clients: set[str] = set()

            for session_id in session_ids:
                session = self._sessions.get(session_id)
                if not session:
                    continue
                if session.status == SessionStatus.active:
                    active_sessions += 1
                if session.qna_open:
                    active_events += 1
                for pid in self._polls_by_session.get(session_id, []):
                    poll = self._polls.get(pid)
                    if poll and poll.status == PollStatus.open:
                        active_events += 1
                for prid in self._prompts_by_session.get(session_id, []):
                    pr = self._prompts.get(prid)
                    if pr and pr.status == QnaPromptStatus.open:
                        active_events += 1

            for qid, clients in self._question_votes.items():
                q = self._questions.get(qid)
                if not q or q.session_id not in session_ids:
                    continue
                for c in clients:
                    if c:
                        unique_clients.add(c)

            for poll_id, client_map in self._poll_votes.items():
                poll = self._polls.get(poll_id)
                if not poll or poll.session_id not in session_ids:
                    continue
                for c in client_map:
                    if c:
                        unique_clients.add(c)

            return HostDashboardStats(
                active_sessions=active_sessions,
                active_events=active_events,
                unique_participants=len(unique_clients),
            )

    async def delete_session(self, session_id: str, user_id: str) -> Session:
        async with self._lock:
            self._ensure_owner_access(session_id, user_id)
            session = self._sessions.pop(session_id)
            self._sessions_by_code.pop(session.code, None)

            question_ids = self._questions_by_session.pop(session_id, [])
            for question_id in question_ids:
                self._questions.pop(question_id, None)
                self._question_votes.pop(question_id, None)

            poll_ids = self._polls_by_session.pop(session_id, [])
            for poll_id in poll_ids:
                self._polls.pop(poll_id, None)
                self._poll_votes.pop(poll_id, None)

            prompt_ids = self._prompts_by_session.pop(session_id, [])
            for prompt_id in prompt_ids:
                self._prompts.pop(prompt_id, None)

            self._events_by_session.pop(session_id, None)
            self._session_hosts.pop(session_id, None)

            return self._to_session(session, user_id)

    async def join_session_as_host(self, code: str, user_id: str) -> Session:
        async with self._lock:
            session_id = self._sessions_by_code.get(code.upper())
            if not session_id:
                raise NotFoundError("session not found")
            session = self._sessions[session_id]
            hosts = self._session_hosts[session_id]
            if user_id in hosts:
                return self._to_session(session, user_id)
            if not session.allow_host_join:
                raise PermissionDeniedError(
                    "The original host has not allowed additional hosts for this session."
                )
            hosts.add(user_id)
            return self._to_session(session, user_id)

    async def set_host_join_access(
        self, session_id: str, allow_host_join: bool, user_id: str
    ) -> Session:
        async with self._lock:
            self._ensure_owner_access(session_id, user_id)
            session = self._sessions[session_id]
            session.allow_host_join = allow_host_join
            return self._to_session(session, user_id)

    async def create_question(
        self, session_id: str, text: str, prompt_id: str | None = None
    ) -> Question:
        async with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                raise NotFoundError("session not found")
            if prompt_id:
                prompt = self._prompts.get(prompt_id)
                if not prompt or prompt.session_id != session_id:
                    raise NotFoundError("prompt not found")
                if prompt.status != QnaPromptStatus.open:
                    raise ConflictError("prompt is closed")
                status = QuestionStatus.pending
            else:
                if not session.qna_open:
                    raise ConflictError("q&a is closed")
                status = QuestionStatus.pending
            question_id = uuid.uuid4().hex
            data = QuestionData(
                id=question_id,
                session_id=session_id,
                prompt_id=prompt_id,
                text=text,
                status=status,
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
            self._ensure_host_access(session_id, user_id)
            session = self._sessions[session_id]
            session.qna_open = is_open
            return self._to_session(session, user_id)

    async def set_qna_config(
        self,
        session_id: str,
        mode: QnaMode,
        prompt: str | None,
        user_id: str,
    ) -> Session:
        async with self._lock:
            self._ensure_host_access(session_id, user_id)
            session = self._sessions[session_id]
            session.qna_mode = mode
            session.qna_prompt = prompt
            return self._to_session(session, user_id)

    async def create_qna_prompt(
        self, session_id: str, prompt: str, user_id: str
    ) -> QnaPrompt:
        async with self._lock:
            self._ensure_host_access(session_id, user_id)
            prompt_id = uuid.uuid4().hex
            data = QnaPromptData(
                id=prompt_id,
                session_id=session_id,
                prompt=prompt,
                status=QnaPromptStatus.closed,
                created_at=utc_now(),
            )
            self._prompts[prompt_id] = data
            self._prompts_by_session[session_id].append(prompt_id)
            return self._to_prompt(data)

    async def set_qna_prompt_status(
        self,
        session_id: str,
        prompt_id: str,
        status: QnaPromptStatus,
        user_id: str,
    ) -> QnaPrompt:
        async with self._lock:
            self._ensure_host_access(session_id, user_id)
            prompt = self._get_prompt(session_id, prompt_id)
            prompt.status = status
            return self._to_prompt(prompt)

    async def set_question_status(
        self,
        session_id: str,
        question_id: str,
        status: QuestionStatus,
        user_id: str,
    ) -> Question:
        async with self._lock:
            self._ensure_host_access(session_id, user_id)
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
            self._ensure_host_access(session_id, user_id)
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
            self._ensure_host_access(session_id, user_id)
            poll = self._get_poll(session_id, poll_id)
            poll.status = status
            return self._to_poll(poll)

    async def update_poll(
        self,
        session_id: str,
        poll_id: str,
        user_id: str,
        *,
        question: str | None = None,
        option_labels: dict[str, str] | None = None,
    ) -> Poll:
        async with self._lock:
            self._ensure_host_access(session_id, user_id)
            poll = self._get_poll(session_id, poll_id)
            if question is not None:
                poll.question = question
            if option_labels:
                for opt in poll.options:
                    if opt.id in option_labels:
                        opt.label = option_labels[opt.id]
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
            option = next((opt for opt in poll.options if opt.id == option_id), None)
            if not option:
                raise NotFoundError("option not found")
            if client_id:
                history = self._poll_votes[poll_id].get(client_id, set())
                if option_id in history:
                    return self._to_poll(poll)
                if not poll.allow_multiple and history:
                    for previous_id in list(history):
                        previous_option = next(
                            (opt for opt in poll.options if opt.id == previous_id), None
                        )
                        if previous_option:
                            previous_option.votes = max(0, previous_option.votes - 1)
                    history = set()
                history.add(option_id)
                self._poll_votes[poll_id][client_id] = history
            option.votes += 1
            return self._to_poll(poll)

    async def delete_poll(self, session_id: str, poll_id: str, user_id: str) -> None:
        async with self._lock:
            self._ensure_host_access(session_id, user_id)
            self._get_poll(session_id, poll_id)
            del self._polls[poll_id]
            self._polls_by_session[session_id] = [
                p for p in self._polls_by_session[session_id] if p != poll_id
            ]
            self._poll_votes.pop(poll_id, None)

    async def delete_qna_prompt(self, session_id: str, prompt_id: str, user_id: str) -> None:
        async with self._lock:
            self._ensure_host_access(session_id, user_id)
            self._get_prompt(session_id, prompt_id)
            qids_to_remove = [
                qid
                for qid, q in self._questions.items()
                if q.session_id == session_id and q.prompt_id == prompt_id
            ]
            for qid in qids_to_remove:
                self._questions.pop(qid, None)
                self._question_votes.pop(qid, None)
                try:
                    self._questions_by_session[session_id].remove(qid)
                except ValueError:
                    pass
            del self._prompts[prompt_id]
            self._prompts_by_session[session_id] = [
                p for p in self._prompts_by_session[session_id] if p != prompt_id
            ]

    async def delete_audience_questions(self, session_id: str, user_id: str) -> list[str]:
        """Remove session questions that are not tied to an open-discussion prompt (audience Q&A)."""
        async with self._lock:
            self._ensure_host_access(session_id, user_id)
            qids_to_remove = [
                qid
                for qid in self._questions_by_session.get(session_id, [])
                if self._questions[qid].prompt_id is None
            ]
            for qid in qids_to_remove:
                self._questions.pop(qid, None)
                self._question_votes.pop(qid, None)
                try:
                    self._questions_by_session[session_id].remove(qid)
                except ValueError:
                    pass
            return qids_to_remove

    async def snapshot(
        self, session_id: str, viewer_user_id: str | None = None
    ) -> SessionSnapshot:
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
            prompts = [
                self._to_prompt(self._prompts[pid])
                for pid in self._prompts_by_session[session_id]
            ]
            return SessionSnapshot(
                session=self._to_session(session, viewer_user_id),
                questions=questions,
                polls=polls,
                prompts=prompts,
            )

    async def list_saved_themes(self, user_id: str) -> list[SavedTheme]:
        async with self._lock:
            themes = list(self._saved_themes_by_user.get(user_id, {}).values())
            themes.sort(key=lambda item: item.updated_at, reverse=True)
            return [self._to_saved_theme(item) for item in themes]

    async def save_saved_theme(
        self, user_id: str, name: str, theme: dict[str, Any]
    ) -> SavedTheme:
        async with self._lock:
            existing = self._saved_themes_by_user[user_id].get(name)
            now = utc_now()
            if existing:
                existing.theme = clone_dict(theme)
                existing.updated_at = now
                return self._to_saved_theme(existing)
            created = SavedThemeData(
                id=uuid.uuid4().hex,
                user_id=user_id,
                name=name,
                theme=clone_dict(theme),
                created_at=now,
                updated_at=now,
            )
            self._saved_themes_by_user[user_id][name] = created
            return self._to_saved_theme(created)

    async def delete_saved_theme(self, user_id: str, name: str) -> SavedTheme:
        async with self._lock:
            existing = self._saved_themes_by_user.get(user_id, {}).pop(name, None)
            if not existing:
                raise NotFoundError("saved theme not found")
            return self._to_saved_theme(existing)

    async def list_brand_profiles(self, user_id: str) -> list[BrandProfile]:
        async with self._lock:
            profiles = list(self._brand_profiles_by_user.get(user_id, {}).values())
            profiles.sort(key=lambda item: item.updated_at, reverse=True)
            return [self._to_brand_profile(item) for item in profiles]

    async def save_brand_profile(
        self,
        user_id: str,
        name: str,
        source_type: str,
        source_filename: str,
        guidelines: dict[str, Any],
        raw_summary: str,
    ) -> BrandProfile:
        async with self._lock:
            existing = self._brand_profiles_by_user[user_id].get(name)
            now = utc_now()
            if existing:
                existing.source_type = source_type
                existing.source_filename = source_filename
                existing.guidelines = clone_dict(guidelines)
                existing.raw_summary = raw_summary
                existing.updated_at = now
                return self._to_brand_profile(existing)
            created = BrandProfileData(
                id=uuid.uuid4().hex,
                user_id=user_id,
                name=name,
                source_type=source_type,
                source_filename=source_filename,
                guidelines=clone_dict(guidelines),
                raw_summary=raw_summary,
                created_at=now,
                updated_at=now,
            )
            self._brand_profiles_by_user[user_id][name] = created
            return self._to_brand_profile(created)

    async def delete_brand_profile(self, user_id: str, name: str) -> BrandProfile:
        async with self._lock:
            existing = self._brand_profiles_by_user.get(user_id, {}).pop(name, None)
            if not existing:
                raise NotFoundError("brand profile not found")
            return self._to_brand_profile(existing)

    async def list_saved_artifacts(self, user_id: str) -> list[SavedArtifact]:
        async with self._lock:
            artifacts = list(self._saved_artifacts_by_user.get(user_id, {}).values())
            artifacts.sort(key=lambda item: item.updated_at, reverse=True)
            return [self._to_saved_artifact(item) for item in artifacts]

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
        async with self._lock:
            existing = self._saved_artifacts_by_user[user_id].get(name)
            now = utc_now()
            next_signature = build_saved_artifact_snapshot_signature(
                html=html,
                artifact_package=clone_optional_dict(artifact_package),
                last_prompt=last_prompt,
                last_answers=clone_dict(last_answers),
                theme_snapshot=clone_optional_dict(theme_snapshot),
                style_overrides=clone_optional_dict(style_overrides),
            )
            if existing:
                existing_signature = build_saved_artifact_snapshot_signature(
                    html=existing.html,
                    artifact_package=clone_optional_dict(existing.artifact_package),
                    last_prompt=existing.last_prompt,
                    last_answers=clone_dict(existing.last_answers),
                    theme_snapshot=clone_optional_dict(existing.theme_snapshot),
                    style_overrides=clone_optional_dict(existing.style_overrides),
                )
                changed = existing_signature != next_signature
                existing.html = html
                existing.artifact_package = clone_optional_dict(artifact_package)
                existing.last_prompt = last_prompt
                existing.last_answers = clone_dict(last_answers)
                existing.theme_snapshot = clone_optional_dict(theme_snapshot)
                existing.style_overrides = clone_optional_dict(style_overrides)
                existing.updated_at = now
                if changed:
                    self._append_saved_artifact_version(existing, source="save")
                return self._to_saved_artifact(existing)
            created = SavedArtifactData(
                id=uuid.uuid4().hex,
                user_id=user_id,
                name=name,
                html=html,
                artifact_package=clone_optional_dict(artifact_package),
                last_prompt=last_prompt,
                last_answers=clone_dict(last_answers),
                theme_snapshot=clone_optional_dict(theme_snapshot),
                style_overrides=clone_optional_dict(style_overrides),
                created_at=now,
                updated_at=now,
            )
            self._saved_artifacts_by_user[user_id][name] = created
            self._append_saved_artifact_version(created, source="create")
            return self._to_saved_artifact(created)

    async def delete_saved_artifact(self, user_id: str, name: str) -> SavedArtifact:
        async with self._lock:
            existing = self._saved_artifacts_by_user.get(user_id, {}).pop(name, None)
            if not existing:
                raise NotFoundError("saved artifact not found")
            self._saved_artifact_versions_by_user.get(user_id, {}).pop(name, None)
            return self._to_saved_artifact(existing)

    async def list_saved_artifact_versions(
        self, user_id: str, name: str, limit: int = 30
    ) -> list[SavedArtifactVersion]:
        async with self._lock:
            artifact = self._saved_artifacts_by_user.get(user_id, {}).get(name)
            if not artifact:
                raise NotFoundError("saved artifact not found")
            versions = list(self._saved_artifact_versions_by_user[user_id].get(name, []))
            versions.sort(key=lambda item: item.version, reverse=True)
            if limit > 0:
                versions = versions[:limit]
            return [self._to_saved_artifact_version(item) for item in versions]

    async def restore_saved_artifact_version(
        self, user_id: str, name: str, version: int
    ) -> SavedArtifact:
        async with self._lock:
            artifact = self._saved_artifacts_by_user.get(user_id, {}).get(name)
            if not artifact:
                raise NotFoundError("saved artifact not found")
            versions = self._saved_artifact_versions_by_user.get(user_id, {}).get(name, [])
            target = next((item for item in versions if item.version == version), None)
            if not target:
                raise NotFoundError("saved artifact version not found")

            existing_signature = build_saved_artifact_snapshot_signature(
                html=artifact.html,
                artifact_package=clone_optional_dict(artifact.artifact_package),
                last_prompt=artifact.last_prompt,
                last_answers=clone_dict(artifact.last_answers),
                theme_snapshot=clone_optional_dict(artifact.theme_snapshot),
                style_overrides=clone_optional_dict(artifact.style_overrides),
            )
            target_signature = build_saved_artifact_snapshot_signature(
                html=target.html,
                artifact_package=clone_optional_dict(target.artifact_package),
                last_prompt=target.last_prompt,
                last_answers=clone_dict(target.last_answers),
                theme_snapshot=clone_optional_dict(target.theme_snapshot),
                style_overrides=clone_optional_dict(target.style_overrides),
            )

            artifact.html = target.html
            artifact.artifact_package = clone_optional_dict(target.artifact_package)
            artifact.last_prompt = target.last_prompt
            artifact.last_answers = clone_dict(target.last_answers)
            artifact.theme_snapshot = clone_optional_dict(target.theme_snapshot)
            artifact.style_overrides = clone_optional_dict(target.style_overrides)
            artifact.updated_at = utc_now()
            if existing_signature != target_signature:
                self._append_saved_artifact_version(artifact, source="restore")
            return self._to_saved_artifact(artifact)

    async def record_event(self, session_id: str, event: Event) -> None:
        async with self._lock:
            self._events_by_session[session_id].append(event)

    def _ensure_session(self, session_id: str) -> None:
        session = self._sessions.get(session_id)
        if not session:
            raise NotFoundError("session not found")

    def _ensure_host_access(self, session_id: str, user_id: str) -> None:
        session = self._sessions.get(session_id)
        if not session:
            raise NotFoundError("session not found")
        if user_id not in self._session_hosts.get(session_id, set()):
            raise NotFoundError("session not found")

    def _ensure_owner_access(self, session_id: str, user_id: str) -> None:
        session = self._sessions.get(session_id)
        if not session:
            raise NotFoundError("session not found")
        if session.user_id != user_id:
            raise PermissionDeniedError(
                "Only the original host can perform this action."
            )

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

    def _get_prompt(self, session_id: str, prompt_id: str) -> QnaPromptData:
        self._ensure_session(session_id)
        prompt = self._prompts.get(prompt_id)
        if not prompt or prompt.session_id != session_id:
            raise NotFoundError("prompt not found")
        return prompt

    def _to_session(
        self, data: SessionData, viewer_user_id: str | None = None
    ) -> Session:
        return Session(
            id=data.id,
            code=data.code,
            title=data.title,
            status=data.status,
            qna_open=data.qna_open,
            qna_mode=data.qna_mode,
            qna_prompt=data.qna_prompt,
            allow_host_join=data.allow_host_join,
            is_original_host=(
                data.user_id == viewer_user_id
                if viewer_user_id is not None
                else None
            ),
            created_at=data.created_at,
        )

    def _to_question(self, data: QuestionData) -> Question:
        return Question(
            id=data.id,
            session_id=data.session_id,
            prompt_id=data.prompt_id,
            text=data.text,
            status=data.status,
            votes=data.votes,
            created_at=data.created_at,
        )

    def _to_prompt(self, data: QnaPromptData) -> QnaPrompt:
        return QnaPrompt(
            id=data.id,
            session_id=data.session_id,
            prompt=data.prompt,
            status=data.status,
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

    def _to_saved_theme(self, data: SavedThemeData) -> SavedTheme:
        return SavedTheme(
            id=data.id,
            name=data.name,
            theme=clone_dict(data.theme),
            created_at=data.created_at,
            updated_at=data.updated_at,
        )

    def _to_brand_profile(self, data: BrandProfileData) -> BrandProfile:
        return BrandProfile(
            id=data.id,
            name=data.name,
            source_type=data.source_type,
            source_filename=data.source_filename,
            guidelines=clone_dict(data.guidelines),
            raw_summary=data.raw_summary,
            created_at=data.created_at,
            updated_at=data.updated_at,
        )

    def _to_saved_artifact(self, data: SavedArtifactData) -> SavedArtifact:
        return SavedArtifact(
            id=data.id,
            name=data.name,
            html=data.html,
            artifact_package=clone_optional_dict(data.artifact_package),
            last_prompt=data.last_prompt,
            last_answers=clone_dict(data.last_answers),
            theme_snapshot=clone_optional_dict(data.theme_snapshot),
            style_overrides=clone_optional_dict(data.style_overrides),
            created_at=data.created_at,
            updated_at=data.updated_at,
        )

    def _append_saved_artifact_version(
        self, data: SavedArtifactData, *, source: str | None
    ) -> None:
        versions = self._saved_artifact_versions_by_user[data.user_id][data.name]
        next_version = versions[-1].version + 1 if versions else 1
        versions.append(
            SavedArtifactVersionData(
                id=uuid.uuid4().hex,
                artifact_id=data.id,
                user_id=data.user_id,
                name=data.name,
                version=next_version,
                html=data.html,
                artifact_package=clone_optional_dict(data.artifact_package),
                last_prompt=data.last_prompt,
                last_answers=clone_dict(data.last_answers),
                theme_snapshot=clone_optional_dict(data.theme_snapshot),
                style_overrides=clone_optional_dict(data.style_overrides),
                source=source,
                created_at=utc_now(),
            )
        )

    def _to_saved_artifact_version(
        self, data: SavedArtifactVersionData
    ) -> SavedArtifactVersion:
        return SavedArtifactVersion(
            id=data.id,
            artifact_id=data.artifact_id,
            name=data.name,
            version=data.version,
            html=data.html,
            artifact_package=clone_optional_dict(data.artifact_package),
            last_prompt=data.last_prompt,
            last_answers=clone_dict(data.last_answers),
            theme_snapshot=clone_optional_dict(data.theme_snapshot),
            style_overrides=clone_optional_dict(data.style_overrides),
            source=data.source,
            created_at=data.created_at,
        )


def clone_dict(value: dict[str, Any]) -> dict[str, Any]:
    return deepcopy(value)


def clone_optional_dict(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if value is None:
        return None
    return clone_dict(value)
