from __future__ import annotations

import asyncio
from pathlib import Path
import sys
from unittest import TestCase

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api import polls as polls_api
from app.auth import AuthUser
from app.models import Poll, PollMode, PollOption, PollStatus
from app.store import InMemoryStore

HOST = AuthUser(id="host-1", email="host@example.com")


def run(coro):
    return asyncio.run(coro)


def _bugged_rpc_poll(poll: Poll) -> Poll:
    """Model what the Supabase vote RPCs actually return: a hand-built
    payload that predates polls.mode, so the deserialized Poll silently
    carries the default 'auto' regardless of the stored pin."""
    return Poll(
        id=poll.id,
        session_id=poll.session_id,
        question=poll.question,
        options=[
            PollOption(id=opt.id, label=opt.label, votes=opt.votes)
            for opt in poll.options
        ],
        status=poll.status,
        allow_multiple=poll.allow_multiple,
        created_at=poll.created_at,
    )


class VoteModeOverlayTests(TestCase):
    def setUp(self) -> None:
        polls_api.channel.clear()
        self.store = InMemoryStore()
        self.session = run(self.store.create_session("Deck", HOST.id))
        self.poll = run(
            self.store.create_poll(self.session.id, "Q?", ["A", "B"], False, HOST.id)
        )
        run(
            self.store.set_poll_status(
                self.session.id, self.poll.id, PollStatus.open, HOST.id
            )
        )
        self.pinned = run(
            self.store.set_poll_mode(
                self.session.id, self.poll.id, PollMode.open, HOST.id
            )
        )

    def test_overlay_restores_pinned_mode_from_cache(self) -> None:
        polls_api._cache_poll(self.pinned)
        bugged = _bugged_rpc_poll(self.pinned)
        self.assertEqual(bugged.mode, PollMode.auto)
        repaired = run(
            polls_api._with_authoritative_mode(self.session.id, bugged, self.store)
        )
        self.assertEqual(repaired.mode, PollMode.open)

    def test_overlay_seeds_cache_from_store_on_miss(self) -> None:
        # Cold cache (e.g. process restart between the pin and the vote).
        polls_api.channel.clear()
        bugged = _bugged_rpc_poll(self.pinned)
        repaired = run(
            polls_api._with_authoritative_mode(self.session.id, bugged, self.store)
        )
        self.assertEqual(repaired.mode, PollMode.open)

    def test_overlay_leaves_unknown_polls_untouched(self) -> None:
        polls_api.channel.clear()
        bugged = _bugged_rpc_poll(self.pinned)
        bugged.id = "not-a-real-poll"
        repaired = run(
            polls_api._with_authoritative_mode(self.session.id, bugged, self.store)
        )
        self.assertEqual(repaired.mode, PollMode.auto)
