from __future__ import annotations

import asyncio
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    import pydantic_settings  # noqa: F401
except ModuleNotFoundError:
    stub_module = types.ModuleType("pydantic_settings")

    class BaseSettings:
        def __init__(self, **kwargs):
            for cls in reversed(self.__class__.mro()):
                for name, value in cls.__dict__.items():
                    if name.startswith("_") or callable(value) or isinstance(value, property):
                        continue
                    setattr(self, name, kwargs.get(name, value))
            for name, value in kwargs.items():
                setattr(self, name, value)

    class SettingsConfigDict(dict):
        pass

    stub_module.BaseSettings = BaseSettings
    stub_module.SettingsConfigDict = SettingsConfigDict
    sys.modules["pydantic_settings"] = stub_module

from app.api import ai as ai_api  # noqa: E402
from app import artifact_intake  # noqa: E402


def run(coro):
    return asyncio.run(coro)


def intake_payload(**overrides):
    base = {
        "messages": [
            {"role": "assistant", "text": "What kind of artifact would you like?"},
            {"role": "user", "text": "A neon retro arcade scene"},
        ],
        "context": {"poll": {"question": "Favorite team?"}},
        "brand_profile_names": ["Prezlab Core", "Client X"],
    }
    base.update(overrides)
    return ai_api.PollGameArtifactIntakeRequest(**base)


class IntakeHelpersTest(unittest.TestCase):
    def test_brand_names_normalized_and_deduped(self) -> None:
        names = artifact_intake.normalize_intake_brand_profile_names(
            ["  Prezlab Core ", "prezlab core", "", None, "Client X"]
        )
        self.assertEqual(names, ["Prezlab Core", "Client X"])

    def test_match_brand_profile_name_is_case_insensitive_and_canonical(self) -> None:
        names = ["Prezlab Core", "Client X"]
        self.assertEqual(
            artifact_intake.match_brand_profile_name("client x", names), "Client X"
        )
        self.assertEqual(artifact_intake.match_brand_profile_name("no brand", names), "")
        self.assertEqual(artifact_intake.match_brand_profile_name("Made Up", names), "")

    def test_system_instruction_lists_brands_and_asks_early(self) -> None:
        text = artifact_intake.build_artifact_intake_system_instruction(
            brand_profile_names=["Prezlab Core", "Client X"],
            selected_brand_profile_name="",
            questions_asked=0,
        )
        self.assertIn('"Prezlab Core"', text)
        self.assertIn('"Client X"', text)
        self.assertIn("which brand profile to apply", text)

    def test_system_instruction_skips_brand_question_when_selected(self) -> None:
        text = artifact_intake.build_artifact_intake_system_instruction(
            brand_profile_names=["Prezlab Core"],
            selected_brand_profile_name="Prezlab Core",
            questions_asked=1,
        )
        self.assertIn("already chose the brand profile", text)
        self.assertNotIn("which brand profile to apply", text)

    def test_normalize_reply_ask(self) -> None:
        reply = artifact_intake.normalize_artifact_intake_reply(
            json.dumps({"action": "ask", "question": "Which brand should I use?"}),
            force_ready=False,
            messages=[{"role": "user", "text": "retro poll"}],
            brand_profile_names=["Prezlab Core"],
            selected_brand_profile_name="",
        )
        self.assertEqual(reply["action"], "ask")
        self.assertEqual(reply["question"], "Which brand should I use?")
        # No topic supplied -> defaults to "other".
        self.assertEqual(reply["topic"], "other")

    def test_normalize_reply_ask_carries_brand_topic(self) -> None:
        reply = artifact_intake.normalize_artifact_intake_reply(
            json.dumps(
                {
                    "action": "ask",
                    "question": "Which brand profile should I apply?",
                    "topic": "Brand",
                }
            ),
            force_ready=False,
            messages=[{"role": "user", "text": "retro poll"}],
            brand_profile_names=["Prezlab Core"],
            selected_brand_profile_name="",
        )
        self.assertEqual(reply["topic"], "brand")

    def test_normalize_reply_invalid_topic_becomes_other(self) -> None:
        reply = artifact_intake.normalize_artifact_intake_reply(
            json.dumps(
                {"action": "ask", "question": "What mood?", "topic": "weather"}
            ),
            force_ready=False,
            messages=[{"role": "user", "text": "retro poll"}],
            brand_profile_names=[],
            selected_brand_profile_name="",
        )
        self.assertEqual(reply["topic"], "other")

    def test_normalize_reply_rejects_hallucinated_brand(self) -> None:
        reply = artifact_intake.normalize_artifact_intake_reply(
            json.dumps(
                {
                    "action": "ready",
                    "brief": {
                        "artifactType": "retro arcade",
                        "brandProfileName": "Totally Fake Brand",
                    },
                }
            ),
            force_ready=False,
            messages=[{"role": "user", "text": "retro poll"}],
            brand_profile_names=["Prezlab Core"],
            selected_brand_profile_name="",
        )
        self.assertEqual(reply["action"], "ready")
        self.assertEqual(reply["brief"]["brandProfileName"], "")

    def test_normalize_reply_force_ready_overrides_ask(self) -> None:
        reply = artifact_intake.normalize_artifact_intake_reply(
            json.dumps({"action": "ask", "question": "One more thing?"}),
            force_ready=True,
            messages=[
                {"role": "user", "text": "retro arcade scene"},
                {"role": "user", "text": "dark background"},
            ],
            brand_profile_names=[],
            selected_brand_profile_name="",
        )
        self.assertEqual(reply["action"], "ready")
        self.assertEqual(reply["brief"]["artifactType"], "retro arcade scene")
        self.assertIn("dark background", reply["brief"]["designGuidelines"])

    def test_normalize_reply_plain_text_becomes_question(self) -> None:
        reply = artifact_intake.normalize_artifact_intake_reply(
            "What mood are you going for?",
            force_ready=False,
            messages=[{"role": "user", "text": "retro poll"}],
            brand_profile_names=[],
            selected_brand_profile_name="",
        )
        self.assertEqual(reply["action"], "ask")
        self.assertEqual(reply["question"], "What mood are you going for?")

    def test_selected_brand_wins_over_model_suggestion(self) -> None:
        reply = artifact_intake.normalize_artifact_intake_reply(
            json.dumps(
                {
                    "action": "ready",
                    "brief": {
                        "artifactType": "minimal poll",
                        "brandProfileName": "Client X",
                    },
                }
            ),
            force_ready=False,
            messages=[{"role": "user", "text": "minimal poll"}],
            brand_profile_names=["Prezlab Core", "Client X"],
            selected_brand_profile_name="Prezlab Core",
        )
        self.assertEqual(reply["brief"]["brandProfileName"], "Prezlab Core")


class IntakeRouteTest(unittest.TestCase):
    def setUp(self) -> None:
        self._original_api_key = ai_api.settings.anthropic_api_key
        ai_api.settings.anthropic_api_key = "test-key"

    def tearDown(self) -> None:
        ai_api.settings.anthropic_api_key = self._original_api_key

    def test_route_returns_question(self) -> None:
        mock_reply = (
            json.dumps({"action": "ask", "question": "Which brand profile should I use?"}),
            "end_turn",
        )
        with patch.object(
            ai_api, "request_anthropic_text", new=AsyncMock(return_value=mock_reply)
        ) as mock_request:
            response = run(ai_api.create_poll_game_artifact_intake(intake_payload()))

        self.assertEqual(response.action, "ask")
        self.assertEqual(response.question, "Which brand profile should I use?")
        self.assertIsNone(response.brief)

        kwargs = mock_request.await_args.kwargs
        self.assertIn("Prezlab Core", kwargs["system_instruction"])
        self.assertIn("Client X", kwargs["system_instruction"])
        self.assertIn("neon retro arcade", kwargs["prompt_text"])

    def test_route_returns_brief(self) -> None:
        mock_reply = (
            json.dumps(
                {
                    "action": "ready",
                    "brief": {
                        "artifactType": "neon retro arcade scene",
                        "designGuidelines": "dark bg, neon magenta accents",
                        "brandProfileName": "client x",
                        "audience": "gamers",
                        "mustHaves": ["scanlines"],
                        "avoid": ["pastel colors"],
                    },
                }
            ),
            "end_turn",
        )
        with patch.object(
            ai_api, "request_anthropic_text", new=AsyncMock(return_value=mock_reply)
        ):
            response = run(ai_api.create_poll_game_artifact_intake(intake_payload()))

        self.assertEqual(response.action, "ready")
        self.assertEqual(response.brief["artifactType"], "neon retro arcade scene")
        # Case-insensitive match resolves to the canonical saved spelling.
        self.assertEqual(response.brief["brandProfileName"], "Client X")
        self.assertEqual(response.brief["mustHaves"], ["scanlines"])

    def test_route_forces_ready_after_question_cap(self) -> None:
        messages = []
        for index in range(ai_api.ARTIFACT_INTAKE_MAX_QUESTIONS):
            messages.append({"role": "assistant", "text": f"Question {index}?"})
            messages.append({"role": "user", "text": f"Answer {index}"})
        mock_reply = (
            json.dumps({"action": "ask", "question": "Just one more?"}),
            "end_turn",
        )
        with patch.object(
            ai_api, "request_anthropic_text", new=AsyncMock(return_value=mock_reply)
        ) as mock_request:
            response = run(
                ai_api.create_poll_game_artifact_intake(
                    intake_payload(messages=messages)
                )
            )

        self.assertEqual(response.action, "ready")
        self.assertIsInstance(response.brief, dict)
        self.assertIn("MUST return", mock_request.await_args.kwargs["system_instruction"])

    def test_route_force_ready_flag(self) -> None:
        mock_reply = ("not json at all", "end_turn")
        with patch.object(
            ai_api, "request_anthropic_text", new=AsyncMock(return_value=mock_reply)
        ):
            response = run(
                ai_api.create_poll_game_artifact_intake(
                    intake_payload(force_ready=True)
                )
            )

        self.assertEqual(response.action, "ready")
        self.assertEqual(response.brief["artifactType"], "A neon retro arcade scene")

    def test_route_requires_user_message(self) -> None:
        from app.api.ai import HTTPException

        payload = intake_payload(
            messages=[{"role": "assistant", "text": "What kind of artifact?"}]
        )
        with patch.object(
            ai_api, "request_anthropic_text", new=AsyncMock()
        ) as mock_request:
            with self.assertRaises(HTTPException) as ctx:
                run(ai_api.create_poll_game_artifact_intake(payload))

        self.assertEqual(ctx.exception.status_code, 422)
        mock_request.assert_not_awaited()

    def test_route_requires_api_key(self) -> None:
        from app.api.ai import HTTPException

        ai_api.settings.anthropic_api_key = ""
        with self.assertRaises(HTTPException) as ctx:
            run(ai_api.create_poll_game_artifact_intake(intake_payload()))
        self.assertEqual(ctx.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
