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
from app.models import PollStatus, QnaPromptStatus
from app.realtime import ConnectionManager
from app.store import InMemoryStore

HOST = AuthUser(id="host-1", email="host@example.com")


def run(coro):
    return asyncio.run(coro)


class PollResetTests(TestCase):
    def setUp(self) -> None:
        polls_api.channel.clear()
        self.store = InMemoryStore()
        self.manager = ConnectionManager()
        self.session = run(self.store.create_session("Deck", HOST.id))
        self.poll = run(
            self.store.create_poll(
                self.session.id, "Q?", ["A", "B"], False, HOST.id
            )
        )
        run(
            self.store.set_poll_status(
                self.session.id, self.poll.id, PollStatus.open, HOST.id
            )
        )

    def reset(self, poll_id: str | None = None):
        return run(
            polls_api.reset_poll(
                self.session.id,
                poll_id or self.poll.id,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )

    def vote(self, option_id: str, client_id: str):
        return run(
            self.store.vote_poll(self.session.id, self.poll.id, option_id, client_id)
        )

    def test_reset_zeroes_all_option_votes_and_keeps_poll(self) -> None:
        option_a, option_b = self.poll.options
        self.vote(option_a.id, "client-1")
        self.vote(option_b.id, "client-2")

        poll = self.reset()

        self.assertEqual([opt.votes for opt in poll.options], [0, 0])
        snapshot = run(self.store.snapshot(self.session.id))
        stored = next(p for p in snapshot.polls if p.id == self.poll.id)
        self.assertEqual([opt.votes for opt in stored.options], [0, 0])

    def test_reset_clears_voter_history_so_clients_can_revote(self) -> None:
        option_a = self.poll.options[0]
        self.vote(option_a.id, "client-1")
        # Re-voting the same option before reset is a no-op (idempotent).
        poll = self.vote(option_a.id, "client-1")
        self.assertEqual(poll.options[0].votes, 1)

        self.reset()

        poll = self.vote(option_a.id, "client-1")
        self.assertEqual(poll.options[0].votes, 1)

    def test_reset_records_poll_vote_updated_activity(self) -> None:
        self.vote(self.poll.options[0].id, "client-1")
        self.reset()

        activities = self.store._activities_by_session[self.session.id]
        activity = activities[-1]
        self.assertEqual(activity.type, "poll_vote_updated")
        payload_poll = activity.payload["poll"]
        self.assertEqual(payload_poll["id"], self.poll.id)
        self.assertTrue(all(opt["votes"] == 0 for opt in payload_poll["options"]))

    def test_reset_unknown_poll_raises_404(self) -> None:
        with self.assertRaises(HTTPException) as exc_info:
            self.reset("missing-poll")
        self.assertEqual(exc_info.exception.status_code, 404)


class DiscussionResetTests(TestCase):
    def setUp(self) -> None:
        qna_prompts_api.channel.clear()
        self.store = InMemoryStore()
        self.manager = ConnectionManager()
        self.session = run(self.store.create_session("Deck", HOST.id))
        self.prompt = run(
            self.store.create_qna_prompt(self.session.id, "Discuss?", HOST.id)
        )
        self.other_prompt = run(
            self.store.create_qna_prompt(self.session.id, "Other topic?", HOST.id)
        )
        for prompt in (self.prompt, self.other_prompt):
            run(
                self.store.set_qna_prompt_status(
                    self.session.id, prompt.id, QnaPromptStatus.open, HOST.id
                )
            )

    def reset(self, prompt_id: str | None = None):
        return run(
            qna_prompts_api.delete_prompt_questions(
                self.session.id,
                prompt_id or self.prompt.id,
                store=self.store,
                manager=self.manager,
                user=HOST,
            )
        )

    def add_question(self, text: str, prompt_id: str | None):
        return run(self.store.create_question(self.session.id, text, prompt_id))

    def test_reset_removes_only_that_prompts_questions(self) -> None:
        q1 = self.add_question("First", self.prompt.id)
        q2 = self.add_question("Second", self.prompt.id)
        other = self.add_question("Elsewhere", self.other_prompt.id)
        run(self.store.set_qna_status(self.session.id, True, HOST.id))
        audience = self.add_question("Audience Q&A", None)

        response = self.reset()

        self.assertEqual(sorted(response.question_ids), sorted([q1.id, q2.id]))
        snapshot = run(self.store.snapshot(self.session.id))
        remaining_ids = {q.id for q in snapshot.questions}
        self.assertEqual(remaining_ids, {other.id, audience.id})
        # The prompt itself survives the reset.
        self.assertIn(self.prompt.id, {p.id for p in snapshot.prompts})

    def test_reset_records_prompt_questions_deleted_activity(self) -> None:
        q1 = self.add_question("First", self.prompt.id)
        self.reset()

        activities = self.store._activities_by_session[self.session.id]
        activity = activities[-1]
        self.assertEqual(activity.type, "prompt_questions_deleted")
        self.assertEqual(activity.payload["prompt_id"], self.prompt.id)
        self.assertEqual(activity.payload["question_ids"], [q1.id])

    def test_reset_empty_prompt_returns_empty_ids(self) -> None:
        response = self.reset()
        self.assertEqual(response.question_ids, [])

    def test_reset_unknown_prompt_raises_404(self) -> None:
        with self.assertRaises(HTTPException) as exc_info:
            self.reset("missing-prompt")
        self.assertEqual(exc_info.exception.status_code, 404)
