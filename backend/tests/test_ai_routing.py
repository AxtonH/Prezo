from __future__ import annotations

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


VALID_ARTIFACT_HTML = """<!doctype html>
<html lang="en">
  <body>
    <div id="artifact-root"></div>
    <script>
      window.prezoSetPollRenderer(function (state) {
        var root = document.getElementById("artifact-root");
        if (!root) {
          return;
        }
        root.textContent = state && state.poll ? state.poll.question || "" : "";
      });
    </script>
  </body>
</html>"""

PATCHABLE_ARTIFACT_HTML = """<!doctype html>
<html lang="en">
  <head>
    <style>
      #track-bg {
        background: linear-gradient(180deg, #0b1020 0%, #1a2240 100%);
      }
      .car {
        fill: #ff4d4f;
      }
    </style>
  </head>
  <body>
    <div id="artifact-root">
      <svg class="car" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>
    </div>
    <script>
      window.prezoSetPollRenderer(function (state) {
        var root = document.getElementById("artifact-root");
        if (!root) {
          return;
        }
        root.setAttribute("data-question", state && state.poll ? state.poll.question || "" : "");
      });
    </script>
  </body>
</html>"""

FULL_SCENE_RESET_HTML = """<!doctype html>
<html lang="en">
  <body>
    <div id="artifact-root"></div>
    <script>
      window.prezoSetPollRenderer(function (state) {
        document.body.innerHTML = '<div id="artifact-root"></div>';
      });
    </script>
  </body>
</html>"""

ROOT_SCENE_RESET_HTML = """<!doctype html>
<html lang="en">
  <body>
    <div id="artifact-root"></div>
    <script>
      window.prezoSetPollRenderer(function (state) {
        var root = document.getElementById("artifact-root");
        if (!root) {
          return;
        }
        root.innerHTML = '<div class="scene">Reset</div>';
      });
    </script>
  </body>
</html>"""

INVALID_ARTIFACT_HTML = """<!doctype html>
<html lang="en">
  <body>
    <div id="artifact-root"></div>
    <script>
      window.prezoSetPollRenderer(function (state) {
    </script>
  </body>
</html>"""


class AiRoutingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.original_settings = {
            "anthropic_api_key": ai_api.settings.anthropic_api_key,
            "anthropic_base_url": ai_api.settings.anthropic_base_url,
            "anthropic_artifact_build_model": ai_api.settings.anthropic_artifact_build_model,
            "anthropic_artifact_build_timeout_seconds": ai_api.settings.anthropic_artifact_build_timeout_seconds,
            "gemini_api_key": ai_api.settings.gemini_api_key,
            "gemini_base_url": ai_api.settings.gemini_base_url,
            "gemini_model": ai_api.settings.gemini_model,
            "gemini_plan_model": ai_api.settings.gemini_plan_model,
            "gemini_artifact_edit_model": ai_api.settings.gemini_artifact_edit_model,
            "gemini_artifact_repair_model": ai_api.settings.gemini_artifact_repair_model,
            "gemini_artifact_answer_model": ai_api.settings.gemini_artifact_answer_model,
            "gemini_plan_timeout_seconds": ai_api.settings.gemini_plan_timeout_seconds,
            "gemini_artifact_build_timeout_seconds": ai_api.settings.gemini_artifact_build_timeout_seconds,
            "gemini_artifact_edit_timeout_seconds": ai_api.settings.gemini_artifact_edit_timeout_seconds,
            "gemini_artifact_repair_timeout_seconds": ai_api.settings.gemini_artifact_repair_timeout_seconds,
            "gemini_artifact_total_timeout_seconds": ai_api.settings.gemini_artifact_total_timeout_seconds,
            "gemini_artifact_answer_timeout_seconds": ai_api.settings.gemini_artifact_answer_timeout_seconds,
        }
        ai_api.settings.anthropic_api_key = "anthropic-test-key"
        ai_api.settings.anthropic_artifact_build_model = "claude-sonnet-4-6"
        ai_api.settings.anthropic_artifact_build_timeout_seconds = 180.0
        ai_api.settings.gemini_api_key = "gemini-test-key"
        ai_api.settings.gemini_model = "gemini-2.5-flash"
        ai_api.settings.gemini_plan_model = "gemini-2.5-flash"
        ai_api.settings.gemini_artifact_edit_model = "gemini-2.5-flash"
        ai_api.settings.gemini_artifact_repair_model = "gemini-2.5-flash"
        ai_api.settings.gemini_artifact_answer_model = "gemini-2.5-flash-lite"
        ai_api.settings.gemini_plan_timeout_seconds = 60.0
        ai_api.settings.gemini_artifact_build_timeout_seconds = 180.0
        ai_api.settings.gemini_artifact_edit_timeout_seconds = 240.0
        ai_api.settings.gemini_artifact_repair_timeout_seconds = 240.0
        ai_api.settings.gemini_artifact_total_timeout_seconds = 270.0
        ai_api.settings.gemini_artifact_answer_timeout_seconds = 90.0

    def tearDown(self) -> None:
        for key, value in self.original_settings.items():
            setattr(ai_api.settings, key, value)

    @staticmethod
    def build_payload(request_mode: str, model: str | None = None) -> ai_api.PollGameArtifactBuildRequest:
        context = {"artifact": {"requestMode": request_mode}} if request_mode else {"artifact": {}}
        return ai_api.PollGameArtifactBuildRequest(
            prompt="Build a detailed fighting-game artifact.",
            context=context,
            model=model,
        )

    async def test_initial_build_uses_anthropic_and_ignores_payload_model(self) -> None:
        anthropic_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "end_turn"))
        gemini_mock = AsyncMock()
        payload = self.build_payload("build", model="gemini-2.0-flash")
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(response.model, "claude-sonnet-4-6")
        self.assertEqual(anthropic_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_count, 0)
        self.assertEqual(anthropic_mock.await_args.kwargs["model"], "claude-sonnet-4-6")

    async def test_edit_request_uses_artifact_edit_model_and_ignores_payload_model(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "stop"))
        payload = self.build_payload("edit", model="gemini-3.1-pro-preview")
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_args.kwargs["model"], "gemini-2.5-flash")

    async def test_repair_request_uses_artifact_repair_model(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "stop"))
        payload = self.build_payload("repair", model="gemini-3.1-pro-preview")
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_args.kwargs["model"], "gemini-2.5-flash")

    async def test_artifact_answer_uses_flash_lite_and_ignores_payload_model(self) -> None:
        gemini_mock = AsyncMock(return_value=("It animates live vote changes.", "stop"))
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="How does this work?",
            context={},
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_gemini_text", gemini_mock):
            response = await ai_api.create_poll_game_artifact_answer(payload)

        self.assertEqual(response.model, "gemini-2.5-flash-lite")
        self.assertEqual(response.text, "It animates live vote changes.")
        self.assertEqual(gemini_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_args.kwargs["model"], "gemini-2.5-flash-lite")

    async def test_edit_plan_uses_flash_and_ignores_payload_model(self) -> None:
        gemini_mock = AsyncMock(
            return_value=(json.dumps({"assistantMessage": "ok", "actions": []}), "stop")
        )
        payload = ai_api.PollGameEditPlanRequest(
            prompt="Make the title smaller.",
            context={},
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_gemini_text", gemini_mock):
            response = await ai_api.create_poll_game_edit_plan(payload)

        parsed = json.loads(response.text)
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertEqual(parsed["assistantMessage"], "ok")
        self.assertEqual(gemini_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_args.kwargs["model"], "gemini-2.5-flash")

    async def test_invalid_claude_build_triggers_gemini_repair(self) -> None:
        anthropic_mock = AsyncMock(return_value=(INVALID_ARTIFACT_HTML, "end_turn"))
        gemini_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "stop"))
        payload = self.build_payload("build")
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(anthropic_mock.await_count, 1)
        self.assertGreaterEqual(gemini_mock.await_count, 1)
        self.assertEqual(response.model, "gemini-2.5-flash")

    async def test_claude_build_failure_does_not_fallback_to_gemini(self) -> None:
        anthropic_mock = AsyncMock(
            side_effect=ai_api.HTTPException(status_code=503, detail="Anthropic timed out")
        )
        gemini_mock = AsyncMock()
        payload = self.build_payload("build")
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            with self.assertRaises(ai_api.HTTPException) as exc_info:
                await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(exc_info.exception.status_code, 503)
        self.assertEqual(gemini_mock.await_count, 0)

    async def test_missing_anthropic_key_for_initial_build_returns_503(self) -> None:
        ai_api.settings.anthropic_api_key = None
        payload = self.build_payload("build")
        with self.assertRaises(ai_api.HTTPException) as exc_info:
            await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(exc_info.exception.status_code, 503)
        self.assertIn("ANTHROPIC_API_KEY", str(exc_info.exception.detail))

    def test_provider_timeout_detail_includes_stage_and_budget(self) -> None:
        detail = ai_api.build_provider_timeout_detail(
            "Gemini",
            "https://generativelanguage.googleapis.com/v1beta",
            exception_name="ReadTimeout",
            timeout_seconds=74.0,
            request_stage="artifact validation repair",
            remaining_budget_seconds=74.0,
        )

        self.assertIn("during artifact validation repair", detail)
        self.assertIn("ReadTimeout after 74s", detail)
        self.assertIn("Call budget was 74s", detail)
        self.assertIn("server budget remaining at call start was 74s", detail)

    def test_normalize_poll_game_artifact_html_extracts_html_from_prose_and_fences(self) -> None:
        raw_text = (
            "Here is the updated artifact HTML.\n\n"
            "```html\n"
            f"{VALID_ARTIFACT_HTML}\n"
            "```\n\n"
            "This preserves the live renderer."
        )

        normalized = ai_api.normalize_poll_game_artifact_html(raw_text)

        self.assertEqual(normalized, VALID_ARTIFACT_HTML.strip())

    def test_normalize_poll_game_artifact_html_unwraps_json_html_field_with_fences(self) -> None:
        raw_text = json.dumps({"html": f"```html\n{VALID_ARTIFACT_HTML}\n```"})

        normalized = ai_api.normalize_poll_game_artifact_html(raw_text)

        self.assertEqual(normalized, VALID_ARTIFACT_HTML.strip())

    def test_validate_poll_game_artifact_html_rejects_full_scene_reset_code(self) -> None:
        issues = ai_api.validate_poll_game_artifact_html(FULL_SCENE_RESET_HTML)

        self.assertIn(
            "script resets the full document/body content, which causes blank or flickering artifacts.",
            issues,
        )

    def test_validate_poll_game_artifact_html_rejects_root_scene_reset_code(self) -> None:
        issues = ai_api.validate_poll_game_artifact_html(ROOT_SCENE_RESET_HTML)

        self.assertIn(
            "script resets the main scene/root content, which causes hard resets, flicker, or blank artifacts.",
            issues,
        )

    def test_should_attempt_artifact_patch_edit_skips_broad_redesign_requests(self) -> None:
        should_patch = ai_api.should_attempt_artifact_patch_edit(
            "edit",
            {
                "currentArtifactHtml": PATCHABLE_ARTIFACT_HTML,
                "originalEditRequest": "Redesign the whole artifact from scratch with a new concept.",
            },
            "Redesign the whole artifact from scratch with a new concept.",
        )

        self.assertFalse(should_patch)

    def test_apply_artifact_patch_plan_can_update_css_property(self) -> None:
        patched_html, issues = ai_api.apply_artifact_patch_plan(
            PATCHABLE_ARTIFACT_HTML,
            {
                "assistantMessage": "Updated the background.",
                "edits": [
                    {
                        "type": "set_css_property",
                        "selector": "#track-bg",
                        "property": "background",
                        "value": "linear-gradient(180deg, #7ec8ff 0%, #f6e58d 100%)",
                    }
                ],
            },
        )

        self.assertEqual(issues, [])
        self.assertIn("linear-gradient(180deg, #7ec8ff 0%, #f6e58d 100%)", patched_html)
        self.assertIn(".car", patched_html)

    async def test_local_edit_prefers_patch_flow_before_full_regeneration(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Updated the background to daytime.",
                        "edits": [
                            {
                                "type": "set_css_property",
                                "selector": "#track-bg",
                                "property": "background",
                                "value": "linear-gradient(180deg, #7ec8ff 0%, #f6e58d 100%)",
                            }
                        ],
                    }
                ),
                "stop",
            )
        )
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Apply a targeted edit.",
            context={
                "artifact": {
                    "requestMode": "edit",
                    "originalEditRequest": "Make the background daytime.",
                    "currentArtifactHtml": PATCHABLE_ARTIFACT_HTML,
                }
            },
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 1)
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertEqual(response.assistantMessage, "Updated the background to daytime.")
        self.assertIn("linear-gradient(180deg, #7ec8ff 0%, #f6e58d 100%)", response.html)
        self.assertIn(".car", response.html)

    async def test_local_edit_patch_failure_does_not_fallback_to_full_regeneration(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Patch mode is not suitable.",
                        "edits": [],
                    }
                ),
                "stop",
            )
        )
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Apply a targeted edit.",
            context={
                "artifact": {
                    "requestMode": "edit",
                    "originalEditRequest": "Make the background daytime.",
                    "currentArtifactHtml": PATCHABLE_ARTIFACT_HTML,
                }
            },
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            with self.assertRaises(ai_api.HTTPException) as exc_info:
                await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(exc_info.exception.status_code, 409)
        self.assertIn("Targeted artifact edit was blocked", str(exc_info.exception.detail))
        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 1)

    async def test_local_edit_with_truncated_artifact_html_is_blocked_before_regeneration(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock()
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Apply a targeted edit.",
            context={
                "artifact": {
                    "requestMode": "edit",
                    "originalEditRequest": "Make the background daytime.",
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
                }
            },
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            with self.assertRaises(ai_api.HTTPException) as exc_info:
                await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(exc_info.exception.status_code, 409)
        self.assertIn("could not be applied safely with patch mode", str(exc_info.exception.detail))
        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 0)

    def test_build_artifact_repair_prompt_is_concrete_about_contract_and_pitfalls(self) -> None:
        prompt = ai_api.build_artifact_repair_prompt(
            original_prompt="Make the cars move smoothly when votes change.",
            context={"artifact": {"requestMode": "edit"}},
            html=INVALID_ARTIFACT_HTML,
            validation_issues=[
                "artifact output appears truncated before completion.",
                "artifact output has unbalanced <script> tags.",
                "script has an unterminated block or object literal.",
            ],
        )

        self.assertIn("Artifact repair task", prompt)
        self.assertIn("Required output contract", prompt)
        self.assertIn("Pitfalls to avoid", prompt)
        self.assertIn("Return exactly one complete HTML document.", prompt)
        self.assertIn("If a script block is malformed, truncated, or hard to salvage, rewrite the entire affected script block cleanly", prompt)
        self.assertIn("Do not return a blank stage, near-solid black screen, or hidden content.", prompt)

    def test_build_artifact_stable_recovery_prompt_is_concrete_about_baseline_and_pitfalls(self) -> None:
        prompt = ai_api.build_artifact_stable_recovery_prompt(
            original_prompt="Stop the flicker and keep the cars moving smoothly.",
            context={"artifact": {"requestMode": "repair", "currentArtifactHtml": VALID_ARTIFACT_HTML}},
            validation_issues=[
                "artifact output has unbalanced <script> tags.",
                "script has an unterminated block or object literal.",
            ],
        )

        self.assertIn("Artifact stable recovery task", prompt)
        self.assertIn("Use the stable current artifact as the baseline.", prompt)
        self.assertIn("Required output contract", prompt)
        self.assertIn("Pitfalls to avoid", prompt)
        self.assertIn("Return exactly one complete HTML document.", prompt)
        self.assertIn("Do not preserve malformed script bodies", prompt)


if __name__ == "__main__":
    unittest.main()
