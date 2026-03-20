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

SCENE_ROOT_ONLY_ARTIFACT_HTML = """<!doctype html>
<html lang="en">
  <head>
    <style>
      #artifact-root {
        background: #ffffff;
        border-radius: 24px;
      }
      .car {
        fill: #ff4d4f;
      }
    </style>
  </head>
  <body>
    <div id="artifact-root" class="scene-shell">
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

LAYOUT_ARTIFACT_HTML = """<!doctype html>
<html lang="en">
  <head>
    <style>
      #artifact-root {
        padding: 16px;
      }
      .poll-options {
        display: flex;
        flex-direction: row;
        gap: 12px;
      }
      .poll-option {
        display: flex;
        align-items: center;
      }
    </style>
  </head>
  <body>
    <div id="artifact-root">
      <div class="poll-options">
        <div class="poll-option">A</div>
        <div class="poll-option">B</div>
      </div>
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

PATCH_COMPLETION_ARTIFACT_HTML = """<!doctype html>
<html lang="en">
  <head>
    <style>
      .poll-options {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }
      .poll-brick {
        width: 28px;
        height: 28px;
      }
    </style>
  </head>
  <body>
    <section id="artifact-root">
      <div class="poll-options">
        <div class="poll-brick"></div>
      </div>
    </section>
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

PATCH_COMPLETION_ARTIFACT_PACKAGE = {
    "format": "prezo-artifact-package@1",
    "entry": "index.html",
    "files": [
        {
            "path": "index.html",
            "language": "html",
            "content": """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="./styles.css" data-prezo-artifact-package="styles">
  </head>
  <body>
    <section id="artifact-root">
      <div class="poll-options">
        <div class="poll-brick"></div>
      </div>
    </section>
    <script src="./renderer.js" data-prezo-artifact-package="renderer"></script>
  </body>
</html>""",
        },
        {
            "path": "styles.css",
            "language": "css",
            "content": """.poll-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.poll-brick {
  width: 28px;
  height: 28px;
}""",
        },
        {
            "path": "renderer.js",
            "language": "javascript",
            "content": """window.prezoSetPollRenderer(function (state) {
  var root = document.getElementById("artifact-root");
  if (!root) {
    return;
  }
  root.setAttribute("data-question", state && state.poll ? state.poll.question || "" : "");
});""",
        },
    ],
}

TITLE_OVERLAP_ARTIFACT_HTML = """<!doctype html>
<html lang="en">
  <head>
    <style>
      .poll-header {
        display: block;
      }
      .poll-title {
        font-size: 44px;
        margin-bottom: 0;
      }
      .poll-options {
        margin-top: 0;
      }
      .option-label {
        color: #222;
      }
    </style>
  </head>
  <body>
    <section id="artifact-root">
      <header class="poll-header">
        <h1 class="poll-title">Question</h1>
      </header>
      <div class="poll-options">
        <div class="option-row"><span class="option-label">A</span></div>
        <div class="option-row"><span class="option-label">B</span></div>
      </div>
    </section>
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

LOCAL_BODY_VARIABLE_APPEND_HTML = """<!doctype html>
<html lang="en">
  <body>
    <div id="artifact-root"></div>
    <script>
      window.prezoSetPollRenderer(function (state) {
        var body = document.createElement("div");
        var badge = document.createElement("span");
        badge.textContent = state && state.poll ? state.poll.question || "" : "";
        body.appendChild(badge);
        var root = document.getElementById("artifact-root");
        if (!root) {
          return;
        }
        root.textContent = badge.textContent;
      });
    </script>
  </body>
</html>"""

APPEND_ONLY_OPTION_RENDER_HTML = """<!doctype html>
<html lang="en">
  <body>
    <div id="artifact-root"></div>
    <script>
      window.prezoSetPollRenderer(function (state) {
        var root = document.getElementById("artifact-root");
        if (!root) {
          return;
        }
        var options = state && state.poll && Array.isArray(state.poll.options) ? state.poll.options : [];
        options.forEach(function (option) {
          var row = document.createElement("div");
          row.className = "poll-row";
          row.textContent = option && option.label ? option.label : "";
          root.appendChild(row);
        });
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

MISSING_SCRIPT_CLOSE_ARTIFACT_HTML = """<!doctype html>
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
    def build_payload(
        request_mode: str,
        model: str | None = None,
        *,
        prompt: str = "Build a detailed fighting-game artifact.",
        original_edit_request: str | None = None,
    ) -> ai_api.PollGameArtifactBuildRequest:
        context = {"artifact": {"requestMode": request_mode}} if request_mode else {"artifact": {}}
        if original_edit_request:
            context["artifact"]["originalEditRequest"] = original_edit_request
        return ai_api.PollGameArtifactBuildRequest(
            prompt=prompt,
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

    async def test_simple_edit_request_uses_artifact_edit_model_and_ignores_payload_model(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "stop"))
        payload = self.build_payload(
            "edit",
            model="gemini-3.1-pro-preview",
            prompt="Make the title slightly smaller.",
            original_edit_request="Make the title slightly smaller.",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_args.kwargs["model"], "gemini-2.5-flash")

    async def test_complex_background_edit_request_uses_gemini_first_and_ignores_payload_model(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "stop"))
        payload = self.build_payload(
            "edit",
            model="gemini-3.1-pro-preview",
            prompt="Change the background to a Dubai city skyline at sunset.",
            original_edit_request="Change the background to a Dubai city skyline at sunset.",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_args.kwargs["model"], "gemini-2.5-flash")

    async def test_structural_edit_request_uses_gemini_first(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "stop"))
        payload = self.build_payload(
            "edit",
            model="gemini-3.1-pro-preview",
            prompt="Restructure the layout into two stacked sections.",
            original_edit_request="Restructure the layout into two stacked sections.",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 1)

    async def test_edit_generation_falls_back_to_claude_when_gemini_candidate_fails_validation(self) -> None:
        anthropic_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "end_turn"))
        gemini_mock = AsyncMock(
            side_effect=[
                ("<html><body><div>No live renderer wiring.</div></body></html>", "stop"),
                ("<html><body><div>Still no live renderer wiring.</div></body></html>", "stop"),
            ]
        )
        payload = self.build_payload(
            "edit",
            model="gemini-3.1-pro-preview",
            prompt="Restructure the layout into two stacked sections.",
            original_edit_request="Restructure the layout into two stacked sections.",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(response.model, "claude-sonnet-4-6")
        self.assertEqual(anthropic_mock.await_count, 1)
        self.assertGreaterEqual(gemini_mock.await_count, 2)
        self.assertEqual(
            anthropic_mock.await_args_list[0].kwargs["request_stage"],
            "artifact edit fallback generation",
        )

    async def test_edit_patch_falls_back_to_claude_when_gemini_patch_fails(self) -> None:
        anthropic_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Added LEGO studs to the title container.",
                        "edits": [
                            {
                                "type": "set_css_property",
                                "selector": ".poll-title::before",
                                "property": "content",
                                "value": "\"\"",
                            },
                            {
                                "type": "set_css_property",
                                "selector": ".poll-title::before",
                                "property": "width",
                                "value": "20px",
                            },
                            {
                                "type": "set_css_property",
                                "selector": ".poll-title::before",
                                "property": "height",
                                "value": "8px",
                            },
                            {
                                "type": "set_css_property",
                                "selector": ".poll-title::before",
                                "property": "background",
                                "value": "#F4C531",
                            },
                        ],
                    }
                ),
                "end_turn",
            )
        )
        gemini_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Attempted a patch.",
                        "edits": [
                            {
                                "type": "replace_between",
                                "start": "<style>",
                                "end": "</style>",
                                "content": "/* unsupported */",
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
                    "originalEditRequest": "add studs to the title container",
                    "currentArtifactFullHtml": TITLE_OVERLAP_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
                }
            },
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(response.model, "claude-sonnet-4-6")
        self.assertEqual(anthropic_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_count, 1)
        self.assertIn(".poll-title::before {", response.html)
        self.assertIn("background: #F4C531;", response.html)

    async def test_repair_request_uses_artifact_repair_model(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "stop"))
        payload = self.build_payload(
            "repair",
            model="gemini-3.1-pro-preview",
            prompt="Make the title slightly smaller.",
            original_edit_request="Make the title slightly smaller.",
        )
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

    async def test_missing_script_close_tag_is_auto_repaired_before_ai_repair(self) -> None:
        anthropic_mock = AsyncMock(
            return_value=(MISSING_SCRIPT_CLOSE_ARTIFACT_HTML, "end_turn")
        )
        gemini_mock = AsyncMock()
        payload = self.build_payload("build")
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(anthropic_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_count, 0)
        self.assertEqual(
            len(ai_api.ARTIFACT_SCRIPT_OPEN_RE.findall(response.html)),
            len(ai_api.ARTIFACT_SCRIPT_CLOSE_RE.findall(response.html)),
        )
        self.assertEqual(ai_api.validate_poll_game_artifact_html(response.html), [])

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

    def test_validate_poll_game_artifact_html_allows_local_body_variable_append(self) -> None:
        issues = ai_api.validate_poll_game_artifact_html(LOCAL_BODY_VARIABLE_APPEND_HTML)

        self.assertNotIn(
            "script replaces the full document/body structure, which is not allowed for artifact output.",
            issues,
        )
        self.assertEqual(issues, [])

    def test_validate_poll_game_artifact_html_rejects_append_only_option_renderer(self) -> None:
        issues = ai_api.validate_poll_game_artifact_html(APPEND_ONLY_OPTION_RENDER_HTML)

        self.assertIn(
            "script appears to append option rows on each render without clear keyed reconciliation; repeated poll updates can duplicate rows.",
            issues,
        )

    def test_attempt_artifact_structural_autorepair_balances_missing_script_close_tag(self) -> None:
        repaired = ai_api.attempt_artifact_structural_autorepair(
            MISSING_SCRIPT_CLOSE_ARTIFACT_HTML
        )

        self.assertEqual(
            len(ai_api.ARTIFACT_SCRIPT_OPEN_RE.findall(repaired)),
            len(ai_api.ARTIFACT_SCRIPT_CLOSE_RE.findall(repaired)),
        )
        self.assertIn("</script>", repaired)
        self.assertEqual(ai_api.validate_poll_game_artifact_html(repaired), [])

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

    def test_is_patch_only_artifact_edit_request_treats_layout_orientation_as_patchable(self) -> None:
        self.assertTrue(
            ai_api.is_patch_only_artifact_edit_request(
                "Change the alignment so horizontal polls become vertical polls."
            )
        )

    def test_should_route_artifact_edit_to_anthropic_skips_orientation_when_current_html_exists(self) -> None:
        should_route = ai_api.should_route_artifact_edit_to_anthropic(
            "edit",
            {"currentArtifactHtml": LAYOUT_ARTIFACT_HTML},
            "Change the alignment so horizontal polls become vertical polls.",
        )

        self.assertFalse(should_route)

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

    def test_apply_artifact_patch_plan_can_add_pseudo_rule_when_base_selector_exists(self) -> None:
        patched_html, issues = ai_api.apply_artifact_patch_plan(
            TITLE_OVERLAP_ARTIFACT_HTML,
            {
                "assistantMessage": "Added LEGO-like title studs.",
                "edits": [
                    {
                        "type": "set_css_property",
                        "selector": ".poll-title::before",
                        "property": "content",
                        "value": "\"\"",
                    },
                    {
                        "type": "set_css_property",
                        "selector": ".poll-title::before",
                        "property": "background",
                        "value": "#F4C531",
                    },
                ],
            },
        )

        self.assertEqual(issues, [])
        self.assertIn(".poll-title::before {", patched_html)
        self.assertIn("content: \"\";", patched_html)
        self.assertIn("background: #F4C531;", patched_html)

    def test_apply_artifact_patch_plan_rejects_pseudo_rule_when_base_selector_missing(self) -> None:
        patched_html, issues = ai_api.apply_artifact_patch_plan(
            PATCHABLE_ARTIFACT_HTML,
            {
                "assistantMessage": "Tried to add title studs.",
                "edits": [
                    {
                        "type": "set_css_property",
                        "selector": ".poll-title::before",
                        "property": "content",
                        "value": "\"\"",
                    }
                ],
            },
        )

        self.assertTrue(issues)
        self.assertIn(
            "could not apply CSS selector `.poll-title::before`",
            issues[0],
        )
        self.assertNotIn(".poll-title::before {", patched_html)

    def test_apply_artifact_patch_plan_rejects_legacy_string_patch_ops(self) -> None:
        patched_html, issues = ai_api.apply_artifact_patch_plan(
            PATCHABLE_ARTIFACT_HTML,
            {
                "assistantMessage": "Tried a legacy patch.",
                "edits": [
                    {
                        "type": "replace_between",
                        "start": "<style>",
                        "end": "</style>",
                        "content": "/* legacy */",
                    }
                ],
            },
        )

        self.assertEqual(len(issues), 1)
        self.assertIn("unsupported type `replace_between`", issues[0])
        self.assertIn("#track-bg", patched_html)

    def test_apply_artifact_patch_plan_tolerates_invalid_edits_when_valid_edits_exist(self) -> None:
        patched_html, issues = ai_api.apply_artifact_patch_plan(
            PATCHABLE_ARTIFACT_HTML,
            {
                "assistantMessage": "Mixed plan.",
                "edits": [
                    {
                        "type": "replace_between",
                        "start": "<style>",
                        "end": "</style>",
                        "content": "/* unsupported */",
                    },
                    {
                        "type": "set_css_property",
                        "selector": "#track-bg",
                        "property": "border-radius",
                        "value": "20px",
                    },
                ],
            },
        )

        self.assertEqual(issues, [])
        self.assertIn("border-radius: 20px;", patched_html)
        self.assertIn(".car", patched_html)

    def test_extract_artifact_background_selector_candidates_prefers_real_selectors(self) -> None:
        selectors = ai_api.extract_artifact_background_selector_candidates(
            PATCHABLE_ARTIFACT_HTML
        )

        self.assertIn("#track-bg", selectors)
        self.assertNotIn("#city-bg", selectors)

    def test_extract_artifact_scene_root_selector_candidates_prefers_root_selectors(self) -> None:
        selectors = ai_api.extract_artifact_scene_root_selector_candidates(
            SCENE_ROOT_ONLY_ARTIFACT_HTML
        )

        self.assertIn("#artifact-root", selectors)
        self.assertIn(".scene-shell", selectors)

    def test_extract_artifact_title_selector_candidates_prefers_heading_selectors(self) -> None:
        selectors = ai_api.extract_artifact_title_selector_candidates(
            TITLE_OVERLAP_ARTIFACT_HTML
        )

        self.assertIn(".poll-header", selectors)
        self.assertIn(".poll-title", selectors)

    def test_is_background_visual_edit_request_treats_track_as_background(self) -> None:
        self.assertTrue(ai_api.is_background_visual_edit_request("Edit the track so it feels like a cityscape."))

    def test_extract_artifact_original_edit_request_resolves_background_feedback(self) -> None:
        resolved = ai_api.extract_artifact_original_edit_request(
            {
                "originalEditRequest": "nothing changed",
                "recentEditRequests": [
                    "Change the background to a city skyline.",
                    "still white",
                ],
            }
        )

        self.assertIn("Retry the previous background-only edit", resolved)
        self.assertIn("Change the background to a city skyline.", resolved)
        self.assertIn("nothing changed", resolved)

    def test_build_artifact_patch_edit_prompt_lists_exact_background_targets(self) -> None:
        prompt = ai_api.build_artifact_patch_edit_prompt(
            original_edit_request="Edit the background so it is a city.",
            context={"artifact": {"artifactType": "car race"}},
            current_html=PATCHABLE_ARTIFACT_HTML,
        )

        self.assertIn("Available exact background selectors", prompt)
        self.assertIn("#track-bg", prompt)
        self.assertIn("Available exact scene-root selectors", prompt)
        self.assertIn("Do not invent selectors", prompt)
        self.assertIn("Keep it CSS-only", prompt)

    def test_rewrite_artifact_patch_plan_preserves_unmatched_selector(self) -> None:
        """Hallucinated selectors that don't fuzzy-match are preserved as-is.
        The CSS application layer will report 'not_found' — safer than
        silently applying to the wrong selector."""
        rewritten = ai_api.rewrite_artifact_patch_plan_for_current_html(
            plan={
                "assistantMessage": "Updated the city background.",
                "edits": [
                    {
                        "type": "set_css_property",
                        "selector": "#city-bg",
                        "property": "background",
                        "value": "linear-gradient(180deg, #0f2742 0%, #7a5c3d 100%)",
                    }
                ],
            },
            current_html=PATCHABLE_ARTIFACT_HTML,
            original_edit_request="Edit the background so it is a city.",
        )

        # No domain-specific remapping — selector stays unchanged.
        self.assertEqual(rewritten["edits"][0]["selector"], "#city-bg")

    def test_rewrite_artifact_patch_plan_preserves_unmatched_layout_selector(self) -> None:
        rewritten = ai_api.rewrite_artifact_patch_plan_for_current_html(
            plan={
                "assistantMessage": "Switched to vertical alignment.",
                "edits": [
                    {
                        "type": "set_css_property",
                        "selector": "#poll-grid",
                        "property": "flex-direction",
                        "value": "column",
                    }
                ],
            },
            current_html=LAYOUT_ARTIFACT_HTML,
            original_edit_request="Change the alignment so horizontal polls become vertical polls.",
        )

        self.assertEqual(rewritten["edits"][0]["selector"], "#poll-grid")

    def test_rewrite_artifact_patch_plan_preserves_unmatched_header_selector(self) -> None:
        rewritten = ai_api.rewrite_artifact_patch_plan_for_current_html(
            plan={
                "assistantMessage": "Added spacing above the poll rows.",
                "edits": [
                    {
                        "type": "set_css_property",
                        "selector": "#header",
                        "property": "margin-bottom",
                        "value": "18px",
                    }
                ],
            },
            current_html=TITLE_OVERLAP_ARTIFACT_HTML,
            original_edit_request="Increase title spacing so it is not hidden behind the blocks.",
        )

        self.assertEqual(rewritten["edits"][0]["selector"], "#header")

    def test_rewrite_preserves_selector_when_css_has_comments(self) -> None:
        """CSS comments preceding a rule must not pollute the extracted
        selector text, which would cause fuzzy matching to kick in
        and remap the selector to a child (e.g. .lego-brick -> .lego-brick .stud)."""
        html_with_comments = """<!doctype html><html><head><style>
  /* Individual LEGO brick in the stack */
  .lego-brick {
    position: relative;
    width: 66px; /* Increased by 50% from 44px */
    height: 40px;
  }
  .lego-brick .stud {
    position: absolute;
    width: 12px;
    height: 12px;
  }
  .lego-brick .stud:nth-child(1) { left: 9px; }
  .lego-brick .stud:nth-child(2) { left: 36px; }
  .brick-track { width: 74px; }
</style></head><body>
  <script>window.prezoSetPollRenderer(function(){})</script>
</body></html>"""
        rewritten = ai_api.rewrite_artifact_patch_plan_for_current_html(
            plan={
                "assistantMessage": "Increased poll width.",
                "edits": [
                    {"type": "set_css_property", "selector": ".brick-track", "property": "width", "value": "111px"},
                    {"type": "set_css_property", "selector": ".lego-brick", "property": "width", "value": "99px"},
                    {"type": "set_css_property", "selector": ".lego-brick .stud:nth-child(1)", "property": "left", "value": "13.5px"},
                    {"type": "set_css_property", "selector": ".lego-brick .stud:nth-child(2)", "property": "left", "value": "54px"},
                ],
            },
            current_html=html_with_comments,
            original_edit_request="increase the width of the polls by 50%",
        )
        edits = rewritten["edits"]
        self.assertEqual(len(edits), 4)
        # .lego-brick must NOT be remapped to .lego-brick .stud
        self.assertEqual(edits[0]["selector"], ".brick-track")
        self.assertEqual(edits[1]["selector"], ".lego-brick")
        self.assertEqual(edits[2]["selector"], ".lego-brick .stud:nth-child(1)")
        self.assertEqual(edits[3]["selector"], ".lego-brick .stud:nth-child(2)")

    def test_rewrite_artifact_patch_plan_compacts_oversized_title_studs_plan(self) -> None:
        oversized_edits = [
            {
                "type": "set_css_property",
                "selector": ".poll-title",
                "property": "background",
                "value": "#F4C531",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title",
                "property": "padding",
                "value": "10px 16px",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title",
                "property": "border-radius",
                "value": "10px",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title",
                "property": "box-shadow",
                "value": "0 4px 0 #C79D1A",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title",
                "property": "border",
                "value": "2px solid #C9A323",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title",
                "property": "display",
                "value": "inline-block",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title",
                "property": "position",
                "value": "relative",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title",
                "property": "z-index",
                "value": "2",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title::before",
                "property": "content",
                "value": "\"\"",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title::before",
                "property": "position",
                "value": "absolute",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title::before",
                "property": "top",
                "value": "-10px",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title::before",
                "property": "left",
                "value": "12px",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title::before",
                "property": "width",
                "value": "22px",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title::before",
                "property": "height",
                "value": "10px",
            },
            {
                "type": "set_css_property",
                "selector": ".poll-title::before",
                "property": "background",
                "value": "#F7D34B",
            },
        ]
        rewritten = ai_api.rewrite_artifact_patch_plan_for_current_html(
            plan={
                "assistantMessage": "Added a LEGO title container with studs.",
                "edits": oversized_edits,
            },
            current_html=TITLE_OVERLAP_ARTIFACT_HTML,
            original_edit_request="put the title in a lego shaped container, high quality and well design with studs, yellow color,",
        )
        patched_html, _patched_package, issues = ai_api.apply_artifact_patch_plan_progressively(
            current_html=TITLE_OVERLAP_ARTIFACT_HTML,
            current_package=None,
            plan=rewritten,
            original_edit_request="put the title in a lego shaped container, high quality and well design with studs, yellow color,",
            context={},
        )

        self.assertLessEqual(
            len(rewritten["edits"]), ai_api.ARTIFACT_PATCH_CANDIDATE_MAX_EDITS
        )
        self.assertEqual(issues, [])
        self.assertIn(".poll-title::before {", patched_html)
        self.assertIn("background: #F7D34B;", patched_html)

    def test_title_top_decoration_requirement_requires_sized_title_pseudo_element(self) -> None:
        unsized_decoration_html = TITLE_OVERLAP_ARTIFACT_HTML.replace(
            "</style>",
            "\n.poll-title::before {\n  content: \"\";\n  background: #F7D34B;\n}\n</style>",
        )
        satisfied, missing = ai_api.evaluate_artifact_patch_satisfaction(
            requirements=["title_top_decoration"],
            html=unsized_decoration_html,
        )

        self.assertFalse(satisfied)
        self.assertIn("title_top_decoration", missing)

    def test_infer_requirements_adds_dense_title_decoration_for_shells_request(self) -> None:
        requirements = ai_api.infer_artifact_patch_satisfaction_requirements(
            "for the title container, add more shells till the top is fully filled"
        )

        self.assertIn("title_top_decoration", requirements)
        self.assertIn("title_top_decoration_dense", requirements)
        self.assertNotIn("title_studs", requirements)

    def test_title_top_decoration_dense_requirement_needs_dense_pattern(self) -> None:
        sparse_decoration_html = TITLE_OVERLAP_ARTIFACT_HTML.replace(
            "</style>",
            (
                "\n.poll-title::before {\n"
                "  content: \"\";\n"
                "  width: 18px;\n"
                "  height: 8px;\n"
                "  background: #F7D34B;\n"
                "  box-shadow: 24px 0 0 #F7D34B;\n"
                "}\n"
                "</style>"
            ),
        )
        dense_decoration_html = TITLE_OVERLAP_ARTIFACT_HTML.replace(
            "</style>",
            (
                "\n.poll-title::before {\n"
                "  content: \"\";\n"
                "  width: 18px;\n"
                "  height: 8px;\n"
                "  background: #F7D34B;\n"
                "  box-shadow: 24px 0 0 #F7D34B, 48px 0 0 #F7D34B, 72px 0 0 #F7D34B, 96px 0 0 #F7D34B, 120px 0 0 #F7D34B;\n"
                "}\n"
                "</style>"
            ),
        )
        sparse_satisfied, sparse_missing = ai_api.evaluate_artifact_patch_satisfaction(
            requirements=["title_top_decoration_dense"],
            html=sparse_decoration_html,
        )
        dense_satisfied, dense_missing = ai_api.evaluate_artifact_patch_satisfaction(
            requirements=["title_top_decoration_dense"],
            html=dense_decoration_html,
        )

        self.assertFalse(sparse_satisfied)
        self.assertIn("title_top_decoration_dense", sparse_missing)
        self.assertTrue(dense_satisfied)
        self.assertEqual(dense_missing, [])

    def test_infer_requirements_adds_dynamic_title_color_requirement(self) -> None:
        requirements = ai_api.infer_artifact_patch_satisfaction_requirements(
            "make the title container blue"
        )

        self.assertIn("title_requested_color::blue", requirements)
        self.assertNotIn("title_yellow", requirements)

    def test_title_requested_color_requirement_checks_title_css(self) -> None:
        blue_title_html = TITLE_OVERLAP_ARTIFACT_HTML.replace(
            "</style>",
            "\n.poll-title { background: blue; }\n</style>",
        )
        red_title_html = TITLE_OVERLAP_ARTIFACT_HTML.replace(
            "</style>",
            "\n.poll-title { background: red; }\n</style>",
        )
        blue_satisfied, blue_missing = ai_api.evaluate_artifact_patch_satisfaction(
            requirements=["title_requested_color::blue"],
            html=blue_title_html,
        )
        red_satisfied, red_missing = ai_api.evaluate_artifact_patch_satisfaction(
            requirements=["title_requested_color::blue"],
            html=red_title_html,
        )

        self.assertTrue(blue_satisfied)
        self.assertEqual(blue_missing, [])
        self.assertFalse(red_satisfied)
        self.assertIn("title_requested_color::blue", red_missing)

    def test_infer_completion_requirements_detects_compound_poll_scale_request(self) -> None:
        requirements = ai_api.infer_artifact_completion_requirements(
            "increase the poll size and the lego inside the poll by 50%"
        )

        self.assertIn("poll_visual_scale", requirements)
        self.assertIn("poll_unit_scale", requirements)

    def test_evaluate_completion_requirements_detects_partial_poll_scale(self) -> None:
        before_html = PATCH_COMPLETION_ARTIFACT_HTML
        after_html = PATCH_COMPLETION_ARTIFACT_HTML.replace("gap: 14px;", "gap: 21px;")
        satisfied, missing = ai_api.evaluate_artifact_completion_requirements(
            requirements=["poll_visual_scale", "poll_unit_scale"],
            before_html=before_html,
            after_html=after_html,
        )

        self.assertFalse(satisfied)
        self.assertIn("poll_unit_scale", missing)

    def test_evaluate_completion_requirements_requires_unit_selector_changes(self) -> None:
        before_html = PATCH_COMPLETION_ARTIFACT_HTML
        after_html = PATCH_COMPLETION_ARTIFACT_HTML.replace("gap: 14px;", "gap: 21px;")
        after_html = after_html.replace(
            "</style>",
            "\n.poll-option { width: 48px; }\n</style>",
        )
        satisfied, missing = ai_api.evaluate_artifact_completion_requirements(
            requirements=["poll_visual_scale", "poll_unit_scale"],
            before_html=before_html,
            after_html=after_html,
        )

        self.assertFalse(satisfied)
        self.assertIn("poll_unit_scale", missing)

    def test_progressive_patch_accepts_partial_when_only_dense_decoration_is_missing(self) -> None:
        patched_html, _patched_package, issues = ai_api.apply_artifact_patch_plan_progressively(
            current_html=TITLE_OVERLAP_ARTIFACT_HTML,
            current_package=None,
            plan={
                "assistantMessage": "Added top shells.",
                "edits": [
                    {
                        "type": "set_css_property",
                        "selector": ".poll-title::before",
                        "property": "content",
                        "value": "\"\"",
                    },
                    {
                        "type": "set_css_property",
                        "selector": ".poll-title::before",
                        "property": "width",
                        "value": "18px",
                    },
                    {
                        "type": "set_css_property",
                        "selector": ".poll-title::before",
                        "property": "height",
                        "value": "8px",
                    },
                    {
                        "type": "set_css_property",
                        "selector": ".poll-title::before",
                        "property": "background",
                        "value": "#F7D34B",
                    },
                ],
            },
            original_edit_request="fill the top of the title with shells",
            context={},
        )

        self.assertEqual(issues, [])
        self.assertIn(".poll-title::before {", patched_html)

    def test_attempt_builtin_cityscape_background_patch_preserves_cars(self) -> None:
        patched_html, assistant_message = ai_api.attempt_builtin_cityscape_background_patch(
            current_html=PATCHABLE_ARTIFACT_HTML,
            original_edit_request="Edit the background so it is a cityscape.",
        )

        self.assertIn("#track-bg::before", patched_html)
        self.assertIn("#track-bg::after", patched_html)
        self.assertIn(".car", patched_html)
        self.assertIn("cityscape-style background treatment", assistant_message)

    def test_attempt_builtin_layout_orientation_patch_updates_flex_direction(self) -> None:
        patched_html, _patched_package, assistant_message = (
            ai_api.attempt_builtin_layout_orientation_patch(
                current_html=LAYOUT_ARTIFACT_HTML,
                current_package=None,
                original_edit_request="Change the alignment so horizontal polls become vertical polls.",
            )
        )

        self.assertIn("flex-direction: column;", patched_html)
        self.assertIn("align-items: stretch;", patched_html)
        self.assertIn("align vertical", assistant_message)

    def test_attempt_builtin_title_overlap_spacing_patch_updates_title_and_layout(self) -> None:
        patched_html, _patched_package, assistant_message = (
            ai_api.attempt_builtin_title_overlap_spacing_patch(
                current_html=TITLE_OVERLAP_ARTIFACT_HTML,
                current_package=None,
                original_edit_request="The title text is hidden behind the blocks. Add spacing so it stays visible.",
            )
        )

        self.assertIn("z-index: 4;", patched_html)
        self.assertIn("margin-top: 14px;", patched_html)
        self.assertIn("readability patch", assistant_message)

    def test_apply_background_treatment_to_artifact_html_preserves_cars(self) -> None:
        patched_html, issues = ai_api.apply_background_treatment_to_artifact_html(
            current_html=PATCHABLE_ARTIFACT_HTML,
            treatment={
                "composition": "mountains",
                "timeOfDay": "sunset",
                "intensity": "balanced",
                "topColor": "#355070",
                "midColor": "#B56576",
                "bottomColor": "#E56B6F",
                "silhouetteColor": "#2F3E46",
                "accentColor": "#EAAC8B",
                "hazeColor": "#E9C46A",
                "lightColor": "#FFE8A3",
                "horizonHeightPct": 44,
                "detailDensity": 60,
            },
            original_edit_request="Make the background look like sunset mountains.",
        )

        self.assertEqual(issues, [])
        self.assertIn('id="prezo-background-treatment-data"', patched_html)
        self.assertIn('"composition":"mountains"', patched_html)
        self.assertIn('"timeOfDay":"sunset"', patched_html)
        self.assertIn(".car", patched_html)

    def test_apply_background_treatment_can_fallback_to_scene_root(self) -> None:
        patched_html, issues = ai_api.apply_background_treatment_to_artifact_html(
            current_html=SCENE_ROOT_ONLY_ARTIFACT_HTML,
            treatment={
                "composition": "skyline",
                "timeOfDay": "night",
                "intensity": "dramatic",
                "topColor": "#0B1F33",
                "midColor": "#21405B",
                "bottomColor": "#4A6A86",
                "silhouetteColor": "#121A28",
                "accentColor": "#F2B36D",
                "hazeColor": "#6E88A3",
                "lightColor": "#FFE2A8",
                "horizonHeightPct": 44,
                "detailDensity": 62,
            },
            original_edit_request="Make the background a cityscape at night.",
        )

        self.assertEqual(issues, [])
        self.assertIn('id="prezo-background-treatment-data"', patched_html)
        self.assertIn('"sceneRootSelector":"#artifact-root"', patched_html)
        self.assertIn(".car", patched_html)
        self.assertIn("#artifact-root", patched_html)

    def test_extract_background_edit_signature_includes_runtime_treatment_config(self) -> None:
        patched_html, issues = ai_api.apply_background_treatment_to_artifact_html(
            current_html=PATCHABLE_ARTIFACT_HTML,
            treatment={
                "composition": "skyline",
                "timeOfDay": "night",
                "intensity": "dramatic",
                "topColor": "#0B1F33",
                "midColor": "#21405B",
                "bottomColor": "#4A6A86",
                "silhouetteColor": "#121A28",
                "accentColor": "#F2B36D",
                "hazeColor": "#6E88A3",
                "lightColor": "#FFE2A8",
                "horizonHeightPct": 44,
                "detailDensity": 62,
            },
            original_edit_request="Make the background a cityscape at night.",
        )

        self.assertEqual(issues, [])
        signature = ai_api.extract_background_edit_signature(patched_html)
        self.assertIn('"composition":"skyline"', signature)
        self.assertIn('"runtimeMode":"overlay"', signature)

    def test_validate_background_edit_result_rejects_washed_out_signature(self) -> None:
        washed_out_html = PATCHABLE_ARTIFACT_HTML.replace(
            "linear-gradient(180deg, #0b1020 0%, #1a2240 100%)",
            "linear-gradient(180deg, #F9FAFB 0%, #FBFCFD 100%)",
        )
        washed_out_html = washed_out_html.replace(
            "</style>",
            "\n#track-bg::before {\n  content: \"\";\n  background: linear-gradient(180deg, #F8F9FA 0%, #FCFDFE 100%);\n}\n</style>",
        )

        issues = ai_api.validate_background_edit_result(
            original_html=PATCHABLE_ARTIFACT_HTML,
            edited_html=washed_out_html,
            original_edit_request="Make the background a cityscape.",
        )

        self.assertIn("washed out", issues[0])

    def test_normalize_background_treatment_boosts_detailed_skyline_requests(self) -> None:
        normalized = ai_api.normalize_background_treatment(
            {},
            "Make the Dubai skyline more detailed with visible windows and spires.",
        )

        self.assertEqual(normalized["composition"], "skyline")
        self.assertGreaterEqual(normalized["detailDensity"], 78)
        self.assertGreaterEqual(normalized["layerCount"], 4)
        self.assertGreaterEqual(normalized["buildingCount"], 24)
        self.assertGreaterEqual(normalized["windowDensity"], 48)
        self.assertGreaterEqual(normalized["spireFrequency"], 34)
        self.assertGreaterEqual(normalized["roofVariation"], 46)

    def test_validate_background_edit_result_rejects_under_detailed_skyline_request(self) -> None:
        edited_html = ai_api.upsert_artifact_background_treatment_config(
            PATCHABLE_ARTIFACT_HTML,
            {
                "composition": "skyline",
                "timeOfDay": "night",
                "intensity": "dramatic",
                "topColor": "#0B1F33",
                "midColor": "#21405B",
                "bottomColor": "#4A6A86",
                "silhouetteColor": "#121A28",
                "accentColor": "#F2B36D",
                "hazeColor": "#6E88A3",
                "lightColor": "#FFE2A8",
                "horizonHeightPct": 44,
                "detailDensity": 42,
                "layerCount": 2,
                "buildingCount": 10,
                "heightVariance": 20,
                "windowDensity": 0,
                "spireFrequency": 0,
                "roofVariation": 0,
                "runtimeMode": "overlay",
            },
        )

        issues = ai_api.validate_background_edit_result(
            original_html=PATCHABLE_ARTIFACT_HTML,
            edited_html=edited_html,
            original_edit_request="Make the skyline much more detailed with lit windows and spires.",
        )

        self.assertTrue(issues)
        self.assertIn("lacks skyline depth layers", issues[0])

    async def test_background_treatment_uses_truthful_applied_message(self) -> None:
        gemini_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "I added glowing windows and antennas everywhere.",
                        "treatment": {
                            "composition": "skyline",
                            "timeOfDay": "night",
                            "intensity": "dramatic",
                            "topColor": "#0B1F33",
                            "midColor": "#21405B",
                            "bottomColor": "#4A6A86",
                            "silhouetteColor": "#121A28",
                            "accentColor": "#F2B36D",
                            "hazeColor": "#6E88A3",
                            "lightColor": "#FFE2A8",
                            "horizonHeightPct": 44,
                            "detailDensity": 58,
                            "layerCount": 3,
                            "buildingCount": 18,
                            "heightVariance": 52,
                            "windowDensity": 0,
                            "spireFrequency": 0,
                            "roofVariation": 18,
                            "targetSelector": "",
                        },
                    }
                ),
                "stop",
            )
        )

        with patch.object(ai_api, "request_gemini_text", gemini_mock):
            patched_html, assistant_message, issues = (
                await ai_api.attempt_artifact_background_treatment_edit(
                    api_key="test-key",
                    model="gemini-2.5-flash",
                    original_edit_request="Make the background a nighttime skyline.",
                    context={"artifact": {"artifactType": "car poll"}},
                    current_html=PATCHABLE_ARTIFACT_HTML,
                    timeout_seconds=5.0,
                )
            )

        self.assertEqual(issues, [])
        self.assertIn('id="prezo-background-treatment-data"', patched_html)
        self.assertIn("skyline background", assistant_message)
        self.assertNotIn("glowing windows", assistant_message.lower())
        self.assertNotIn("antenna", assistant_message.lower())

    def test_set_css_property_in_css_can_update_rule_inside_media_block(self) -> None:
        css_text = """
@media (min-width: 600px) {
  #track-bg {
    background: linear-gradient(180deg, #0b1020 0%, #1a2240 100%);
  }
}
"""

        updated_css, changed, status = ai_api.set_css_property_in_css(
            css_text,
            "#track-bg",
            "background",
            "linear-gradient(180deg, #7ec8ff 0%, #f6e58d 100%)",
        )

        self.assertTrue(changed)
        self.assertEqual(status, "changed")
        self.assertIn("linear-gradient(180deg, #7ec8ff 0%, #f6e58d 100%)", updated_css)

    def test_prepare_artifact_context_for_model_prefers_full_html(self) -> None:
        prepared = ai_api.prepare_artifact_context_for_model(
            {
                "artifact": {
                    "requestMode": "edit",
                    "currentArtifactFullHtml": PATCHABLE_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
                }
            },
            "edit",
        )

        artifact_context = prepared["artifact"]
        self.assertIn("#track-bg", artifact_context["currentArtifactHtml"])
        self.assertNotIn("currentArtifactFullHtml", artifact_context)

    async def test_local_edit_prefers_patch_flow_before_full_regeneration(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Rounded the track corners.",
                        "edits": [
                            {
                                "type": "set_css_property",
                                "selector": "#track-bg",
                                "property": "border-radius",
                                "value": "24px",
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
                    "originalEditRequest": "Increase the border radius.",
                    "currentArtifactFullHtml": PATCHABLE_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
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
        self.assertEqual(response.assistantMessage, "Rounded the track corners.")
        self.assertIn("border-radius: 24px", response.html)
        self.assertIn(".car", response.html)

    async def test_partial_patch_completion_triggers_full_generation_pass(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            side_effect=[
                (
                    json.dumps(
                        {
                            "assistantMessage": "Scaled the poll layout.",
                            "edits": [
                                {
                                    "type": "set_css_property",
                                    "selector": ".poll-options",
                                    "property": "gap",
                                    "value": "21px",
                                }
                            ],
                        }
                    ),
                    "stop",
                ),
                (VALID_ARTIFACT_HTML, "stop"),
            ]
        )
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Apply a targeted edit.",
            context={
                "artifact": {
                    "requestMode": "edit",
                    "originalEditRequest": "increase the poll size and the lego inside the poll by 50%",
                    "currentArtifactFullHtml": PATCH_COMPLETION_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
                }
            },
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 2)
        self.assertEqual(
            gemini_mock.await_args_list[0].kwargs["request_stage"],
            "artifact patch edit",
        )
        self.assertEqual(
            gemini_mock.await_args_list[1].kwargs["request_stage"],
            "artifact edit generation",
        )
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn("Artifact ready. Keep prompting to iterate.", response.assistantMessage)

    async def test_partial_patch_completion_materializes_package_html_before_checking(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            side_effect=[
                (
                    json.dumps(
                        {
                            "assistantMessage": "Scaled the poll layout.",
                            "edits": [
                                {
                                    "type": "set_css_property",
                                    "selector": ".poll-options",
                                    "property": "gap",
                                    "value": "21px",
                                }
                            ],
                        }
                    ),
                    "stop",
                ),
                (VALID_ARTIFACT_HTML, "stop"),
            ]
        )
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Apply a targeted edit.",
            context={
                "artifact": {
                    "requestMode": "edit",
                    "originalEditRequest": "increase the poll size and the lego inside the poll by 50%",
                    "currentArtifactFullHtml": PATCH_COMPLETION_ARTIFACT_PACKAGE["files"][0]["content"],
                    "currentArtifactFullPackage": PATCH_COMPLETION_ARTIFACT_PACKAGE,
                }
            },
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 2)
        self.assertEqual(
            gemini_mock.await_args_list[0].kwargs["request_stage"],
            "artifact patch edit",
        )
        self.assertEqual(
            gemini_mock.await_args_list[1].kwargs["request_stage"],
            "artifact edit generation",
        )
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn("Artifact ready. Keep prompting to iterate.", response.assistantMessage)

    async def test_layout_orientation_edit_uses_model_patch_flow(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Applied a targeted layout update.",
                        "edits": [
                            {
                                "type": "set_css_property",
                                "selector": ".poll-options",
                                "property": "display",
                                "value": "flex",
                            },
                            {
                                "type": "set_css_property",
                                "selector": ".poll-options",
                                "property": "flex-direction",
                                "value": "column",
                            },
                            {
                                "type": "set_css_property",
                                "selector": ".poll-options",
                                "property": "align-items",
                                "value": "stretch",
                            },
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
                    "originalEditRequest": "Change the alignment so horizontal polls become vertical polls.",
                    "currentArtifactFullHtml": LAYOUT_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
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
        self.assertEqual(
            gemini_mock.await_args_list[0].kwargs["request_stage"],
            "artifact patch edit",
        )
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn("targeted layout update", response.assistantMessage)
        self.assertIn("flex-direction: column;", response.html)

    async def test_title_overlap_edit_uses_model_patch_flow(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Applied a targeted readability patch.",
                        "edits": [
                            {
                                "type": "set_css_property",
                                "selector": ".poll-title",
                                "property": "margin-bottom",
                                "value": "14px",
                            },
                            {
                                "type": "set_css_property",
                                "selector": ".poll-options",
                                "property": "margin-top",
                                "value": "14px",
                            },
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
                    "originalEditRequest": "the title of each poll is being hidden behind the blocks can we space it out more so they are not hidden.",
                    "currentArtifactFullHtml": TITLE_OVERLAP_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
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
        self.assertEqual(
            gemini_mock.await_args_list[0].kwargs["request_stage"],
            "artifact patch edit",
        )
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn("readability patch", response.assistantMessage)
        self.assertIn("margin-top: 14px;", response.html)

    async def test_local_edit_patch_failure_falls_back_to_full_regeneration(self) -> None:
        anthropic_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Patch mode is not suitable.",
                        "edits": [],
                    }
                ),
                "end_turn",
            )
        )
        gemini_mock = AsyncMock(
            side_effect=[
                (
                    json.dumps(
                        {
                            "assistantMessage": "Patch mode is not suitable.",
                            "edits": [],
                        }
                    ),
                    "stop",
                ),
                (VALID_ARTIFACT_HTML, "stop"),
            ]
        )
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Apply a targeted edit.",
            context={
                "artifact": {
                    "requestMode": "edit",
                    "originalEditRequest": "Increase the border radius.",
                    "currentArtifactFullHtml": PATCHABLE_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
                }
            },
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(anthropic_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_count, 2)
        self.assertEqual(
            anthropic_mock.await_args_list[0].kwargs["request_stage"],
            "artifact patch edit",
        )
        self.assertEqual(
            gemini_mock.await_args_list[0].kwargs["request_stage"],
            "artifact patch edit",
        )
        self.assertEqual(
            gemini_mock.await_args_list[1].kwargs["request_stage"],
            "artifact edit generation",
        )
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn("Artifact ready. Keep prompting to iterate.", response.assistantMessage)

    async def test_oversized_title_patch_plan_is_compacted_instead_of_blocked(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Added a LEGO title container with studs.",
                        "edits": [
                            {"type": "set_css_property", "selector": ".poll-title", "property": "background", "value": "#F4C531"},
                            {"type": "set_css_property", "selector": ".poll-title", "property": "padding", "value": "10px 16px"},
                            {"type": "set_css_property", "selector": ".poll-title", "property": "border-radius", "value": "10px"},
                            {"type": "set_css_property", "selector": ".poll-title", "property": "box-shadow", "value": "0 4px 0 #C79D1A"},
                            {"type": "set_css_property", "selector": ".poll-title", "property": "border", "value": "2px solid #C9A323"},
                            {"type": "set_css_property", "selector": ".poll-title", "property": "display", "value": "inline-block"},
                            {"type": "set_css_property", "selector": ".poll-title", "property": "position", "value": "relative"},
                            {"type": "set_css_property", "selector": ".poll-title", "property": "z-index", "value": "2"},
                            {"type": "set_css_property", "selector": ".poll-title::before", "property": "content", "value": "\"\""},
                            {"type": "set_css_property", "selector": ".poll-title::before", "property": "position", "value": "absolute"},
                            {"type": "set_css_property", "selector": ".poll-title::before", "property": "top", "value": "-10px"},
                            {"type": "set_css_property", "selector": ".poll-title::before", "property": "left", "value": "12px"},
                            {"type": "set_css_property", "selector": ".poll-title::before", "property": "width", "value": "22px"},
                            {"type": "set_css_property", "selector": ".poll-title::before", "property": "height", "value": "10px"},
                            {"type": "set_css_property", "selector": ".poll-title::before", "property": "background", "value": "#F7D34B"},
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
                    "originalEditRequest": "put the title in a lego shaped container, high quality and well design with studs, yellow color,",
                    "currentArtifactFullHtml": TITLE_OVERLAP_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
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
        self.assertIn(".poll-title::before {", response.html)
        self.assertIn("background: #F7D34B;", response.html)

    async def test_patch_planner_retries_without_schema_when_gemini_schema_states_overflow(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            side_effect=[
                ai_api.HTTPException(
                    status_code=502,
                    detail=(
                        "The specified schema produces a constraint that has too many states for serving."
                    ),
                ),
                (
                    json.dumps(
                        {
                            "assistantMessage": "Added a yellow title container with studs.",
                            "edits": [
                                {
                                    "type": "set_css_property",
                                    "selector": ".poll-title",
                                    "property": "background",
                                    "value": "#F4C531",
                                },
                                {
                                    "type": "set_css_property",
                                    "selector": ".poll-title",
                                    "property": "padding",
                                    "value": "10px 16px",
                                },
                                {
                                    "type": "set_css_property",
                                    "selector": ".poll-title",
                                    "property": "border-radius",
                                    "value": "10px",
                                },
                                {
                                    "type": "set_css_property",
                                    "selector": ".poll-title::before",
                                    "property": "content",
                                    "value": "\"\"",
                                },
                                {
                                    "type": "set_css_property",
                                    "selector": ".poll-title::before",
                                    "property": "width",
                                    "value": "22px",
                                },
                                {
                                    "type": "set_css_property",
                                    "selector": ".poll-title::before",
                                    "property": "height",
                                    "value": "10px",
                                },
                                {
                                    "type": "set_css_property",
                                    "selector": ".poll-title::before",
                                    "property": "background",
                                    "value": "#F7D34B",
                                },
                            ],
                        }
                    ),
                    "stop",
                ),
            ]
        )
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Apply a targeted edit.",
            context={
                "artifact": {
                    "requestMode": "edit",
                    "originalEditRequest": "put the title in a lego shaped container, high quality and well design with studs, yellow color",
                    "currentArtifactFullHtml": TITLE_OVERLAP_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
                }
            },
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 2)
        self.assertIsNotNone(gemini_mock.await_args_list[0].kwargs.get("response_json_schema"))
        self.assertIsNone(gemini_mock.await_args_list[1].kwargs.get("response_json_schema"))
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn(".poll-title::before {", response.html)
        self.assertIn("background: #F7D34B;", response.html)

    async def test_background_image_request_without_url_uses_full_regeneration(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "stop"))
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Apply a targeted edit.",
            context={
                "artifact": {
                    "requestMode": "edit",
                    "originalEditRequest": "Make the track an image of a city in Dubai.",
                    "currentArtifactFullHtml": PATCHABLE_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
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
        self.assertEqual(
            gemini_mock.await_args_list[0].kwargs["request_stage"],
            "artifact edit generation",
        )
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn("Artifact ready. Keep prompting to iterate.", response.assistantMessage)

    async def test_local_city_background_edit_uses_generic_patch_flow(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Updated the background to a city-inspired dusk gradient.",
                        "edits": [
                            {
                                "type": "set_css_property",
                                "selector": "#track-bg",
                                "property": "background",
                                "value": "linear-gradient(180deg, #243B55 0%, #141E30 100%)",
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
                    "originalEditRequest": "Edit the background so its a cityscape.",
                    "currentArtifactFullHtml": PATCHABLE_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
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
        self.assertEqual(
            gemini_mock.await_args_list[0].kwargs["request_stage"],
            "artifact patch edit",
        )
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn("Updated the background to a city-inspired dusk gradient.", response.assistantMessage)
        self.assertIn("background: linear-gradient(180deg, #243B55 0%, #141E30 100%);", response.html)
        self.assertIn(".car", response.html)

    async def test_background_patch_plan_failure_falls_back_to_full_regeneration(self) -> None:
        anthropic_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Patch mode is not suitable.",
                        "edits": [],
                    }
                ),
                "end_turn",
            )
        )
        gemini_mock = AsyncMock(
            side_effect=[
                (
                    json.dumps({"assistantMessage": "No usable patch edits.", "edits": []}),
                    "stop",
                ),
                (VALID_ARTIFACT_HTML, "stop"),
            ]
        )
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Apply a targeted edit.",
            context={
                "artifact": {
                    "requestMode": "edit",
                    "originalEditRequest": "Make the background warmer and more atmospheric.",
                    "currentArtifactFullHtml": PATCHABLE_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
                }
            },
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(anthropic_mock.await_count, 1)
        self.assertEqual(gemini_mock.await_count, 2)
        self.assertEqual(
            anthropic_mock.await_args_list[0].kwargs["request_stage"],
            "artifact patch edit",
        )
        self.assertEqual(
            gemini_mock.await_args_list[0].kwargs["request_stage"],
            "artifact patch edit",
        )
        self.assertEqual(
            gemini_mock.await_args_list[1].kwargs["request_stage"],
            "artifact edit generation",
        )
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn("Artifact ready. Keep prompting to iterate.", response.assistantMessage)

    async def test_local_edit_with_truncated_artifact_html_uses_full_regeneration(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(return_value=(VALID_ARTIFACT_HTML, "stop"))
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
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 1)
        self.assertEqual(
            gemini_mock.await_args_list[0].kwargs["request_stage"],
            "artifact edit generation",
        )
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn("Artifact ready. Keep prompting to iterate.", response.assistantMessage)

    async def test_local_repair_prefers_patch_flow_before_full_regeneration(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "assistantMessage": "Adjusted the border radius safely on the stable artifact.",
                        "edits": [
                            {
                                "type": "set_css_property",
                                "selector": "#track-bg",
                                "property": "border-radius",
                                "value": "20px",
                            }
                        ],
                    }
                ),
                "stop",
            )
        )
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Repair the failed edit.",
            context={
                "artifact": {
                    "requestMode": "repair",
                    "originalEditRequest": "Increase the border radius.",
                    "currentArtifactFullHtml": PATCHABLE_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
                    "failedArtifactHtml": INVALID_ARTIFACT_HTML,
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
        self.assertIn("Adjusted the border radius safely", response.assistantMessage)
        self.assertIn("border-radius: 20px", response.html)
        self.assertIn(".car", response.html)

    async def test_local_repair_patch_failure_falls_back_to_full_regeneration(self) -> None:
        anthropic_mock = AsyncMock()
        gemini_mock = AsyncMock(
            side_effect=[
                (
                    json.dumps(
                        {
                            "assistantMessage": "Patch mode is not suitable.",
                            "edits": [],
                        }
                    ),
                    "stop",
                ),
                (VALID_ARTIFACT_HTML, "stop"),
            ]
        )
        payload = ai_api.PollGameArtifactBuildRequest(
            prompt="Repair the failed edit.",
            context={
                "artifact": {
                    "requestMode": "repair",
                    "originalEditRequest": "Increase the border radius.",
                    "currentArtifactFullHtml": PATCHABLE_ARTIFACT_HTML,
                    "currentArtifactHtml": "<html><!-- artifact-context-cut --></html>",
                    "failedArtifactHtml": INVALID_ARTIFACT_HTML,
                }
            },
            model="gemini-3.1-pro-preview",
        )
        with patch.object(ai_api, "request_anthropic_text", anthropic_mock), patch.object(
            ai_api, "request_gemini_text", gemini_mock
        ):
            response = await ai_api.create_poll_game_artifact_build(payload)

        self.assertEqual(anthropic_mock.await_count, 0)
        self.assertEqual(gemini_mock.await_count, 2)
        self.assertEqual(
            gemini_mock.await_args_list[0].kwargs["request_stage"],
            "artifact patch edit",
        )
        self.assertEqual(
            gemini_mock.await_args_list[1].kwargs["request_stage"],
            "artifact repair generation",
        )
        self.assertEqual(response.model, "gemini-2.5-flash")
        self.assertIn("Artifact ready. Keep prompting to iterate.", response.assistantMessage)

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
