from __future__ import annotations

import asyncio
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
from app import ai_prompts  # noqa: E402
from app import artifact_intake  # noqa: E402
from app import artifact_quality  # noqa: E402
from app.models import EmbedInstanceCreate, EmbedInstanceUpdate, SavedArtifactUpsert  # noqa: E402
from app.store import InMemoryStore  # noqa: E402


QNA_ARTIFACT_HTML = """<!doctype html>
<html lang="en">
  <body>
    <div id="board" data-prezo-scene-root="true"></div>
    <script>
      window.prezoSetQnaRenderer(function (state) {
        var board = document.getElementById('board');
        if (!board) { return; }
        var questions = (state.qna && state.qna.questions) || [];
        questions.forEach(function (question) {
          var row = board.querySelector('[data-question-id="' + question.id + '"]');
          if (!row) {
            row = document.createElement('div');
            row.setAttribute('data-question-id', question.id);
            board.appendChild(row);
          }
          row.textContent = question.text + ' (' + question.votes + ')';
        });
      });
    </script>
  </body>
</html>"""


APPEND_ONLY_QNA_HTML = """<!doctype html>
<html>
  <body>
    <div id="board"></div>
    <script>
      window.prezoSetQnaRenderer(function (state) {
        var board = document.getElementById('board');
        if (!board) { return; }
        var questions = (state.qna && state.qna.questions) || [];
        questions.forEach(function (question) {
          var row = document.createElement('div');
          row.textContent = question.text;
          board.appendChild(row);
        });
      });
    </script>
  </body>
</html>"""


POLL_ARTIFACT_HTML = """<!doctype html>
<html>
  <body>
    <div id="scene" data-prezo-scene-root="true"></div>
    <script>
      window.prezoSetPollRenderer(function (state) {
        var scene = document.getElementById('scene');
        if (!scene) { return; }
        scene.textContent = String(state.totalVotes || 0);
      });
    </script>
  </body>
</html>"""


class NormalizeActivityKindTests(unittest.TestCase):
    def test_canonical_kinds_pass_through(self) -> None:
        for kind in ("poll", "qna", "discussion"):
            self.assertEqual(ai_prompts.normalize_artifact_activity_kind(kind), kind)

    def test_embed_artifact_kind_aliases_map(self) -> None:
        self.assertEqual(ai_prompts.normalize_artifact_activity_kind("poll-game"), "poll")
        self.assertEqual(ai_prompts.normalize_artifact_activity_kind("Q&A"), "qna")
        self.assertEqual(
            ai_prompts.normalize_artifact_activity_kind("open-discussion"), "discussion"
        )

    def test_unknown_and_missing_fall_back_to_poll(self) -> None:
        self.assertEqual(ai_prompts.normalize_artifact_activity_kind("mystery"), "poll")
        self.assertEqual(ai_prompts.normalize_artifact_activity_kind(None), "poll")
        self.assertEqual(ai_prompts.normalize_artifact_activity_kind(42), "poll")

    def test_resolve_reads_artifact_context_first(self) -> None:
        context = {"activityKind": "qna", "artifact": {"activityKind": "discussion"}}
        self.assertEqual(artifact_quality.resolve_artifact_activity_kind(context), "discussion")
        self.assertEqual(
            artifact_quality.resolve_artifact_activity_kind({"activityKind": "qna"}), "qna"
        )
        self.assertEqual(artifact_quality.resolve_artifact_activity_kind({}), "poll")
        self.assertEqual(artifact_quality.resolve_artifact_activity_kind(None), "poll")


class KindAwareValidationTests(unittest.TestCase):
    def test_qna_artifact_passes_qna_validation(self) -> None:
        self.assertEqual(
            ai_api.validate_poll_game_artifact_html(QNA_ARTIFACT_HTML, "qna"), []
        )
        self.assertEqual(
            ai_api.validate_poll_game_artifact_html(QNA_ARTIFACT_HTML, "discussion"), []
        )

    def test_qna_artifact_fails_poll_validation_gate(self) -> None:
        issues = ai_api.validate_poll_game_artifact_html(QNA_ARTIFACT_HTML)
        self.assertTrue(any("live poll state" in issue for issue in issues))

    def test_poll_artifact_fails_qna_validation_gate(self) -> None:
        issues = ai_api.validate_poll_game_artifact_html(POLL_ARTIFACT_HTML, "qna")
        self.assertTrue(any("live Q&A state" in issue for issue in issues))

    def test_append_only_question_renderer_is_rejected_for_qna_only(self) -> None:
        issues = ai_api.validate_poll_game_artifact_html(APPEND_ONLY_QNA_HTML, "qna")
        self.assertTrue(any("append question rows" in issue for issue in issues))
        # The same HTML under poll kind fails the live-state gate but must not
        # trip the option reconciliation lint (there are no options).
        poll_issues = ai_api.validate_poll_game_artifact_html(APPEND_ONLY_QNA_HTML)
        self.assertFalse(any("append option rows" in issue for issue in poll_issues))

    def test_live_hook_extraction_preserves_qna_hooks(self) -> None:
        hooks = artifact_quality.extract_artifact_live_hook_scripts(QNA_ARTIFACT_HTML)
        self.assertEqual(len(hooks), 1)
        self.assertIn("prezoSetQnaRenderer", hooks[0])


class KindAwarePromptTests(unittest.TestCase):
    def test_poll_instruction_constant_is_the_poll_build(self) -> None:
        self.assertEqual(
            ai_prompts.POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
            ai_prompts.build_artifact_system_instruction("poll"),
        )
        self.assertIn("prezoSetPollRenderer", ai_prompts.POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION)
        self.assertNotIn("prezoSetQnaRenderer", ai_prompts.POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION)

    def test_qna_instruction_speaks_the_qna_contract(self) -> None:
        text = ai_prompts.build_artifact_system_instruction("qna")
        self.assertIn("prezo-qna-state", text)
        self.assertIn("prezoSetQnaRenderer", text)
        self.assertIn("state.qna.questions", text)
        self.assertIn("empty state", text)
        self.assertNotIn("prezoSetPollRenderer", text)

    def test_discussion_instruction_features_the_host_prompt(self) -> None:
        text = ai_prompts.build_artifact_system_instruction("discussion")
        self.assertIn("discussion prompt the host posed", text)
        self.assertIn("prezoSetQnaRenderer", text)

    def test_patch_instruction_swaps_dynamic_element_guidance(self) -> None:
        qna_text = ai_prompts.build_artifact_patch_system_instruction("qna")
        self.assertIn("Question list elements", qna_text)
        self.assertIn("live Q&A wiring", qna_text)
        poll_text = ai_prompts.build_artifact_patch_system_instruction("poll")
        self.assertEqual(poll_text, ai_prompts.POLL_GAME_ARTIFACT_PATCH_SYSTEM_INSTRUCTION)

    def test_repair_prompt_uses_kind_contract_and_reconciliation_block(self) -> None:
        prompt = ai_api.build_artifact_repair_prompt(
            original_prompt="make it neon",
            context={},
            html="<html></html>",
            validation_issues=[
                "script appears to append question rows on each render without clear keyed reconciliation; repeated Q&A updates can duplicate rows."
            ],
            activity_kind="qna",
        )
        self.assertIn("Q&A artifact", prompt)
        self.assertIn("prezoSetQnaRenderer", prompt)
        self.assertIn("data-question-id", prompt)
        self.assertNotIn("prezoSetPollRenderer", prompt)

    def test_stable_recovery_prompt_keeps_question_nodes_for_qna(self) -> None:
        prompt = ai_api.build_artifact_stable_recovery_prompt(
            original_prompt="make it neon",
            context={},
            validation_issues=["artifact output does not appear to consume live Q&A state."],
            activity_kind="discussion",
        )
        self.assertIn("live Q&A contract", prompt)
        self.assertIn("question nodes", prompt)

    def test_intake_instruction_mentions_kind_surface(self) -> None:
        text = artifact_intake.build_artifact_intake_system_instruction(
            brand_profile_names=[],
            selected_brand_profile_name="",
            questions_asked=0,
            activity_kind="qna",
        )
        self.assertIn("audience Q&A board", text)
        poll_text = artifact_intake.build_artifact_intake_system_instruction(
            brand_profile_names=[],
            selected_brand_profile_name="",
            questions_asked=0,
        )
        self.assertIn("a live poll", poll_text)


class QnaBuildRouteTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.original_keys = {
            "anthropic_api_key": ai_api.settings.anthropic_api_key,
            "gemini_api_key": ai_api.settings.gemini_api_key,
        }
        ai_api.settings.anthropic_api_key = "test-anthropic-key"
        ai_api.settings.gemini_api_key = "test-gemini-key"

    def tearDown(self) -> None:
        for key, value in self.original_keys.items():
            setattr(ai_api.settings, key, value)

    @staticmethod
    def build_qna_payload() -> "ai_api.PollGameArtifactBuildRequest":
        return ai_api.PollGameArtifactBuildRequest(
            prompt="Build a sticky-note wall for audience questions.",
            context={"artifact": {"requestMode": "build", "activityKind": "qna"}},
        )

    async def test_qna_build_uses_qna_instruction_and_passes_qna_gate(self) -> None:
        anthropic_mock = AsyncMock(return_value=(QNA_ARTIFACT_HTML, "end_turn"))
        gemini_mock = AsyncMock()
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(self.build_qna_payload())

        self.assertIn("prezoSetQnaRenderer", response.html)
        self.assertEqual(anthropic_mock.await_count, 1)
        # No repair round needed: the qna artifact satisfies the qna gate.
        self.assertEqual(gemini_mock.await_count, 0)
        system_instruction = anthropic_mock.await_args.kwargs["system_instruction"]
        self.assertIn("prezo-qna-state", system_instruction)
        self.assertNotIn("prezoSetPollRenderer", system_instruction)

    async def test_poll_only_artifact_fails_qna_gate_and_repairs_with_qna_contract(
        self,
    ) -> None:
        anthropic_mock = AsyncMock(return_value=(POLL_ARTIFACT_HTML, "end_turn"))
        gemini_mock = AsyncMock(return_value=(QNA_ARTIFACT_HTML, "stop"))
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(self.build_qna_payload())

        self.assertIn("prezoSetQnaRenderer", response.html)
        self.assertGreaterEqual(gemini_mock.await_count, 1)
        repair_kwargs = gemini_mock.await_args.kwargs
        self.assertIn("prezo-qna-state", repair_kwargs["system_instruction"])
        self.assertIn("live Q&A contract", repair_kwargs["prompt_text"])


class SavedArtifactKindTests(unittest.TestCase):
    def test_upsert_kind_is_optional_so_legacy_writers_cannot_rekind(self) -> None:
        payload = SavedArtifactUpsert(html="<html><body>x</body></html>")
        self.assertIsNone(payload.kind)

    def test_store_preserves_kind_when_save_omits_it(self) -> None:
        store = InMemoryStore()

        async def scenario() -> str:
            await store.save_saved_artifact(
                "user-1",
                "QnA Board",
                "<html><body>x</body></html>",
                None,
                None,
                {},
                None,
                None,
                kind="qna",
            )
            # A kind-unaware writer re-saves the same artifact without a kind.
            resaved = await store.save_saved_artifact(
                "user-1",
                "QnA Board",
                "<html><body>y</body></html>",
                None,
                None,
                {},
                None,
                None,
            )
            return resaved.kind

        self.assertEqual(asyncio.run(scenario()), "qna")

    def test_store_roundtrips_kind(self) -> None:
        store = InMemoryStore()

        async def scenario() -> tuple[str, str]:
            saved = await store.save_saved_artifact(
                "user-1",
                "QnA Board",
                "<html><body>x</body></html>",
                None,
                None,
                {},
                None,
                None,
                kind="qna",
            )
            listed = await store.list_saved_artifacts("user-1")
            return saved.kind, listed[0].kind

        saved_kind, listed_kind = asyncio.run(scenario())
        self.assertEqual(saved_kind, "qna")
        self.assertEqual(listed_kind, "qna")

    def test_store_defaults_legacy_saves_to_poll(self) -> None:
        store = InMemoryStore()

        async def scenario() -> str:
            saved = await store.save_saved_artifact(
                "user-1",
                "Classic",
                "<html><body>x</body></html>",
                None,
                None,
                {},
                None,
                None,
            )
            return saved.kind

        self.assertEqual(asyncio.run(scenario()), "poll")

    def test_embed_instance_models_accept_prompt_id(self) -> None:
        created = EmbedInstanceCreate(id="embed-1", prompt_id="prompt-9", artifact_kind="discussion")
        self.assertEqual(created.prompt_id, "prompt-9")
        patch = EmbedInstanceUpdate(prompt_id="prompt-10")
        self.assertEqual(patch.prompt_id, "prompt-10")


if __name__ == "__main__":
    unittest.main()
