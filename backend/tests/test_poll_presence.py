from __future__ import annotations

import asyncio
from pathlib import Path
import sys
import time
from unittest import TestCase

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api import polls as polls_api
from app.auth import AuthUser
from app.models import PollMode, PollModeUpdate, PollPresenceReport, PollStatus
from app.realtime import ConnectionManager
from app.store import InMemoryStore

HOST = AuthUser(id="host-1", email="host@example.com")


def run(coro):
    return asyncio.run(coro)


class PollPresenceTests(TestCase):
    def setUp(self) -> None:
        polls_api._presence.clear()
        self.store = InMemoryStore()
        self.manager = ConnectionManager()
        self.session = run(self.store.create_session("Deck", HOST.id))
        self.poll = run(
            self.store.create_poll(
                self.session.id, "Q?", ["A", "B"], False, HOST.id
            )
        )

    def report(self, on_air: bool, poll_id: str | None = None):
        return run(
            polls_api.report_poll_presence(
                self.session.id,
                poll_id or self.poll.id,
                PollPresenceReport(on_air=on_air, view="read", slide_id="s1"),
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )

    def set_mode(self, mode: PollMode, poll_id: str | None = None):
        return run(
            polls_api.set_poll_mode(
                self.session.id,
                poll_id or self.poll.id,
                PollModeUpdate(mode=mode),
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )

    def test_new_polls_default_to_auto_and_closed(self) -> None:
        self.assertEqual(self.poll.mode, PollMode.auto)
        self.assertEqual(self.poll.status, PollStatus.closed)

    def test_on_air_presence_opens_auto_poll_and_off_air_closes(self) -> None:
        poll = self.report(on_air=True)
        self.assertEqual(poll.status, PollStatus.open)
        poll = self.report(on_air=False)
        self.assertEqual(poll.status, PollStatus.closed)

    def test_pinned_open_ignores_off_air_presence(self) -> None:
        poll = run(
            polls_api.open_poll(
                self.session.id,
                self.poll.id,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        self.assertEqual(poll.mode, PollMode.open)
        self.assertEqual(poll.status, PollStatus.open)
        poll = self.report(on_air=False)
        self.assertEqual(poll.status, PollStatus.open)

    def test_pinned_closed_ignores_on_air_presence(self) -> None:
        run(
            polls_api.close_poll(
                self.session.id,
                self.poll.id,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        poll = self.report(on_air=True)
        self.assertEqual(poll.mode, PollMode.closed)
        self.assertEqual(poll.status, PollStatus.closed)

    def test_switching_to_auto_applies_fresh_presence(self) -> None:
        # Presence recorded while pinned closed, then unpinned: poll should
        # land open because its slide is currently presented.
        run(
            polls_api.close_poll(
                self.session.id,
                self.poll.id,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        self.report(on_air=True)
        poll = self.set_mode(PollMode.auto)
        self.assertEqual(poll.status, PollStatus.open)

    def test_switching_to_auto_with_stale_presence_closes(self) -> None:
        run(
            polls_api.open_poll(
                self.session.id,
                self.poll.id,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        self.report(on_air=True)
        stale = time.monotonic() - polls_api._PRESENCE_TTL_SECONDS - 1
        polls_api._presence[(self.session.id, self.poll.id)] = (True, stale)
        poll = self.set_mode(PollMode.auto)
        self.assertEqual(poll.status, PollStatus.closed)

    def test_sweep_closes_auto_poll_whose_conductor_went_silent(self) -> None:
        other = run(
            self.store.create_poll(
                self.session.id, "Other?", ["X", "Y"], False, HOST.id
            )
        )
        self.report(on_air=True, poll_id=other.id)
        opened = run(self.store.snapshot(self.session.id))
        self.assertEqual(
            next(p for p in opened.polls if p.id == other.id).status,
            PollStatus.open,
        )
        stale = time.monotonic() - polls_api._PRESENCE_TTL_SECONDS - 1
        polls_api._presence[(self.session.id, other.id)] = (True, stale)
        # Any presence report for another poll in the session sweeps it shut.
        self.report(on_air=False)
        swept = run(self.store.snapshot(self.session.id))
        self.assertEqual(
            next(p for p in swept.polls if p.id == other.id).status,
            PollStatus.closed,
        )

    def test_keepalive_reports_do_not_flap_status(self) -> None:
        first = self.report(on_air=True)
        second = self.report(on_air=True)
        self.assertEqual(first.status, PollStatus.open)
        self.assertEqual(second.status, PollStatus.open)
