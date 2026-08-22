from __future__ import annotations

import asyncio
from pathlib import Path
import sys
from unittest import TestCase

from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api import polls as polls_api
from app.api import qna_prompts as qna_prompts_api
from app.auth import AuthUser
from app.models import PollStatus, PollUpdate, QnaPromptUpdate
from app.realtime import ConnectionManager
from app.store import InMemoryStore

HOST = AuthUser(id="host-1", email="host@example.com")


def run(coro):
    return asyncio.run(coro)


class PollEditTests(TestCase):
    def setUp(self) -> None:
        polls_api.channel.clear()
        self.store = InMemoryStore()
        self.manager = ConnectionManager()
        self.session = run(self.store.create_session("Deck", HOST.id))
        self.poll = run(
            self.store.create_poll(
                self.session.id, "Q?", ["A", "B", "C"], False, HOST.id
            )
        )
        run(
            self.store.set_poll_status(
                self.session.id, self.poll.id, PollStatus.open, HOST.id
            )
        )

    def update(self, payload: PollUpdate, poll_id: str | None = None):
        return run(
            polls_api.update_poll(
                self.session.id,
                poll_id or self.poll.id,
                payload,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )

    def vote(self, option_id: str, client_id: str):
        return run(
            self.store.vote_poll(self.session.id, self.poll.id, option_id, client_id)
        )

    def test_update_question_and_relabel_options(self) -> None:
        option_a = self.poll.options[0]
        poll = self.update(
            PollUpdate(question="New Q?", options={option_a.id: "A2"})
        )
        self.assertEqual(poll.question, "New Q?")
        self.assertEqual(poll.options[0].label, "A2")
        self.assertEqual(poll.options[0].id, option_a.id)
        self.assertEqual([o.label for o in poll.options[1:]], ["B", "C"])

    def test_add_options_appends_with_zero_votes(self) -> None:
        poll = self.update(PollUpdate(add_options=["D", "E"]))
        self.assertEqual([o.label for o in poll.options], ["A", "B", "C", "D", "E"])
        self.assertEqual([o.votes for o in poll.options[-2:]], [0, 0])

    def test_remove_option_discards_votes_and_clears_history(self) -> None:
        option_a, option_b, _ = self.poll.options
        self.vote(option_a.id, "client-1")

        poll = self.update(PollUpdate(remove_option_ids=[option_a.id]))
        self.assertEqual([o.label for o in poll.options], ["B", "C"])

        # The voter's history entry for the removed option is gone, so a new
        # vote must not decrement anything and must count normally.
        poll = self.vote(option_b.id, "client-1")
        self.assertEqual(poll.options[0].votes, 1)

    def test_remove_below_two_options_is_conflict(self) -> None:
        ids = [o.id for o in self.poll.options[:2]]
        with self.assertRaises(HTTPException) as ctx:
            self.update(PollUpdate(remove_option_ids=ids))
        self.assertEqual(ctx.exception.status_code, 409)

    def test_remove_and_add_in_one_edit_keeps_two_option_minimum(self) -> None:
        ids = [o.id for o in self.poll.options[:2]]
        poll = self.update(
            PollUpdate(remove_option_ids=ids, add_options=["D"])
        )
        self.assertEqual([o.label for o in poll.options], ["C", "D"])

    def test_growing_past_five_options_is_conflict(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            self.update(PollUpdate(add_options=["D", "E", "F"]))
        self.assertEqual(ctx.exception.status_code, 409)

    def test_legacy_over_cap_poll_stays_editable_but_cannot_grow(self) -> None:
        """Polls created before the 5-option cap can still be relabeled and
        shrunk — the cap only refuses APPENDS past five."""
        legacy = run(
            self.store.create_poll(
                self.session.id, "Big?", ["A", "B", "C", "D", "E", "F"], False, HOST.id
            )
        )
        relabeled = self.update(
            PollUpdate(options={legacy.options[0].id: "A2"}), poll_id=legacy.id
        )
        self.assertEqual(relabeled.options[0].label, "A2")
        self.assertEqual(len(relabeled.options), 6)

        shrunk = self.update(
            PollUpdate(remove_option_ids=[legacy.options[5].id]), poll_id=legacy.id
        )
        self.assertEqual(len(shrunk.options), 5)

        with self.assertRaises(HTTPException) as ctx:
            self.update(PollUpdate(add_options=["G"]), poll_id=legacy.id)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_allow_multiple_flips_only_without_votes(self) -> None:
        poll = self.update(PollUpdate(allow_multiple=True))
        self.assertTrue(poll.allow_multiple)

        self.vote(self.poll.options[0].id, "client-1")
        with self.assertRaises(HTTPException) as ctx:
            self.update(PollUpdate(allow_multiple=False))
        self.assertEqual(ctx.exception.status_code, 409)

    def test_legacy_relabel_only_payload_still_works(self) -> None:
        """The station's inline text edit sends only question/options."""
        option_a = self.poll.options[0]
        poll = self.update(PollUpdate(options={option_a.id: "renamed"}))
        self.assertEqual(poll.options[0].label, "renamed")
        self.assertEqual(len(poll.options), 3)


class DiscussionPromptEditTests(TestCase):
    def setUp(self) -> None:
        qna_prompts_api.channel.clear()
        self.store = InMemoryStore()
        self.manager = ConnectionManager()
        self.session = run(self.store.create_session("Deck", HOST.id))
        self.prompt = run(
            self.store.create_qna_prompt(self.session.id, "Discuss this", HOST.id)
        )

    def test_update_prompt_text(self) -> None:
        prompt = run(
            qna_prompts_api.update_prompt(
                self.session.id,
                self.prompt.id,
                QnaPromptUpdate(prompt="Discuss that instead"),
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )
        self.assertEqual(prompt.prompt, "Discuss that instead")
        snapshot = run(self.store.snapshot(self.session.id))
        self.assertEqual(snapshot.prompts[0].prompt, "Discuss that instead")

    def test_update_unknown_prompt_is_404(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            run(
                qna_prompts_api.update_prompt(
                    self.session.id,
                    "missing",
                    QnaPromptUpdate(prompt="x"),
                    store=self.store,
                    manager=self.manager,
                    user=HOST,
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)
