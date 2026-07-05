from __future__ import annotations

import asyncio
from pathlib import Path
import sys
import time
from unittest import TestCase

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api import qna_prompts as prompts_api
from app.api import sessions as sessions_api
from app.auth import AuthUser
from app.models import ControlMode, PollPresenceReport, QnaPromptStatus
from app.realtime import ConnectionManager
from app.store import InMemoryStore

HOST = AuthUser(id="host-1", email="host@example.com")


def run(coro):
    return asyncio.run(coro)


class PromptPresenceTests(TestCase):
    def setUp(self) -> None:
        prompts_api._presence.clear()
        prompts_api._prompt_cache.clear()
        self.store = InMemoryStore()
        self.manager = ConnectionManager()
        self.session = run(self.store.create_session("Deck", HOST.id))
        self.prompt = run(
            self.store.create_qna_prompt(self.session.id, "Discuss?", HOST.id)
        )

    def report(self, on_air: bool, prompt_id: str | None = None):
        return run(
            prompts_api.report_prompt_presence(
                self.session.id,
                prompt_id or self.prompt.id,
                PollPresenceReport(on_air=on_air, view="read"),
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )

    def prompt_in_store(self, prompt_id: str | None = None):
        snapshot = run(self.store.snapshot(self.session.id))
        target = prompt_id or self.prompt.id
        return next(p for p in snapshot.prompts if p.id == target)

    def test_new_prompts_default_to_auto_and_closed(self) -> None:
        self.assertEqual(self.prompt.mode, ControlMode.auto)
        self.assertEqual(self.prompt.status, QnaPromptStatus.closed)

    def test_on_air_opens_auto_prompt_and_off_air_closes(self) -> None:
        ack = self.report(on_air=True)
        self.assertEqual(ack.status, QnaPromptStatus.open)
        self.assertEqual(self.prompt_in_store().status, QnaPromptStatus.open)
        ack = self.report(on_air=False)
        self.assertEqual(ack.status, QnaPromptStatus.closed)
        self.assertEqual(self.prompt_in_store().status, QnaPromptStatus.closed)

    def test_pinned_open_prompt_ignores_off_air(self) -> None:
        prompt = run(
            prompts_api.open_prompt(
                self.session.id,
                self.prompt.id,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        self.assertEqual(prompt.mode, ControlMode.open)
        ack = self.report(on_air=False)
        self.assertEqual(ack.status, QnaPromptStatus.open)

    def test_switching_prompt_to_auto_applies_presence(self) -> None:
        run(
            prompts_api.close_prompt(
                self.session.id,
                self.prompt.id,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        self.report(on_air=True)
        prompt = run(
            prompts_api.set_prompt_mode(
                self.session.id,
                self.prompt.id,
                prompts_api.QnaPromptModeUpdate(mode=ControlMode.auto),
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        self.assertEqual(prompt.status, QnaPromptStatus.open)

    def test_sweep_closes_stale_auto_prompt(self) -> None:
        other = run(
            self.store.create_qna_prompt(self.session.id, "Other?", HOST.id)
        )
        self.report(on_air=True, prompt_id=other.id)
        stale = time.monotonic() - prompts_api._PRESENCE_TTL_SECONDS - 1
        prompts_api._presence[(self.session.id, other.id)] = (True, stale)
        self.report(on_air=False)
        self.assertEqual(
            self.prompt_in_store(other.id).status, QnaPromptStatus.closed
        )


class QnaPresenceTests(TestCase):
    def setUp(self) -> None:
        sessions_api._qna_presence.clear()
        sessions_api._qna_cache.clear()
        self.store = InMemoryStore()
        self.manager = ConnectionManager()
        self.session = run(self.store.create_session("Deck", HOST.id))

    def report(self, on_air: bool):
        return run(
            sessions_api.report_qna_presence(
                self.session.id,
                PollPresenceReport(on_air=on_air, view="read"),
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )

    def session_in_store(self):
        return run(self.store.get_session(self.session.id))

    def test_sessions_default_to_auto_with_qna_closed(self) -> None:
        self.assertEqual(self.session.qna_control_mode, ControlMode.auto)
        self.assertFalse(self.session.qna_open)

    def test_on_air_opens_auto_qna_and_off_air_closes(self) -> None:
        ack = self.report(on_air=True)
        self.assertTrue(ack.qna_open)
        self.assertTrue(self.session_in_store().qna_open)
        ack = self.report(on_air=False)
        self.assertFalse(ack.qna_open)
        self.assertFalse(self.session_in_store().qna_open)

    def test_pinned_open_qna_ignores_off_air(self) -> None:
        session = run(
            sessions_api.open_qna(
                self.session.id,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        self.assertEqual(session.qna_control_mode, ControlMode.open)
        self.assertTrue(session.qna_open)
        ack = self.report(on_air=False)
        self.assertTrue(ack.qna_open)
        self.assertTrue(self.session_in_store().qna_open)

    def test_switching_qna_to_auto_applies_presence(self) -> None:
        run(
            sessions_api.close_qna(
                self.session.id,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        self.report(on_air=True)
        session = run(
            sessions_api.set_qna_control_mode(
                self.session.id,
                sessions_api.QnaControlModeUpdate(mode=ControlMode.auto),
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        self.assertTrue(session.qna_open)
