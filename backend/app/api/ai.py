from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..config import settings

router = APIRouter(prefix="/ai", tags=["ai"])
DEFAULT_ANTHROPIC_ARTIFACT_BUILD_MODEL = "claude-sonnet-4-6"
ANTHROPIC_API_BASE = "https://api.anthropic.com/v1"
ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_PLAN_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_ARTIFACT_EDIT_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_ARTIFACT_REPAIR_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_ARTIFACT_ANSWER_MODEL = "gemini-2.5-flash-lite"
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_ARTIFACT_MAX_TOKENS = 12000
GEMINI_ARTIFACT_REPAIR_MAX_TOKENS = 12000
GEMINI_ARTIFACT_RECOVERY_MAX_TOKENS = 10000
GEMINI_ARTIFACT_PATCH_MAX_TOKENS = 4000
ARTIFACT_MAX_REPAIR_ATTEMPTS = 3
ARTIFACT_EDIT_MAX_REPAIR_ATTEMPTS = 1
ARTIFACT_BUILD_MAX_REPAIR_ATTEMPTS = 2
ARTIFACT_REPAIR_MODE_MAX_REPAIR_ATTEMPTS = 1
ARTIFACT_MIN_INITIAL_CALL_TIMEOUT_SECONDS = 45.0
ARTIFACT_MIN_FOLLOWUP_CALL_TIMEOUT_SECONDS = 45.0
ARTIFACT_PATCH_MIN_CALL_TIMEOUT_SECONDS = 20.0
ARTIFACT_PATCH_TIMEOUT_SECONDS = 60.0
ARTIFACT_PATCH_FALLBACK_RESERVE_SECONDS = 120.0
ARTIFACT_EDIT_FOLLOWUP_RESERVE_SECONDS = 60.0
ARTIFACT_BUILD_FOLLOWUP_RESERVE_SECONDS = 45.0
ARTIFACT_REPAIR_FOLLOWUP_RESERVE_SECONDS = 45.0
ARTIFACT_CONTEXT_DIRECT_CHAR_LIMIT = 24000
ARTIFACT_CONTEXT_HEAD_CHAR_LIMIT = 9000
ARTIFACT_CONTEXT_TAIL_CHAR_LIMIT = 4000
ARTIFACT_CONTEXT_COMBINED_CHAR_LIMIT = 32000
ARTIFACT_LIVE_HOOK_CONTEXT_CHAR_LIMIT = 12000
ARTIFACT_RECENT_EDIT_REQUEST_LIMIT = 4
ARTIFACT_RECENT_EDIT_REQUEST_CHAR_LIMIT = 280
ARTIFACT_PATCH_HTML_CHAR_LIMIT = 120000
ARTIFACT_PATCH_MAX_EDITS = 8
ARTIFACT_SCRIPT_RE = re.compile(
    r"<script\b[^>]*>(?P<body>[\s\S]*?)</script>", re.IGNORECASE
)
ARTIFACT_STYLE_TAG_RE = re.compile(
    r"<style\b[^>]*>(?P<body>[\s\S]*?)</style>", re.IGNORECASE
)
ARTIFACT_MARKDOWN_FENCE_BLOCK_RE = re.compile(
    r"```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```", re.IGNORECASE
)
ARTIFACT_MARKDOWN_FENCE_FULL_RE = re.compile(
    r"^\s*```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```\s*$", re.IGNORECASE
)
ARTIFACT_MARKDOWN_FENCE_LINE_RE = re.compile(
    r"^\s*```(?:[a-z0-9_-]+)?\s*$", re.IGNORECASE | re.MULTILINE
)
ARTIFACT_SCRIPT_OPEN_RE = re.compile(r"<script\b", re.IGNORECASE)
ARTIFACT_SCRIPT_CLOSE_RE = re.compile(r"</script>", re.IGNORECASE)
ARTIFACT_HTML_SHAPE_RE = re.compile(
    r"<(?:!doctype|html|body|main|section|article|div|style|script)\b",
    re.IGNORECASE,
)
ARTIFACT_BROAD_EDIT_REQUEST_RE = re.compile(
    r"\b(?:redesign|rebuild|start over|from scratch|new concept|completely different|totally different|overhaul|reimagine|replace the scene|brand new)\b",
    re.IGNORECASE,
)
ARTIFACT_PATCH_ONLY_EDIT_REQUEST_RE = re.compile(
    r"\b(?:background|backdrop|sky|sunrise|sunset|daytime|nighttime|lighting|ambient|weather|color|colour|gradient|opacity|shadow|glow|border|radius|font|typography|title|headline|question|label|badge|text|padding|margin|spacing|size|bigger|smaller|larger)\b",
    re.IGNORECASE,
)
ARTIFACT_STRUCTURAL_LOCAL_EDIT_REQUEST_RE = re.compile(
    r"\b(?:image|photo|picture|texture|asset|logo|svg|illustration|replace|swap|convert|turn into|add|remove|insert|delete|layout|rearrange|reposition|restructure|scene element|track image)\b",
    re.IGNORECASE,
)
ARTIFACT_LIVE_STATE_TOKENS = (
    "prezoSetPollRenderer",
    "prezoRenderPoll",
    "prezo:poll-update",
    "prezoGetPollState",
    "__PREZO_POLL_STATE",
)
ARTIFACT_JSX_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"\breturn\s*<\s*[A-Za-z]", re.IGNORECASE),
        "script appears to contain JSX/TSX (`return <Tag ...>`).",
    ),
    (
        re.compile(r"=>\s*<\s*[A-Za-z]", re.IGNORECASE),
        "script appears to contain JSX/TSX arrow-return markup.",
    ),
    (
        re.compile(r"=\s*<\s*[A-Za-z]", re.IGNORECASE),
        "script appears to assign JSX/TSX markup directly.",
    ),
)
ARTIFACT_ESM_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"^\s*import\s+.+$", re.MULTILINE),
        "script contains an `import` statement, which is not allowed in artifact output.",
    ),
    (
        re.compile(r"^\s*export\s+.+$", re.MULTILINE),
        "script contains an `export` statement, which is not allowed in artifact output.",
    ),
)
ARTIFACT_UNSAFE_DIRECT_DOM_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"\b(?:document\.)?(?:querySelector|getElementById|getElementsByClassName|getElementsByTagName)\s*\([^)]*\)\s*\.\s*(?:innerText|textContent|innerHTML)\b"
        ),
        "script reads or writes text/html directly from a raw DOM query result without a null guard.",
    ),
    (
        re.compile(
            r"\b(?:document\.)?(?:querySelector|getElementById|getElementsByClassName|getElementsByTagName)\s*\([^)]*\)\s*\.\s*style\b"
        ),
        "script mutates style directly on a raw DOM query result without a null guard.",
    ),
    (
        re.compile(
            r"\b(?:document\.)?(?:querySelector|getElementById|getElementsByClassName|getElementsByTagName)\s*\([^)]*\)\s*\.\s*(?:appendChild|removeChild|replaceChildren|insertBefore|insertAdjacentElement|insertAdjacentHTML|setAttribute|removeAttribute)\s*\("
        ),
        "script performs a DOM container mutation directly on a raw DOM query result without a null guard.",
    ),
    (
        re.compile(
            r"\b(?:document\.)?(?:querySelector|getElementById|getElementsByClassName|getElementsByTagName)\s*\([^)]*\)\s*\.\s*classList\s*\.\s*(?:add|remove|toggle|replace)\s*\("
        ),
        "script mutates classList directly on a raw DOM query result without a null guard.",
    ),
)
ARTIFACT_FULL_SCENE_RESET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"\b(?:document\.)?(?:body|documentElement)\s*\.\s*(?:innerHTML|textContent)\s*="
        ),
        "script resets the full document/body content, which causes blank or flickering artifacts.",
    ),
    (
        re.compile(
            r"\b(?:document\.)?(?:body|documentElement)\s*\.\s*(?:replaceChildren|replaceWith|appendChild|insertAdjacentHTML|insertAdjacentElement)\s*\("
        ),
        "script replaces the full document/body structure, which is not allowed for artifact output.",
    ),
    (
        re.compile(
            r"\bdocument\s*\.\s*querySelector\s*\(\s*['\"](?:body|html)['\"]\s*\)\s*\.\s*(?:innerHTML|textContent|replaceChildren|replaceWith|appendChild|insertAdjacentHTML|insertAdjacentElement)\b"
        ),
        "script rewrites the root document structure through querySelector(body/html), which is not allowed for artifact output.",
    ),
    (
        re.compile(
            r"\b(?:root|appRoot|sceneRoot|artifactRoot|stageRoot|mountNode|rootNode|scene|stage|container)\s*\.\s*innerHTML\s*="
        ),
        "script resets the main scene/root content, which causes hard resets, flicker, or blank artifacts.",
    ),
    (
        re.compile(
            r"\b(?:root|appRoot|sceneRoot|artifactRoot|stageRoot|mountNode|rootNode|scene|stage|container)\s*\.\s*(?:replaceChildren|replaceWith)\s*\("
        ),
        "script replaces the main scene/root structure, which is not allowed for smooth artifact updates.",
    ),
    (
        re.compile(
            r"\b(?:document\.)?(?:getElementById|querySelector)\s*\(\s*['\"]#?(?:artifact-root|app|root|scene|stage|mount)['\"]\s*\)\s*\.\s*(?:innerHTML|replaceChildren|replaceWith)\b"
        ),
        "script rewrites a likely scene root node directly, which causes hard resets or flicker.",
    ),
)

POLL_GAME_SYSTEM_INSTRUCTION = "\n".join(
    [
        "You translate user intent into JSON edit actions for a poll game canvas.",
        "Output JSON only, no markdown.",
        'Response shape: { "assistantMessage": string, "actions": Action[] }',
        "Supported actions:",
        '- { "type":"update_theme", "theme": { ... } }',
        '- { "type":"set_text", "target":"question|eyebrow", "value": string, "asHtml": boolean? }',
        '- { "type":"set_option_label", "optionIndex": number, "optionId": string?, "value": string, "asHtml": boolean? }',
        '- { "type":"move_element", "target": string, "x": number?, "y": number?, "deltaX": number?, "deltaY": number? }',
        '- { "type":"resize_element", "target": string, "width": number?, "height": number?, "scaleX": number?, "scaleY": number?, "scale": number? }',
        '- { "type":"reset_positions" }',
        '- { "type":"reset_theme" }',
        "Allowed theme keys: bgA, bgB, overlayColor, panelColor, panelBorder, textMain, textSub, "
        "trackColor, fillA, fillB, raceTrackColor, bgImageOpacity, overlayOpacity, gridOpacity, "
        "panelOpacity, trackOpacity, barHeight, barRadius, questionSize, labelSize, raceCarSize, "
        "raceTrackOpacity, raceSpeed, logoWidth, logoOpacity, assetWidth, assetOpacity, bgImageUrl, "
        "gridVisible, visualMode, artifactLayout, raceCar, raceCarImageUrl, logoUrl, assetUrl, fontFamily.",
        "visualMode values: classic, race, artifact.",
        "artifactLayout values: horizontal, vertical.",
        "Allowed move targets: panel, eyebrow, question, meta, footer, options, logo, asset, bgImage, overlay, grid.",
        "Allowed resize targets: panel, eyebrow, question, meta, footer, logo, asset, bgImage, overlay, grid.",
        "Use hex colors only (#RRGGBB).",
        "If artifact mode is active, avoid applying predefined neon/pixel themes unless user explicitly asks.",
        "For prompts about vertical poll alignment in artifact mode, prefer artifactLayout='vertical'.",
        "Use context.artifact.pollTitle and context.artifact.dataEndpoints to design around live poll data.",
        "Use minimal actions required for the request.",
        "Do not invent keys, fields, or unsupported action types.",
    ]
)

POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION = "\n".join(
    [
        "You build complete interactive HTML artifacts for a live poll game canvas.",
        "Output must be raw HTML only. Do not output markdown, code fences, JSON wrappers, or explanations.",
        "The artifact runs inside a sandboxed iframe and receives live data from host messages.",
        "Runtime contract:",
        '- Host posts message: { "type":"prezo-poll-state", "payload": state }',
        "- State shape: state.poll.question, state.poll.options[], state.totalVotes, state.meta.",
        "- If available, use state.meta.expectedMaxVotes, state.meta.recommendedVisibleUnits, state.meta.recommendedVotesPerUnit, and state.meta.avoidOneToOneVoteObjects when designing scalable vote visuals.",
        "- Prefer registering your renderer with window.prezoSetPollRenderer(fn) when available. You may also define window.prezoRenderPoll(state).",
        "- Do not implement your own window message listener or websocket logic for poll updates unless the user explicitly asks.",
        "- If context.artifact.currentArtifactHtml is present, treat it as the current artifact to revise and return a full updated HTML artifact, not a diff.",
        "- If context.artifact.currentArtifactLiveHooks is present, preserve that live update wiring unless the user explicitly asks to replace it with an equivalent working implementation.",
        "- If context.artifact.requestMode == 'edit', treat the latest user request as a targeted refinement of the current artifact.",
        "- If context.artifact.requestMode == 'repair', treat context.artifact.currentArtifactHtml as the last stable working artifact, treat context.artifact.failedArtifactHtml as the broken prior attempt, and satisfy the latest edit request while avoiding context.artifact.runtimeRenderError.",
        "- In edit mode, make the smallest viable change that satisfies the latest request.",
        "- In repair mode, do not simply return the unchanged stable artifact unless the latest request is already satisfied.",
        "- In edit and repair mode, treat the current artifact as a working codebase. Patch it conservatively instead of reimagining it.",
        "- Preserve the current concept, layout, visual metaphor, typography, palette, and motion unless the user explicitly asks to change them.",
        "- Preserve detailed SVG or illustration markup, foreground art assets, decorative detail, and non-targeted motion logic unless the user explicitly asks to change them.",
        "- For local requests such as title size, spacing, readability, color, motion, or positioning, do not redesign unrelated parts of the artifact.",
        "- For local visual requests such as background, sky, time-of-day, lighting, or atmosphere changes, modify only background/backdrop/ambient layers and closely related color tokens unless the user explicitly asks to redesign foreground gameplay elements too.",
        "- In edit and repair mode, preserve existing container hierarchy, ids, classes, data attributes, and selector targets used by the current artifact unless the user explicitly asks for a structural redesign.",
        "- Do not rewrite the full document, <body>, primary scene root, or option row structure unless the user explicitly asks for a structural redesign.",
        "- Prefer CSS, copy, spacing, animation tuning, and small DOM adjustments over replacing major sections of the artifact.",
        "- Do not rename, remove, or relocate containers that current render logic depends on unless you also update that logic safely and equivalently.",
        "- Do not use document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, replaceWith, or equivalent full-scene reset operations as your live-update strategy.",
        "- Keep existing nodes mounted during live updates. Prefer updating text, classes, transforms, CSS variables, and inline styles in place whenever possible.",
        "- In edit and repair mode, preserve most of the existing HTML, CSS, and JavaScript byte-for-byte where possible. Change only the parts needed for the request.",
        "- If the user asks to reduce flicker, stop resets, or improve animation continuity, preserve the current DOM tree and animate existing option elements forward with transform/transition updates keyed by option id.",
        "- If context.artifact.recentEditRequests is present, use it to maintain continuity, but prioritize the latest request over earlier ones.",
        "- Preserve working live-data behavior, stable layout, and successful design decisions from the current artifact unless the user explicitly asks for a broader redesign.",
        "- The edited artifact must still consume host-delivered live poll state and must still call window.prezoSetPollRenderer(fn), define window.prezoRenderPoll(state), or use an equivalent runtime-approved render registration hook from the existing host contract.",
        "- The returned artifact must remain immediately usable after first render: visible poll scene, readable labels, and no empty, hidden, or near-solid full-screen overlay obscuring the content unless the user explicitly asks for that.",
        "- If you are unsure, keep more of the stable artifact and make a smaller targeted change.",
        "Update requirements:",
        "- Poll changes must animate smoothly (about 200ms-500ms easing) with no flicker.",
        "- Do not rebuild or re-mount the full scene on each update.",
        "- Never blank the stage between updates and never use hide-then-show, fade-to-black, blackout overlays, or other hard reset transitions unless the user explicitly asks for that effect.",
        "- Build around a stable scene root and persistent option nodes keyed by option id.",
        "- Reconcile by option id and update only changed elements when possible.",
        "- Do not reinsert or reorder every existing lane/row node with appendChild/removeChild on each update. If rank changes, animate vertical movement with transforms on stable mounted nodes.",
        "- If the scene contains moving objects such as cars, runners, avatars, or tokens, keep the same DOM nodes mounted and animate them forward from prior state instead of destroying and recreating them.",
        "Design guidance:",
        "- Prioritize user prompt intent over default templates.",
        "- Assume base poll chrome can be replaced by your artifact scene composition.",
        "- You have full creative freedom with HTML, CSS, and JavaScript animation.",
        "- By default, produce a polished, presentation-quality artifact scene rather than a rough experiment.",
        "- Favor balanced composition, clear alignment, and strong visual hierarchy across the full 16:9 frame.",
        "- Keep important content comfortably inside the canvas with safe padding so nothing critical is clipped.",
        "- Be expressive and creative, but avoid messy, chaotic, or gimmicky layouts unless the user explicitly asks for that.",
        "- Prioritize readability at all times: titles, poll labels, values, and motion should remain easy to understand at a glance.",
        "- Use animation with purpose: smooth, cinematic, and responsive to vote changes, but not noisy or distracting.",
        "- Avoid giant empty areas unless they clearly support the concept.",
        "- Keep decorative elements supportive of the information instead of competing with it.",
        "- When interpreting stylized prompts, preserve functional poll communication instead of sacrificing clarity for aesthetics.",
        "- During live updates, keep the overall structure stable and animate changes without flicker or full-scene resets.",
        "- Design vote visuals so they scale to larger audiences. Do not assume one visual object equals one vote unless the totals are very small.",
        "- If using discrete objects such as blocks, tokens, icons, or pieces, group them into scalable units and cap the visible count so the layout still works for 100+ votes.",
        "- Always preserve exact vote counts and percentages in text even when the main visual uses grouped or bucketed units.",
        "- Prefer proportion, grouped units, stacked segments, or bucketed representations over naive one-object-per-vote visuals.",
        "- Keep all scripts self-contained inside the generated HTML.",
        "- All inline JavaScript must be syntactically complete browser JavaScript with closed blocks, strings, templates, and script tags.",
        "- If you need the literal text </script> inside inline JavaScript, emit <\\/script> instead.",
        "- In window.prezoRenderPoll(state) or the function passed to window.prezoSetPollRenderer(fn), guard DOM queries before mutating them. If an element is temporarily missing, skip that mutation instead of throwing.",
        "- Never read from or write to .innerText, .textContent, .innerHTML, .style, or similar properties on the result of querySelector/getElementById without first checking that the element exists.",
        "- Never call appendChild, removeChild, replaceChildren, insertBefore, insertAdjacentElement, insertAdjacentHTML, setAttribute, removeAttribute, or classList mutations on a queried element unless the queried element was first stored and null-checked.",
        "- Do not output JSX, TSX, module import/export syntax, or unfinished code.",
        "- Do not require external libraries or network assets unless the user explicitly requests them.",
        "- Do not fetch poll data over HTTP yourself and do not open WebSockets for poll updates.",
        "- Build resilient rendering when options/votes change over time.",
    ]
)

POLL_GAME_ARTIFACT_ASSISTANT_SYSTEM_INSTRUCTION = "\n".join(
    [
        "You are a text assistant for the Prezo artifact editor.",
        "Answer questions about the current artifact, its behavior, its live poll data, and likely causes of issues.",
        "Use the provided context.artifact.currentArtifactHtml and context.artifact.currentArtifactLiveHooks when helpful.",
        "Do not return HTML, CSS, JavaScript, JSON, markdown fences, or code unless the user explicitly asks for code.",
        "Do not redesign or rebuild the artifact when the user is asking a question.",
        "If the user asks an explanatory question, answer directly and concisely.",
        "If the answer depends on inference from the current artifact HTML, say so briefly.",
        "If the user is implicitly asking for a change rather than an explanation, explain that it should be treated as an edit request and suggest a precise edit phrasing.",
        "Keep answers short and practical.",
    ]
)

POLL_GAME_ARTIFACT_PATCH_SYSTEM_INSTRUCTION = "\n".join(
    [
        "You generate minimal JSON patch plans for an existing live poll artifact.",
        "Output JSON only. Do not output markdown, code fences, prose, or full HTML.",
        'Response shape: { "assistantMessage": string, "edits": PatchEdit[] }',
        "Allowed PatchEdit objects:",
        '- { "type":"set_css_property", "selector": string, "property": string, "value": string }',
        '- { "type":"replace_once", "find": string, "replace": string }',
        '- { "type":"replace_all", "find": string, "replace": string }',
        '- { "type":"replace_between", "start": string, "end": string, "content": string }',
        '- { "type":"insert_before", "anchor": string, "content": string }',
        '- { "type":"insert_after", "anchor": string, "content": string }',
        '- { "type":"remove_once", "find": string }',
        "Rules:",
        "- Prefer 1-4 edits and never emit more than 8 edits.",
        "- Preserve unrelated HTML, CSS, JavaScript, SVG, ids, classes, data attributes, and live poll wiring exactly.",
        "- For local visual edits such as background, time-of-day, lighting, or atmosphere, modify only background/backdrop/ambient layers and closely related color tokens.",
        "- Do not redesign cars, avatars, icons, labels, vote chips, foreground gameplay visuals, or unrelated decorative detail unless the user explicitly asks.",
        "- Prefer set_css_property for color, lighting, spacing, and timing tweaks.",
        "- For find/anchor/start/end fields, copy exact substrings from the current artifact HTML.",
        "- Use replace_between when a small structural local change needs to swap the content inside a stable container without rewriting unrelated markup.",
        "- Do not output a full rewritten artifact in JSON fields.",
        "- Never invent, guess, or fabricate third-party asset URLs.",
        "- If the request needs a new external image, photo, texture, or logo URL and the user did not provide a direct URL, return an empty edits array and explain that a direct asset URL is required.",
        "- If patch mode is not suitable, return an empty edits array and explain that in assistantMessage.",
    ]
)

POLL_GAME_ARTIFACT_PATCH_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "assistantMessage": {"type": "string"},
        "edits": {
            "type": "array",
            "maxItems": ARTIFACT_PATCH_MAX_EDITS,
            "items": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": [
                            "set_css_property",
                            "replace_once",
                            "replace_all",
                            "replace_between",
                            "insert_before",
                            "insert_after",
                            "remove_once",
                        ],
                    },
                    "selector": {"type": "string"},
                    "property": {"type": "string"},
                    "value": {"type": "string"},
                    "find": {"type": "string"},
                    "replace": {"type": "string"},
                    "start": {"type": "string"},
                    "end": {"type": "string"},
                    "anchor": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["type"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["assistantMessage", "edits"],
    "additionalProperties": False,
}


class PollGameEditPlanRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    context: dict[str, Any] = Field(default_factory=dict)
    model: str | None = Field(default=None, max_length=120)


class PollGameEditPlanResponse(BaseModel):
    text: str
    model: str


class PollGameArtifactBuildRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    context: dict[str, Any] = Field(default_factory=dict)
    model: str | None = Field(default=None, max_length=120)


class PollGameArtifactBuildResponse(BaseModel):
    html: str
    model: str
    assistantMessage: str


class PollGameArtifactAssistantResponse(BaseModel):
    text: str
    model: str


def build_provider_timeout_detail(
    provider_name: str,
    base_url: str,
    *,
    exception_name: str,
    timeout_seconds: float,
    request_stage: str = "",
    remaining_budget_seconds: float | None = None,
) -> str:
    stage_text = f" during {request_stage}" if request_stage else ""
    detail = (
        f"Unable to reach {provider_name} API at {base_url}{stage_text}: "
        f"{exception_name} after {timeout_seconds:.0f}s."
    )
    if remaining_budget_seconds is not None:
        detail = (
            f"{detail} Call budget was {timeout_seconds:.0f}s; "
            f"server budget remaining at call start was {max(0.0, remaining_budget_seconds):.0f}s."
        )
    return detail


def build_provider_request_error_detail(
    provider_name: str,
    base_url: str,
    detail: str,
    *,
    request_stage: str = "",
) -> str:
    stage_text = f" during {request_stage}" if request_stage else ""
    return f"Unable to reach {provider_name} API at {base_url}{stage_text}: {detail}"


async def request_anthropic_text(
    *,
    api_key: str,
    model: str,
    system_instruction: str,
    prompt_text: str,
    temperature: float,
    max_tokens: int,
    timeout_seconds: float,
    request_stage: str = "",
    remaining_budget_seconds: float | None = None,
) -> tuple[str, str]:
    base_url = resolve_anthropic_base_url()
    endpoint = f"{base_url}/messages"
    body = {
        "model": normalize_anthropic_model_name(model)
        or DEFAULT_ANTHROPIC_ARTIFACT_BUILD_MODEL,
        "system": system_instruction,
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": prompt_text}],
            }
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_seconds, connect=10.0)
        ) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": ANTHROPIC_VERSION,
                },
                json=body,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=build_provider_timeout_detail(
                "Anthropic",
                base_url,
                exception_name=exc.__class__.__name__,
                timeout_seconds=timeout_seconds,
                request_stage=request_stage,
                remaining_budget_seconds=remaining_budget_seconds,
            ),
        ) from exc
    except httpx.RequestError as exc:
        detail = str(exc).strip() or exc.__class__.__name__
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=build_provider_request_error_detail(
                "Anthropic",
                base_url,
                detail,
                request_stage=request_stage,
            ),
        ) from exc

    raw_payload: Any = {}
    if response.content:
        try:
            raw_payload = response.json()
        except ValueError:
            raw_payload = {}
    if response.status_code >= 400:
        detail = extract_anthropic_error(raw_payload) or (
            f"Anthropic request failed ({response.status_code})"
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    text = extract_anthropic_text(raw_payload)
    stop_reason = extract_anthropic_stop_reason(raw_payload)
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Anthropic response did not include text content.",
        )
    return text, stop_reason


async def request_gemini_text(
    *,
    api_key: str,
    model: str,
    system_instruction: str,
    prompt_text: str,
    temperature: float,
    max_tokens: int,
    timeout_seconds: float,
    request_stage: str = "",
    remaining_budget_seconds: float | None = None,
    response_mime_type: str | None = None,
    response_json_schema: dict[str, Any] | None = None,
    thinking_budget: int | None = None,
) -> tuple[str, str]:
    base_url = resolve_gemini_base_url()
    endpoint = build_gemini_generate_content_endpoint(base_url, model)
    body = {
        "systemInstruction": {
            "parts": [
                {
                    "text": system_instruction,
                }
            ]
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": prompt_text,
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "candidateCount": 1,
        },
    }
    generation_config = body["generationConfig"]
    if response_mime_type:
        generation_config["responseMimeType"] = response_mime_type
    if response_json_schema:
        generation_config["responseJsonSchema"] = response_json_schema
    if thinking_budget is not None:
        generation_config["thinkingConfig"] = {"thinkingBudget": thinking_budget}

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_seconds, connect=10.0)
        ) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key,
                },
                json=body,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=build_provider_timeout_detail(
                "Gemini",
                base_url,
                exception_name=exc.__class__.__name__,
                timeout_seconds=timeout_seconds,
                request_stage=request_stage,
                remaining_budget_seconds=remaining_budget_seconds,
            ),
        ) from exc
    except httpx.RequestError as exc:
        detail = str(exc).strip() or exc.__class__.__name__
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=build_provider_request_error_detail(
                "Gemini",
                base_url,
                detail,
                request_stage=request_stage,
            ),
        ) from exc

    raw_payload: Any = {}
    if response.content:
        try:
            raw_payload = response.json()
        except ValueError:
            raw_payload = {}
    if response.status_code >= 400:
        detail = extract_gemini_error(raw_payload) or f"Gemini request failed ({response.status_code})"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    text = extract_gemini_text(raw_payload)
    stop_reason = extract_gemini_stop_reason(raw_payload)
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini response did not include text content.",
        )
    return text, stop_reason


@router.post("/poll-game-edit-plan", response_model=PollGameEditPlanResponse)
async def create_poll_game_edit_plan(
    payload: PollGameEditPlanRequest,
) -> PollGameEditPlanResponse:
    api_key = (settings.gemini_api_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI editor is not configured. Set GEMINI_API_KEY on backend.",
        )

    model = resolve_gemini_plan_model()
    text, _stop_reason = await request_gemini_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_SYSTEM_INSTRUCTION,
        prompt_text=json.dumps(
            {"prompt": payload.prompt, "context": payload.context},
            indent=2,
        ),
        temperature=0.2,
        max_tokens=1400,
        timeout_seconds=settings.gemini_plan_timeout_seconds,
        request_stage="poll game edit plan",
    )
    normalized_plan = normalize_poll_game_plan(text)

    return PollGameEditPlanResponse(
        text=json.dumps(normalized_plan, ensure_ascii=False),
        model=model,
    )


@router.post("/poll-game-artifact-build", response_model=PollGameArtifactBuildResponse)
async def create_poll_game_artifact_build(
    payload: PollGameArtifactBuildRequest,
) -> PollGameArtifactBuildResponse:
    artifact_context = (
        payload.context.get("artifact")
        if isinstance(payload.context.get("artifact"), dict)
        else {}
    )
    request_mode = str(artifact_context.get("requestMode") or "").strip().lower()
    is_initial_build = request_mode not in {"edit", "repair"}
    original_edit_request = extract_artifact_original_edit_request(
        artifact_context,
        payload.prompt,
    )
    model_context = prepare_artifact_context_for_model(payload.context, request_mode)
    deadline = time.monotonic() + max(
        settings.gemini_artifact_total_timeout_seconds,
        ARTIFACT_MIN_INITIAL_CALL_TIMEOUT_SECONDS,
    )
    patch_only_edit = should_require_safe_patch_only_edit(
        request_mode,
        artifact_context,
        original_edit_request,
    )
    patch_failure_reasons: list[str] = []
    if should_attempt_artifact_patch_edit(
        request_mode,
        artifact_context,
        original_edit_request,
    ):
        patch_api_key = (settings.gemini_api_key or "").strip()
        if patch_api_key:
            patch_model = resolve_gemini_artifact_edit_model()
            current_html = get_artifact_patch_source_html(artifact_context)
            try:
                remaining_budget_seconds = max(0.0, deadline - time.monotonic())
                patch_timeout_seconds = min(
                    ARTIFACT_PATCH_TIMEOUT_SECONDS,
                    ensure_artifact_time_budget_remaining(
                        deadline,
                        "starting artifact patch edit",
                        minimum_seconds=ARTIFACT_PATCH_MIN_CALL_TIMEOUT_SECONDS,
                        reserve_seconds=ARTIFACT_PATCH_FALLBACK_RESERVE_SECONDS,
                    ),
                )
                patch_html, patch_assistant_message, patch_issues = await attempt_artifact_patch_edit(
                    api_key=patch_api_key,
                    model=patch_model,
                    original_edit_request=original_edit_request,
                    context=payload.context,
                    current_html=current_html,
                    timeout_seconds=patch_timeout_seconds,
                    remaining_budget_seconds=remaining_budget_seconds,
                )
                if patch_html:
                    patch_html = restore_artifact_live_hooks_if_missing(
                        patch_html, payload.context
                    )
                    patch_validation_issues = validate_poll_game_artifact_html(patch_html)
                    if not patch_validation_issues:
                        return PollGameArtifactBuildResponse(
                            html=patch_html,
                            model=patch_model,
                            assistantMessage=patch_assistant_message
                            or "Artifact updated with a targeted patch.",
                        )
                    patch_failure_reasons.extend(patch_validation_issues)
                patch_failure_reasons.extend(patch_issues)
            except HTTPException:
                if patch_only_edit:
                    raise
                patch_failure_reasons.append("the patch edit request failed before a safe patch could be applied")

    if patch_only_edit:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=build_safe_patch_only_edit_failure_detail(
                original_edit_request=original_edit_request,
                artifact_context=artifact_context,
                patch_failure_reasons=patch_failure_reasons,
            ),
        )

    if is_initial_build:
        build_api_key = (settings.anthropic_api_key or "").strip()
        if not build_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Artifact build is not configured. Set ANTHROPIC_API_KEY on backend.",
        )
        model = (
            normalize_anthropic_model_name(settings.anthropic_artifact_build_model)
            or DEFAULT_ANTHROPIC_ARTIFACT_BUILD_MODEL
        )
        temperature = 0.8
        remaining_budget_seconds = max(0.0, deadline - time.monotonic())
        timeout_seconds = min(
            settings.anthropic_artifact_build_timeout_seconds,
            ensure_artifact_time_budget_remaining(
                deadline,
                "starting artifact generation",
                minimum_seconds=ARTIFACT_MIN_INITIAL_CALL_TIMEOUT_SECONDS,
                reserve_seconds=resolve_artifact_followup_reserve_seconds(request_mode),
            ),
        )
        request_text, stop_reason = await request_anthropic_text(
            api_key=build_api_key,
            model=model,
            system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
            prompt_text=json.dumps(
                {"prompt": payload.prompt, "context": model_context},
                indent=2,
            ),
            temperature=temperature,
            max_tokens=GEMINI_ARTIFACT_MAX_TOKENS,
            timeout_seconds=timeout_seconds,
            request_stage="artifact initial build",
            remaining_budget_seconds=remaining_budget_seconds,
        )
    else:
        build_api_key = (settings.gemini_api_key or "").strip()
        if not build_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI editor is not configured. Set GEMINI_API_KEY on backend.",
            )
        model = resolve_gemini_artifact_edit_model()
        if request_mode == "repair":
            temperature = 0.2
            request_stage = "artifact repair generation"
            model = resolve_gemini_artifact_repair_model()
            configured_timeout_seconds = settings.gemini_artifact_repair_timeout_seconds
        else:
            temperature = 0.2
            request_stage = "artifact edit generation"
            configured_timeout_seconds = settings.gemini_artifact_edit_timeout_seconds
        remaining_budget_seconds = max(0.0, deadline - time.monotonic())
        timeout_seconds = min(
            configured_timeout_seconds,
            ensure_artifact_time_budget_remaining(
                deadline,
                "starting artifact generation",
                minimum_seconds=ARTIFACT_MIN_INITIAL_CALL_TIMEOUT_SECONDS,
                reserve_seconds=resolve_artifact_followup_reserve_seconds(request_mode),
            ),
        )
        request_text, stop_reason = await request_gemini_text(
            api_key=build_api_key,
            model=model,
            system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
            prompt_text=json.dumps(
                {"prompt": payload.prompt, "context": model_context},
                indent=2,
            ),
            temperature=temperature,
            max_tokens=GEMINI_ARTIFACT_MAX_TOKENS,
            timeout_seconds=timeout_seconds,
            request_stage=request_stage,
            remaining_budget_seconds=remaining_budget_seconds,
        )

    html = normalize_poll_game_artifact_html(request_text)
    html = restore_artifact_live_hooks_if_missing(html, payload.context)
    if not html:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{'Anthropic' if is_initial_build else 'Gemini'} response did not include artifact HTML.",
        )
    validation_issues = validate_poll_game_artifact_html(html)
    if stop_reason in {"max_tokens", "model_context_window_exceeded"}:
        validation_issues.insert(
            0,
            "artifact output appears truncated before completion.",
        )
    max_repair_attempts = resolve_artifact_max_repair_attempts(request_mode)
    repair_attempts = 0
    response_model = model
    while validation_issues and repair_attempts < max_repair_attempts:
        repair_api_key = (settings.gemini_api_key or "").strip()
        if not repair_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Artifact repair is not configured. Set GEMINI_API_KEY on backend.",
            )
        repair_model = resolve_gemini_artifact_repair_model()
        remaining_budget_seconds = max(0.0, deadline - time.monotonic())
        repair_timeout_seconds = min(
            settings.gemini_artifact_repair_timeout_seconds,
            ensure_artifact_time_budget_remaining(
                deadline,
                "repairing artifact output",
                minimum_seconds=ARTIFACT_MIN_FOLLOWUP_CALL_TIMEOUT_SECONDS,
            ),
        )
        repaired_html = await attempt_artifact_repair(
            api_key=repair_api_key,
            model=repair_model,
            original_prompt=original_edit_request or payload.prompt,
            context=model_context,
            html=html,
            validation_issues=validation_issues,
            timeout_seconds=repair_timeout_seconds,
            remaining_budget_seconds=remaining_budget_seconds,
        )
        if not repaired_html:
            break
        next_html = restore_artifact_live_hooks_if_missing(repaired_html, payload.context)
        if next_html.strip() == html.strip():
            break
        html = next_html
        validation_issues = validate_poll_game_artifact_html(html)
        repair_attempts += 1
        response_model = repair_model
    if should_attempt_stable_artifact_recovery(
        request_mode, validation_issues, payload.context
    ):
        repair_api_key = (settings.gemini_api_key or "").strip()
        if not repair_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Artifact repair is not configured. Set GEMINI_API_KEY on backend.",
            )
        repair_model = resolve_gemini_artifact_repair_model()
        recovery_context = build_stable_artifact_recovery_context(
            payload.context,
            failed_html=html,
            validation_issues=validation_issues,
        )
        prepared_recovery_context = prepare_artifact_context_for_model(
            recovery_context, "repair"
        )
        remaining_budget_seconds = max(0.0, deadline - time.monotonic())
        recovery_timeout_seconds = min(
            90.0,
            ensure_artifact_time_budget_remaining(
                deadline,
                "recovering artifact output from the last stable artifact",
                minimum_seconds=ARTIFACT_MIN_FOLLOWUP_CALL_TIMEOUT_SECONDS,
            ),
        )
        recovered_html, recovered_stop_reason = await attempt_artifact_stable_recovery(
            api_key=repair_api_key,
            model=repair_model,
            original_prompt=original_edit_request or payload.prompt,
            context=prepared_recovery_context,
            validation_issues=validation_issues,
            timeout_seconds=recovery_timeout_seconds,
            remaining_budget_seconds=remaining_budget_seconds,
        )
        if recovered_html:
            html = restore_artifact_live_hooks_if_missing(recovered_html, payload.context)
            validation_issues = validate_poll_game_artifact_html(html)
            response_model = repair_model
            if recovered_stop_reason in {"max_tokens", "model_context_window_exceeded"}:
                validation_issues.insert(
                    0,
                    "artifact output appears truncated before completion.",
                )
    if validation_issues:
        issue_text = "; ".join(validation_issues[:4])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Artifact request failed validation: {issue_text}",
        )

    return PollGameArtifactBuildResponse(
        html=html,
        model=response_model,
        assistantMessage="Artifact ready. Keep prompting to iterate.",
    )


@router.post("/poll-game-artifact-answer", response_model=PollGameArtifactAssistantResponse)
async def create_poll_game_artifact_answer(
    payload: PollGameArtifactBuildRequest,
) -> PollGameArtifactAssistantResponse:
    api_key = (settings.gemini_api_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI editor is not configured. Set GEMINI_API_KEY on backend.",
        )

    model = resolve_gemini_artifact_answer_model()
    text, _stop_reason = await request_gemini_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_ASSISTANT_SYSTEM_INSTRUCTION,
        prompt_text=json.dumps(
            {"prompt": payload.prompt, "context": payload.context},
            indent=2,
        ),
        temperature=0.25,
        max_tokens=900,
        timeout_seconds=settings.gemini_artifact_answer_timeout_seconds,
        request_stage="artifact question answer",
    )

    answer = (text or "").strip()
    if not answer:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Artifact assistant returned an empty answer.",
        )

    return PollGameArtifactAssistantResponse(text=answer, model=model)


async def attempt_artifact_patch_edit(
    *,
    api_key: str,
    model: str,
    original_edit_request: str,
    context: dict[str, Any],
    current_html: str,
    timeout_seconds: float,
    remaining_budget_seconds: float | None = None,
) -> tuple[str, str, list[str]]:
    if artifact_edit_request_requires_external_asset_url(original_edit_request):
        return (
            "",
            "This edit needs a direct image URL. Provide the exact Dubai image URL and the editor can swap only the background image without redesigning the scene.",
            ["the requested edit needs a direct external image URL."],
        )
    patch_prompt = build_artifact_patch_edit_prompt(
        original_edit_request=original_edit_request,
        context=context,
        current_html=current_html,
    )
    text, _stop_reason = await request_gemini_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_PATCH_SYSTEM_INSTRUCTION,
        prompt_text=patch_prompt,
        temperature=0.1,
        max_tokens=GEMINI_ARTIFACT_PATCH_MAX_TOKENS,
        timeout_seconds=timeout_seconds,
        request_stage="artifact patch edit",
        remaining_budget_seconds=remaining_budget_seconds,
        response_mime_type="application/json",
        response_json_schema=POLL_GAME_ARTIFACT_PATCH_JSON_SCHEMA,
        thinking_budget=0,
    )
    plan = rewrite_artifact_patch_plan_for_current_html(
        plan=normalize_artifact_patch_plan(text),
        current_html=current_html,
        original_edit_request=original_edit_request,
    )
    patched_html, issues = apply_artifact_patch_plan(current_html, plan)
    if issues:
        return "", plan.get("assistantMessage", ""), issues
    return patched_html, plan.get("assistantMessage", ""), []


async def attempt_artifact_repair(
    *,
    api_key: str,
    model: str,
    original_prompt: str,
    context: dict[str, Any],
    html: str,
    validation_issues: list[str],
    timeout_seconds: float,
    remaining_budget_seconds: float | None = None,
) -> str:
    if not validation_issues or ARTIFACT_MAX_REPAIR_ATTEMPTS <= 0:
        return ""
    repair_prompt = build_artifact_repair_prompt(
        original_prompt=original_prompt,
        context=context,
        html=html,
        validation_issues=validation_issues,
    )
    text, _stop_reason = await request_gemini_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
        prompt_text=repair_prompt,
        temperature=0.25,
        max_tokens=GEMINI_ARTIFACT_REPAIR_MAX_TOKENS,
        timeout_seconds=timeout_seconds,
        request_stage="artifact validation repair",
        remaining_budget_seconds=remaining_budget_seconds,
    )
    repaired = normalize_poll_game_artifact_html(text)
    return repaired.strip()


async def attempt_artifact_stable_recovery(
    *,
    api_key: str,
    model: str,
    original_prompt: str,
    context: dict[str, Any],
    validation_issues: list[str],
    timeout_seconds: float,
    remaining_budget_seconds: float | None = None,
) -> tuple[str, str]:
    recovery_prompt = build_artifact_stable_recovery_prompt(
        original_prompt=original_prompt,
        context=context,
        validation_issues=validation_issues,
    )
    text, stop_reason = await request_gemini_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
        prompt_text=json.dumps(
            {"prompt": recovery_prompt, "context": context},
            indent=2,
        ),
        temperature=0.15,
        max_tokens=GEMINI_ARTIFACT_RECOVERY_MAX_TOKENS,
        timeout_seconds=timeout_seconds,
        request_stage="artifact stable recovery",
        remaining_budget_seconds=remaining_budget_seconds,
    )
    recovered = normalize_poll_game_artifact_html(text)
    return recovered.strip(), stop_reason


def build_artifact_repair_prompt(
    *,
    original_prompt: str,
    context: dict[str, Any],
    html: str,
    validation_issues: list[str],
) -> str:
    has_truncation_issue = any(
        "truncated" in issue.lower() or "unbalanced <script>" in issue.lower()
        for issue in validation_issues
    )
    is_background_edit = bool(
        re.search(
            r"\b(?:background|backdrop|sky|sunrise|sunset|daytime|nighttime|lighting|ambient|weather|day\b|night\b)\b",
            original_prompt,
            re.IGNORECASE,
        )
    )
    issue_text = "; ".join(issue.strip() for issue in validation_issues[:6] if issue.strip())
    return "\n".join(
        [
            "Artifact repair task",
            "You are repairing a broken HTML poll artifact that failed validation.",
            "Your job is to return one complete replacement artifact that is valid, usable, and still satisfies the original request.",
            "",
            "Repair objective",
            f"- Original prompt: {original_prompt}",
            f"- Validation issues: {issue_text}",
            "- Preserve the intended concept, layout, and live poll behavior unless one of them is the direct cause of the failure.",
            "- Prioritize correctness and usability over decorative complexity. A simpler working artifact is better than a flashy broken one.",
            "",
            "Required output contract",
            "- Return raw HTML only.",
            "- Return exactly one complete HTML document.",
            "- Do not return markdown fences, JSON, prose, comments outside HTML, or explanation.",
            "- Close every tag, especially every <script> tag.",
            "- Inline JavaScript must be syntactically complete with closed blocks, parentheses, strings, template literals, and object literals.",
            "- Preserve or restore the live poll contract: window.prezoSetPollRenderer(fn), window.prezoRenderPoll(state), or equivalent approved host wiring.",
            "- The artifact must render visible usable content on first load.",
            "",
            "Repair strategy",
            "- If a script block is malformed, truncated, or hard to salvage, rewrite the entire affected script block cleanly instead of trying to patch a fragment.",
            "- Keep the existing scene root and stable mounted nodes whenever possible.",
            "- Update text, classes, transforms, styles, and child nodes conservatively instead of rebuilding the whole scene.",
            "- Preserve unrelated foreground gameplay visuals, SVG art, decorative detail, labels, and motion logic unless the original request explicitly asks to change them.",
            (
                "- This request is about background, time-of-day, lighting, or atmosphere. Modify only background/backdrop/sky/ambient layers and closely related color tokens unless the request explicitly asks to change foreground gameplay visuals too."
                if is_background_edit
                else ""
            ),
            "- If a previous change introduced complexity that is causing breakage, simplify that section while preserving the main visual idea.",
            (
                "- The failed output appears truncated. Re-emit a complete artifact with all closing tags, all </script> tags, and fully complete JavaScript."
                if has_truncation_issue
                else ""
            ),
            "",
            "Pitfalls to avoid",
            "- Do not drop the live poll renderer registration.",
            "- Do not output partial HTML.",
            "- Do not leave unfinished object literals, arrays, function bodies, or conditionals.",
            "- Do not emit the literal text </script> inside inline JavaScript. Use <\\/script> instead if needed.",
            "- Do not rewrite the full document/body/root structure with document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, replaceWith, or equivalent hard resets.",
            "- Do not return a blank stage, near-solid black screen, or hidden content.",
            "",
            "Context JSON:",
            json.dumps(context, indent=2),
            "",
            "Broken artifact HTML to repair:",
            html,
        ]
    )


def build_artifact_stable_recovery_prompt(
    *,
    original_prompt: str,
    context: dict[str, Any],
    validation_issues: list[str],
) -> str:
    is_background_edit = bool(
        re.search(
            r"\b(?:background|backdrop|sky|sunrise|sunset|daytime|nighttime|lighting|ambient|weather|day\b|night\b)\b",
            original_prompt,
            re.IGNORECASE,
        )
    )
    issue_text = "; ".join(issue.strip() for issue in validation_issues[:6] if issue.strip())
    return "\n".join(
        [
            "Artifact stable recovery task",
            "The previous edited artifact output is invalid and must be discarded.",
            "Reapply the requested change against the last stable current artifact from context.artifact.currentArtifactHtml.",
            "Return one complete replacement artifact that is valid, usable, and still satisfies the original request.",
            "",
            "Recovery objective",
            f"- Original prompt: {original_prompt}",
            f"- Validation issues to avoid: {issue_text}",
            "- Use the stable current artifact as the baseline.",
            "- Do not preserve malformed code, truncated code, or unfinished script bodies from the failed output.",
            "- Prioritize a safe working result over ambitious redesign.",
            "",
            "Required output contract",
            "- Return raw HTML only.",
            "- Return exactly one complete HTML document.",
            "- Preserve the live poll contract and renderer registration.",
            "- Ensure every <script> tag is closed and every JavaScript block, object, array, string, template literal, and expression is complete.",
            "- The artifact must render visible usable content on first load.",
            "",
            "Recovery strategy",
            "- Reapply the requested change conservatively to the stable artifact.",
            "- Keep the existing scene root, option nodes, and mounted structure whenever possible.",
            "- Preserve unrelated foreground gameplay visuals, SVG art, decorative detail, labels, and motion logic unless the original request explicitly asks to change them.",
            (
                "- This request is about background, time-of-day, lighting, or atmosphere. Modify only background/backdrop/sky/ambient layers and closely related color tokens unless the request explicitly asks to change foreground gameplay visuals too."
                if is_background_edit
                else ""
            ),
            "- If the requested change caused instability, implement the smallest robust version of that change instead of repeating the failed approach.",
            "- If a broken script cannot be trusted, replace the entire affected script block with a clean complete version.",
            "",
            "Pitfalls to avoid",
            "- Do not output markdown fences, JSON, or explanation.",
            "- Do not preserve malformed script bodies, unfinished JavaScript expressions, or unbalanced <script> tags from the failed output.",
            "- Do not emit the literal text </script> inside inline JavaScript. Use <\\/script> instead if needed.",
            "- Do not rewrite the full document/body/root structure or use hard reset strategies such as document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, or replaceWith.",
            "- Do not return a blank stage, near-solid black screen, or hidden content.",
            "",
            "Prepared context JSON:",
            json.dumps(context, indent=2),
        ]
    )


def extract_gemini_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return ""
    chunks: list[str] = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content")
        if not isinstance(content, dict):
            continue
        parts = content.get("parts")
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                chunks.append(text.strip())
        if chunks:
            break
    return "\n".join(chunks).strip()


def extract_gemini_error(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if isinstance(error, dict):
        for key in ("message", "status"):
            value = error.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    prompt_feedback = payload.get("promptFeedback")
    if isinstance(prompt_feedback, dict):
        block_reason = prompt_feedback.get("blockReason")
        if isinstance(block_reason, str) and block_reason.strip():
            return block_reason.strip()
    return ""


def extract_gemini_stop_reason(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return ""
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        value = candidate.get("finishReason") or candidate.get("finish_reason")
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
    return ""


def extract_anthropic_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    content = payload.get("content")
    if not isinstance(content, list):
        return ""
    chunks: list[str] = []
    for part in content:
        if not isinstance(part, dict):
            continue
        if part.get("type") != "text":
            continue
        text = part.get("text")
        if isinstance(text, str) and text.strip():
            chunks.append(text.strip())
    return "\n".join(chunks).strip()


def extract_anthropic_error(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if not isinstance(error, dict):
        return ""
    for key in ("message", "type"):
        value = error.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def extract_anthropic_stop_reason(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    value = payload.get("stop_reason")
    return value.strip().lower() if isinstance(value, str) and value.strip() else ""


def normalize_anthropic_model_name(value: str | None) -> str:
    return (value or "").strip()


def resolve_anthropic_base_url() -> str:
    base_url = (settings.anthropic_base_url or "").strip() or ANTHROPIC_API_BASE
    return base_url.rstrip("/")


def normalize_gemini_model_name(value: str | None) -> str:
    text = (value or "").strip()
    if text.startswith("models/"):
        return text[len("models/") :].strip()
    return text


def resolve_gemini_base_url() -> str:
    base_url = (settings.gemini_base_url or "").strip() or GEMINI_API_BASE
    return base_url.rstrip("/")


def resolve_gemini_plan_model() -> str:
    return (
        normalize_gemini_model_name(settings.gemini_plan_model)
        or normalize_gemini_model_name(settings.gemini_model)
        or DEFAULT_GEMINI_PLAN_MODEL
    )


def resolve_gemini_artifact_edit_model() -> str:
    return (
        normalize_gemini_model_name(settings.gemini_artifact_edit_model)
        or normalize_gemini_model_name(settings.gemini_model)
        or DEFAULT_GEMINI_ARTIFACT_EDIT_MODEL
    )


def resolve_gemini_artifact_repair_model() -> str:
    return (
        normalize_gemini_model_name(settings.gemini_artifact_repair_model)
        or normalize_gemini_model_name(settings.gemini_artifact_edit_model)
        or normalize_gemini_model_name(settings.gemini_model)
        or DEFAULT_GEMINI_ARTIFACT_REPAIR_MODEL
    )


def resolve_gemini_artifact_answer_model() -> str:
    return (
        normalize_gemini_model_name(settings.gemini_artifact_answer_model)
        or normalize_gemini_model_name(settings.gemini_model)
        or DEFAULT_GEMINI_ARTIFACT_ANSWER_MODEL
    )


def build_gemini_generate_content_endpoint(base_url: str, model: str) -> str:
    normalized_model = normalize_gemini_model_name(model) or DEFAULT_GEMINI_MODEL
    return f"{base_url}/models/{normalized_model}:generateContent"


def extract_artifact_original_edit_request(
    artifact_context: dict[str, Any], fallback_prompt: str = ""
) -> str:
    value = artifact_context.get("originalEditRequest")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return (fallback_prompt or "").strip()


def is_broad_artifact_edit_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    return bool(ARTIFACT_BROAD_EDIT_REQUEST_RE.search(normalized))


def is_patch_only_artifact_edit_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    if is_background_image_asset_edit_request(normalized):
        return True
    if ARTIFACT_STRUCTURAL_LOCAL_EDIT_REQUEST_RE.search(normalized):
        return False
    return bool(ARTIFACT_PATCH_ONLY_EDIT_REQUEST_RE.search(normalized))


def classify_artifact_edit_request_scope(request_text: str) -> str:
    normalized = (request_text or "").strip()
    if not normalized:
        return "unknown"
    if is_broad_artifact_edit_request(normalized):
        return "broad"
    if is_patch_only_artifact_edit_request(normalized):
        return "patch_only"
    return "structural_local"


def get_artifact_patch_source_html(artifact_context: dict[str, Any]) -> str:
    for key in ("currentArtifactFullHtml", "currentArtifactHtml"):
        value = artifact_context.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def should_require_safe_patch_only_edit(
    request_mode: str, artifact_context: dict[str, Any], original_edit_request: str
) -> bool:
    if request_mode not in {"edit", "repair"}:
        return False
    if classify_artifact_edit_request_scope(original_edit_request) != "patch_only":
        return False
    return bool(get_artifact_patch_source_html(artifact_context))


def should_attempt_artifact_patch_edit(
    request_mode: str, artifact_context: dict[str, Any], original_edit_request: str
) -> bool:
    if request_mode not in {"edit", "repair"}:
        return False
    current_html = get_artifact_patch_source_html(artifact_context)
    if not current_html:
        return False
    normalized_html = current_html.strip()
    if len(normalized_html) > ARTIFACT_PATCH_HTML_CHAR_LIMIT:
        return False
    if "<!-- artifact-context-cut -->" in normalized_html:
        return False
    if not (original_edit_request or "").strip():
        return False
    if classify_artifact_edit_request_scope(original_edit_request) == "broad":
        return False
    return True


def build_safe_patch_only_edit_failure_detail(
    *,
    original_edit_request: str,
    artifact_context: dict[str, Any],
    patch_failure_reasons: list[str] | None = None,
) -> str:
    reasons = [reason.strip() for reason in (patch_failure_reasons or []) if reason and reason.strip()]
    current_html = get_artifact_patch_source_html(artifact_context)
    if not current_html:
        reasons.append("the current artifact html is unavailable")
    elif "<!-- artifact-context-cut -->" in current_html:
        reasons.append("the available artifact html is truncated")
    elif len(current_html) > ARTIFACT_PATCH_HTML_CHAR_LIMIT:
        reasons.append("the artifact is too large for safe targeted patching")

    suffix = ""
    if reasons:
        deduped: list[str] = []
        seen: set[str] = set()
        for reason in reasons:
            if reason in seen:
                continue
            seen.add(reason)
            deduped.append(reason)
        suffix = f" Reason: {'; '.join(deduped[:3])}."

    request_text = (original_edit_request or "").strip() or "the requested update"
    if artifact_edit_request_requires_external_asset_url(request_text):
        return (
            f"Targeted artifact update was blocked because `{request_text}` needs a direct image URL, "
            "and the editor will not invent or guess external asset URLs. "
            "Provide the exact image URL and ask to replace only the background image while keeping the cars and layout unchanged."
        )
    return (
        "Targeted artifact update was blocked because it could not be applied safely with patch mode, "
        "and full-document regeneration is disabled for local edits and repairs to avoid breaking the artifact. "
        f"Requested update: {request_text}.{suffix} "
        "Try a simpler targeted request, regenerate the artifact, or explicitly ask for a broader redesign."
    )


def build_artifact_patch_edit_prompt(
    *,
    original_edit_request: str,
    context: dict[str, Any],
    current_html: str,
) -> str:
    artifact_context = (
        context.get("artifact") if isinstance(context.get("artifact"), dict) else {}
    )
    artifact_type = (
        artifact_context.get("artifactType")
        if isinstance(artifact_context.get("artifactType"), str)
        else ""
    )
    design_guidelines = (
        artifact_context.get("designGuidelines")
        if isinstance(artifact_context.get("designGuidelines"), str)
        else ""
    )
    poll_title = (
        artifact_context.get("pollTitle")
        if isinstance(artifact_context.get("pollTitle"), str)
        else ""
    )
    is_background_edit = is_background_visual_edit_request(original_edit_request)
    is_city_background_edit = is_city_background_edit_request(original_edit_request)
    requires_external_asset_url = artifact_edit_request_requires_external_asset_url(
        original_edit_request
    )
    background_selector_candidates = extract_artifact_background_selector_candidates(
        current_html
    )
    background_style_snippets = extract_artifact_background_style_snippets(current_html)
    return "\n".join(
        [
            "Artifact patch edit task",
            "Apply the user request with minimal edits to the current artifact.",
            "Do not redesign the scene. Preserve unrelated markup exactly.",
            f"Original user edit request: {original_edit_request}",
            f"Current artifact type: {artifact_type}" if artifact_type else "",
            f"Current design guidelines: {design_guidelines}" if design_guidelines else "",
            f"Live poll title: {poll_title}" if poll_title else "",
            (
                "This is a background/time-of-day/lighting request. Modify only background, sky, ambient, backdrop, and closely related color/lighting styles. Do not change cars, foreground gameplay visuals, labels, icons, or decorative detail."
                if is_background_edit
                else ""
            ),
            (
                "This is a city/urban background request without a direct image URL. Keep it CSS-only: use the existing background layer to suggest a cityscape, skyline, urban lighting, haze, or architecture silhouette. Do not swap in a random photo, do not use a blank white fill, and do not touch the cars."
                if is_city_background_edit and not requires_external_asset_url
                else ""
            ),
            (
                "This request appears to need a new external image or asset URL. If the user did not provide a direct URL, do not guess one. Return an empty edits array and explain that a direct image URL is required."
                if requires_external_asset_url
                else ""
            ),
            (
                "Available exact background selectors in the current artifact: "
                + ", ".join(background_selector_candidates)
                if background_selector_candidates
                else ""
            ),
            (
                "For background edits, if you use set_css_property, the selector must match one of the available exact background selectors above. Do not invent selectors."
                if background_selector_candidates
                else ""
            ),
            (
                "Relevant current background CSS snippets:\n"
                + "\n\n".join(background_style_snippets)
                if background_style_snippets
                else ""
            ),
            "Use the fewest edits possible.",
            "Prefer set_css_property for local visual changes.",
            "If you need replace_once/replace_all/replace_between/insert_before/insert_after/remove_once, use exact substrings copied from the current artifact HTML.",
            "Use replace_between when the request needs a small structural local change inside an existing stable container or style block.",
            "If a background edit cannot be expressed with an existing exact selector, use replace_between or replace_once on an exact current CSS snippet instead of inventing a selector.",
            "Do not rename or remove live poll hooks, ids, classes, or data attributes relied on by the existing artifact.",
            "If patch mode is not suitable for this request, return an empty edits array.",
            "Current artifact HTML:",
            current_html,
        ]
    )


def normalize_artifact_patch_plan(raw_text: str) -> dict[str, Any]:
    parsed = try_parse_json(raw_text)
    if parsed is None:
        fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_text, re.IGNORECASE)
        if fenced and fenced.group(1):
            parsed = try_parse_json(fenced.group(1))
    if parsed is None:
        object_slice = extract_first_json_object(raw_text)
        if object_slice:
            parsed = try_parse_json(object_slice)
    if not isinstance(parsed, dict):
        return {"assistantMessage": "", "edits": []}
    assistant_message = (
        parsed.get("assistantMessage")
        if isinstance(parsed.get("assistantMessage"), str)
        else parsed.get("message")
        if isinstance(parsed.get("message"), str)
        else ""
    )
    edits_raw = parsed.get("edits")
    if not isinstance(edits_raw, list):
        edits_raw = []
    edits = [item for item in edits_raw if isinstance(item, dict)]
    return {"assistantMessage": assistant_message.strip(), "edits": edits}


def apply_artifact_patch_plan(html: str, plan: dict[str, Any]) -> tuple[str, list[str]]:
    original = (html or "").strip()
    if not original:
        return original, ["patch target html is empty."]
    edits = plan.get("edits") if isinstance(plan.get("edits"), list) else []
    if not edits:
        return original, ["patch plan did not include any edits."]
    if len(edits) > ARTIFACT_PATCH_MAX_EDITS:
        return original, [f"patch plan included too many edits ({len(edits)})."]

    working = original
    issues: list[str] = []
    for index, edit in enumerate(edits):
        edit_type = (
            edit.get("type").strip().lower()
            if isinstance(edit.get("type"), str)
            else ""
        )
        if edit_type == "set_css_property":
            selector = edit.get("selector")
            property_name = edit.get("property")
            value = edit.get("value")
            if not all(
                isinstance(item, str) and item.strip()
                for item in (selector, property_name, value)
            ):
                issues.append(f"patch edit #{index + 1} is missing selector/property/value.")
                break
            next_html, changed = set_css_property_in_artifact_html(
                working,
                selector.strip(),
                property_name.strip(),
                value.strip(),
            )
            if not changed:
                issues.append(
                    f"patch edit #{index + 1} could not apply CSS selector `{selector.strip()}`."
                )
                break
            working = next_html
            continue

        if edit_type in {
            "replace_once",
            "replace_all",
            "replace_between",
            "insert_before",
            "insert_after",
            "remove_once",
        }:
            next_html, issue = apply_string_artifact_patch_edit(working, edit_type, edit)
            if issue:
                issues.append(f"patch edit #{index + 1} {issue}")
                break
            working = next_html
            continue

        issues.append(f"patch edit #{index + 1} used unsupported type `{edit_type}`.")
        break

    if issues:
        return original, issues
    if working.strip() == original.strip():
        return original, ["patch plan did not change the artifact html."]
    return working, []


def apply_string_artifact_patch_edit(
    html: str, edit_type: str, edit: dict[str, Any]
) -> tuple[str, str]:
    working = html
    if edit_type == "replace_once":
        find = edit.get("find")
        replace = edit.get("replace")
        if not isinstance(find, str) or not find:
            return working, "is missing a non-empty `find` string."
        if not isinstance(replace, str):
            return working, "is missing a `replace` string."
        position = working.find(find)
        if position < 0:
            return working, "could not find the requested exact replacement target."
        return working.replace(find, replace, 1), ""

    if edit_type == "replace_all":
        find = edit.get("find")
        replace = edit.get("replace")
        if not isinstance(find, str) or not find:
            return working, "is missing a non-empty `find` string."
        if not isinstance(replace, str):
            return working, "is missing a `replace` string."
        if find not in working:
            return working, "could not find the requested exact replacement target."
        return working.replace(find, replace), ""

    if edit_type == "replace_between":
        start = edit.get("start")
        end = edit.get("end")
        content = edit.get("content")
        if not isinstance(start, str) or not start:
            return working, "is missing a non-empty `start` string."
        if not isinstance(end, str) or not end:
            return working, "is missing a non-empty `end` string."
        if not isinstance(content, str):
            return working, "is missing a `content` string."
        start_pos = working.find(start)
        if start_pos < 0:
            return working, "could not find the requested replace_between start anchor."
        content_start = start_pos + len(start)
        end_pos = working.find(end, content_start)
        if end_pos < 0:
            return working, "could not find the requested replace_between end anchor."
        return f"{working[:content_start]}{content}{working[end_pos:]}", ""

    if edit_type == "insert_before":
        anchor = edit.get("anchor")
        content = edit.get("content")
        if not isinstance(anchor, str) or not anchor:
            return working, "is missing a non-empty `anchor` string."
        if not isinstance(content, str) or not content:
            return working, "is missing a non-empty `content` string."
        position = working.find(anchor)
        if position < 0:
            return working, "could not find the requested insert_before anchor."
        return f"{working[:position]}{content}{working[position:]}", ""

    if edit_type == "insert_after":
        anchor = edit.get("anchor")
        content = edit.get("content")
        if not isinstance(anchor, str) or not anchor:
            return working, "is missing a non-empty `anchor` string."
        if not isinstance(content, str) or not content:
            return working, "is missing a non-empty `content` string."
        position = working.find(anchor)
        if position < 0:
            return working, "could not find the requested insert_after anchor."
        insert_at = position + len(anchor)
        return f"{working[:insert_at]}{content}{working[insert_at:]}", ""

    if edit_type == "remove_once":
        find = edit.get("find")
        if not isinstance(find, str) or not find:
            return working, "is missing a non-empty `find` string."
        position = working.find(find)
        if position < 0:
            return working, "could not find the requested removal target."
        return working.replace(find, "", 1), ""

    return working, f"used unsupported type `{edit_type}`."


def artifact_edit_request_requires_external_asset_url(request: str) -> bool:
    text = (request or "").strip()
    if not text:
        return False
    lowered = text.lower()
    if re.search(r"\bhttps?://\S+", text, re.IGNORECASE) or "data:image/" in lowered:
        return False
    return bool(
        re.search(
            r"\b(?:background image|image of|photo of|picture of|texture of|logo of|use an image|use a photo|use a picture|replace .* image|swap .* image|background .* image)\b",
            lowered,
        )
    )


def is_background_image_asset_edit_request(request: str) -> bool:
    lowered = (request or "").strip().lower()
    if not lowered:
        return False
    has_background_target = bool(
        re.search(r"\b(?:background|backdrop|sky|scene|track)\b", lowered)
    )
    has_image_target = bool(
        re.search(r"\b(?:image|photo|picture|texture)\b", lowered)
    )
    return has_background_target and has_image_target


def is_background_visual_edit_request(request: str) -> bool:
    return bool(
        re.search(
            r"\b(?:background|backdrop|sky|sunrise|sunset|daytime|nighttime|lighting|ambient|weather|day\b|night\b|city|urban|skyline|downtown|buildings?)\b",
            request or "",
            re.IGNORECASE,
        )
    )


def is_city_background_edit_request(request: str) -> bool:
    lowered = (request or "").strip().lower()
    if not lowered:
        return False
    return bool(
        re.search(r"\b(?:city|urban|skyline|downtown|buildings?|skyscraper)\b", lowered)
    ) and bool(re.search(r"\b(?:background|backdrop|sky|scene|track)\b", lowered))


def is_background_like_selector(selector: str) -> bool:
    lowered = (selector or "").strip().lower()
    if not lowered:
        return False
    if lowered in {"body", "html"}:
        return True
    return bool(
        re.search(
            r"(?:#|\.|^)(?:[a-z0-9_-]*?(?:bg|background|backdrop|sky|city|scene|track)[a-z0-9_-]*)",
            lowered,
        )
    )


def score_background_selector_candidate(requested_selector: str, candidate: str) -> tuple[int, int, int]:
    requested_tokens = set(re.findall(r"[a-z]+", (requested_selector or "").lower()))
    candidate_tokens = set(re.findall(r"[a-z]+", (candidate or "").lower()))
    overlap = len(requested_tokens & candidate_tokens)
    specificity = 2 if candidate.startswith("#") else 1 if candidate.startswith(".") else 0
    priority_tokens = ("background", "backdrop", "sky", "city", "scene", "track", "bg")
    priority = 0
    lowered_candidate = candidate.lower()
    for index, token in enumerate(priority_tokens):
        if token in lowered_candidate:
            priority = len(priority_tokens) - index
            break
    return (overlap, priority, specificity)


def choose_background_selector_candidate(
    requested_selector: str, candidates: list[str]
) -> str:
    normalized = (requested_selector or "").strip()
    if not normalized or not candidates:
        return ""
    if normalized in candidates:
        return normalized
    ranked = sorted(
        candidates,
        key=lambda candidate: score_background_selector_candidate(normalized, candidate),
        reverse=True,
    )
    return ranked[0] if ranked else ""


def rewrite_artifact_patch_plan_for_current_html(
    *,
    plan: dict[str, Any],
    current_html: str,
    original_edit_request: str,
) -> dict[str, Any]:
    assistant_message = (
        plan.get("assistantMessage") if isinstance(plan.get("assistantMessage"), str) else ""
    )
    edits = plan.get("edits") if isinstance(plan.get("edits"), list) else []
    rewritten: list[dict[str, Any]] = []
    if not is_background_visual_edit_request(original_edit_request):
        return {"assistantMessage": assistant_message, "edits": edits}

    background_candidates = extract_artifact_background_selector_candidates(current_html)
    for raw_edit in edits:
        if not isinstance(raw_edit, dict):
            continue
        edit = dict(raw_edit)
        edit_type = str(edit.get("type") or "").strip().lower()
        if edit_type != "set_css_property":
            rewritten.append(edit)
            continue
        selector = str(edit.get("selector") or "").strip()
        if selector and selector not in background_candidates and is_background_like_selector(selector):
            replacement = choose_background_selector_candidate(selector, background_candidates)
            if replacement:
                edit["selector"] = replacement
        rewritten.append(edit)
    return {"assistantMessage": assistant_message, "edits": rewritten}


def extract_artifact_background_selector_candidates(html: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def remember(selector: str) -> None:
        normalized = selector.strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    for selector in ("body", "html", "#scene", "#track-bg", "#background", "#backdrop"):
        if re.search(rf"(?<![A-Za-z0-9_-]){re.escape(selector)}(?![A-Za-z0-9_-])", html):
            remember(selector)

    for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        style_body = style_match.group("body") or ""
        for raw_selector in re.findall(r"(^|})\s*([^{}]+)\{", style_body, re.MULTILINE):
            selector_text = raw_selector[1].strip()
            if not selector_text or selector_text.startswith("@"):
                continue
            for selector in selector_text.split(","):
                normalized = selector.strip()
                lowered = normalized.lower()
                if (
                    normalized in {"body", "html"}
                    or re.search(r"(?:#|\.)(?:[A-Za-z0-9_-]*?(?:bg|background|backdrop|sky|city|scene|track)[A-Za-z0-9_-]*)", lowered)
                    or any(token in lowered for token in (" body", " html", "#scene", "#track-bg", "#background", "#backdrop"))
                ):
                    remember(normalized)

    for match in re.finditer(r'id\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        raw_id = match.group(1).strip()
        if raw_id and re.search(r"(bg|background|backdrop|sky|city|scene|track)", raw_id, re.IGNORECASE):
            remember(f"#{raw_id}")

    for match in re.finditer(r'class\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        for raw_class in match.group(1).split():
            if raw_class and re.search(r"(bg|background|backdrop|sky|city|scene|track)", raw_class, re.IGNORECASE):
                remember(f".{raw_class}")

    return candidates[:12]


def extract_artifact_background_style_snippets(html: str) -> list[str]:
    snippets: list[str] = []
    seen: set[str] = set()
    candidates = extract_artifact_background_selector_candidates(html)
    style_bodies = [match.group("body") or "" for match in ARTIFACT_STYLE_TAG_RE.finditer(html)]
    for style_body in style_bodies:
        for raw_selector in re.findall(r"(^|})\s*([^{}]+)\{", style_body, re.MULTILINE):
            selector_text = raw_selector[1].strip()
            if not selector_text or selector_text.startswith("@"):
                continue
            for selector in selector_text.split(","):
                normalized = selector.strip()
                if normalized not in candidates:
                    continue
                selector_re = re.compile(rf"{re.escape(normalized)}\s*\{{", re.IGNORECASE)
                match = selector_re.search(style_body)
                if not match:
                    continue
                brace_start = match.end() - 1
                brace_end = find_matching_delimiter(style_body, brace_start, "{", "}")
                if brace_end < 0:
                    continue
                snippet = style_body[match.start(): brace_end + 1].strip()
                if snippet and snippet not in seen:
                    seen.add(snippet)
                    snippets.append(snippet)
                    if len(snippets) >= 4:
                        return snippets
    return snippets


def find_matching_delimiter(
    text: str, opening_index: int, opening_char: str, closing_char: str
) -> int:
    if opening_index < 0 or opening_index >= len(text):
        return -1
    depth = 0
    mode = "code"
    index = opening_index
    while index < len(text):
        char = text[index]
        next_char = text[index + 1] if index + 1 < len(text) else ""
        if mode == "block_comment":
            if char == "*" and next_char == "/":
                mode = "code"
                index += 2
                continue
            index += 1
            continue
        if mode == "single_quote":
            if char == "\\":
                index += 2
                continue
            if char == "'":
                mode = "code"
            index += 1
            continue
        if mode == "double_quote":
            if char == "\\":
                index += 2
                continue
            if char == '"':
                mode = "code"
            index += 1
            continue

        if char == "/" and next_char == "*":
            mode = "block_comment"
            index += 2
            continue
        if char == "'":
            mode = "single_quote"
            index += 1
            continue
        if char == '"':
            mode = "double_quote"
            index += 1
            continue
        if char == opening_char:
            depth += 1
        elif char == closing_char:
            depth -= 1
            if depth == 0:
                return index
        index += 1
    return -1


def set_css_property_in_artifact_html(
    html: str, selector: str, property_name: str, value: str
) -> tuple[str, bool]:
    remembered_no_change = False
    for match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        style_body = match.group("body")
        updated_body, changed, match_status = set_css_property_in_css(
            style_body, selector, property_name, value
        )
        if match_status == "not_found":
            continue
        if match_status == "no_change":
            remembered_no_change = True
            continue
        body_start, body_end = match.span("body")
        return f"{html[:body_start]}{updated_body}{html[body_end:]}", True
    if remembered_no_change:
        return html, False
    return html, False


def set_css_property_in_css(
    css_text: str, selector: str, property_name: str, value: str
) -> tuple[str, bool, str]:
    selector_re = re.compile(rf"{re.escape(selector)}\s*\{{", re.IGNORECASE)
    saw_no_change = False
    for match in selector_re.finditer(css_text):
        brace_start = match.end() - 1
        brace_end = find_matching_delimiter(css_text, brace_start, "{", "}")
        if brace_end < 0:
            continue

        body_start = brace_start + 1
        body_end = brace_end
        body = css_text[body_start:body_end]
        property_re = re.compile(
            rf"(?P<prefix>\b{re.escape(property_name)}\s*:\s*)(?P<value>[^;}}]+)",
            re.IGNORECASE,
        )
        property_match = property_re.search(body)
        if property_match:
            if property_match.group("value").strip() == value.strip():
                saw_no_change = True
                continue
            updated_body = property_re.sub(
                lambda property_match: f"{property_match.group('prefix')}{value}",
                body,
                count=1,
            )
        else:
            trimmed = body.rstrip()
            if trimmed and not trimmed.endswith(";"):
                trimmed = f"{trimmed};"
            indent_match = re.search(r"\n([ \t]+)\S", body)
            indent = indent_match.group(1) if indent_match else "  "
            if trimmed:
                updated_body = f"{trimmed}\n{indent}{property_name}: {value};\n"
            else:
                updated_body = f"\n{indent}{property_name}: {value};\n"

        return (
            f"{css_text[:body_start]}{updated_body}{css_text[body_end:]}",
            True,
            "changed",
        )

    if saw_no_change:
        return css_text, False, "no_change"
    return css_text, False, "not_found"


def normalize_poll_game_plan(raw_text: str) -> dict[str, Any]:
    parsed = try_parse_json(raw_text)
    if parsed is None:
        fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_text, re.IGNORECASE)
        if fenced and fenced.group(1):
            parsed = try_parse_json(fenced.group(1))
    if parsed is None:
        object_slice = extract_first_json_object(raw_text)
        if object_slice:
            parsed = try_parse_json(object_slice)

    if isinstance(parsed, list):
        return {
            "assistantMessage": "Applied parsed action list.",
            "actions": [item for item in parsed if isinstance(item, dict)],
        }

    if not isinstance(parsed, dict):
        return {
            "assistantMessage": (
                "AI response was not valid JSON. No structured actions were applied."
            ),
            "actions": [],
        }

    assistant_message = (
        parsed.get("assistantMessage")
        if isinstance(parsed.get("assistantMessage"), str)
        else parsed.get("message")
        if isinstance(parsed.get("message"), str)
        else "AI plan parsed."
    )
    actions_raw = parsed.get("actions")
    if not isinstance(actions_raw, list):
        for fallback_key in ("edits", "operations", "steps"):
            candidate = parsed.get(fallback_key)
            if isinstance(candidate, list):
                actions_raw = candidate
                break
    if not isinstance(actions_raw, list):
        actions_raw = []

    actions = [item for item in actions_raw if isinstance(item, dict)]
    return {"assistantMessage": assistant_message.strip(), "actions": actions}


def try_parse_json(value: str) -> Any | None:
    text = (value or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None


def extract_first_json_object(raw_text: str) -> str:
    text = (raw_text or "").strip()
    if not text:
        return ""
    start = text.find("{")
    if start < 0:
        return ""

    depth = 0
    in_string = False
    escape = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == "{":
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return ""


def normalize_poll_game_artifact_html(raw_text: str) -> str:
    text = (raw_text or "").strip()
    if not text:
        return ""

    for _ in range(3):
        changed = False
        direct = try_parse_json(text)
        if isinstance(direct, dict):
            html_field = direct.get("html")
            if isinstance(html_field, str) and html_field.strip():
                next_text = html_field.strip()
                if next_text != text:
                    text = next_text
                    changed = True
                    continue

        full_fence = ARTIFACT_MARKDOWN_FENCE_FULL_RE.match(text)
        if full_fence and full_fence.group(1):
            next_text = full_fence.group(1).strip()
            if next_text != text:
                text = next_text
                changed = True
                continue

        fenced_blocks = [
            match.group(1).strip()
            for match in ARTIFACT_MARKDOWN_FENCE_BLOCK_RE.finditer(text)
            if match.group(1) and match.group(1).strip()
        ]
        html_fenced_block = next(
            (
                block
                for block in fenced_blocks
                if ARTIFACT_HTML_SHAPE_RE.search(block)
            ),
            "",
        )
        if html_fenced_block and html_fenced_block != text:
            text = html_fenced_block
            changed = True
            continue

        if not changed:
            break

    if "```" in text:
        stripped_fence_lines = ARTIFACT_MARKDOWN_FENCE_LINE_RE.sub("", text).strip()
        if stripped_fence_lines and ARTIFACT_HTML_SHAPE_RE.search(stripped_fence_lines):
            text = stripped_fence_lines

    return text.strip()


def validate_poll_game_artifact_html(html: str) -> list[str]:
    text = (html or "").strip()
    if not text:
        return ["artifact output is empty."]

    issues: list[str] = []
    if "```" in text:
        issues.append("artifact output still contains markdown fences.")
    if not ARTIFACT_HTML_SHAPE_RE.search(text):
        issues.append("artifact output does not look like HTML.")
    if not contains_artifact_live_state_token(text):
        issues.append("artifact output does not appear to consume live poll state.")
    open_script_count = len(ARTIFACT_SCRIPT_OPEN_RE.findall(text))
    close_script_count = len(ARTIFACT_SCRIPT_CLOSE_RE.findall(text))
    if open_script_count != close_script_count:
        issues.append("artifact output has unbalanced <script> tags.")

    for script_match in ARTIFACT_SCRIPT_RE.finditer(text):
        script_body = script_match.group("body").strip()
        if not script_body:
            continue
        for pattern, message in ARTIFACT_ESM_PATTERNS:
            if pattern.search(script_body):
                issues.append(message)
        for pattern, message in ARTIFACT_JSX_PATTERNS:
            if pattern.search(script_body):
                issues.append(message)
        for pattern, message in ARTIFACT_UNSAFE_DIRECT_DOM_PATTERNS:
            if pattern.search(script_body):
                issues.append(message)
        for pattern, message in ARTIFACT_FULL_SCENE_RESET_PATTERNS:
            if pattern.search(script_body):
                issues.append(message)
        syntax_issue = validate_inline_script_syntax(script_body)
        if syntax_issue:
            issues.append(syntax_issue)

    deduped: list[str] = []
    seen: set[str] = set()
    for issue in issues:
        normalized = issue.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped


def contains_artifact_live_state_token(text: str) -> bool:
    normalized = (text or "").strip()
    if not normalized:
        return False
    return any(token in normalized for token in ARTIFACT_LIVE_STATE_TOKENS)


def extract_artifact_live_hook_scripts(text: str) -> list[str]:
    normalized = (text or "").strip()
    if not normalized:
        return []
    hooks: list[str] = []
    seen: set[str] = set()
    for script_match in ARTIFACT_SCRIPT_RE.finditer(normalized):
        script_text = script_match.group(0).strip()
        if not script_text or not contains_artifact_live_state_token(script_text):
            continue
        if script_text in seen:
            continue
        seen.add(script_text)
        hooks.append(script_text)
    return hooks


def collect_context_artifact_live_hooks(context: dict[str, Any]) -> list[str]:
    artifact_context = context.get("artifact") if isinstance(context.get("artifact"), dict) else {}
    if not artifact_context:
        return []
    current_html = artifact_context.get("currentArtifactHtml")
    current_hooks = artifact_context.get("currentArtifactLiveHooks")
    hooks = extract_artifact_live_hook_scripts(
        current_html if isinstance(current_html, str) else ""
    )
    if hooks:
        return hooks
    return extract_artifact_live_hook_scripts(
        current_hooks if isinstance(current_hooks, str) else ""
    )


def prepare_artifact_context_for_model(
    context: dict[str, Any], request_mode: str
) -> dict[str, Any]:
    if not isinstance(context, dict):
        return {}
    prepared = json.loads(json.dumps(context, ensure_ascii=False))
    artifact_context = (
        prepared.get("artifact") if isinstance(prepared.get("artifact"), dict) else None
    )
    if not artifact_context:
        return prepared
    current_artifact_markup = get_artifact_patch_source_html(artifact_context)
    artifact_context["currentArtifactHtml"] = compress_artifact_markup_for_model(
        current_artifact_markup,
        request_mode=request_mode,
    )
    artifact_context.pop("currentArtifactFullHtml", None)
    artifact_context["failedArtifactHtml"] = compress_artifact_markup_for_model(
        artifact_context.get("failedArtifactHtml")
        if isinstance(artifact_context.get("failedArtifactHtml"), str)
        else "",
        request_mode=request_mode,
    )
    artifact_context["currentArtifactLiveHooks"] = compress_artifact_live_hooks_for_model(
        artifact_context.get("currentArtifactLiveHooks")
        if isinstance(artifact_context.get("currentArtifactLiveHooks"), str)
        else "",
    )
    if isinstance(artifact_context.get("recentEditRequests"), list):
        artifact_context["recentEditRequests"] = [
            trim_artifact_context_text(str(item), ARTIFACT_RECENT_EDIT_REQUEST_CHAR_LIMIT)
            for item in artifact_context["recentEditRequests"][-ARTIFACT_RECENT_EDIT_REQUEST_LIMIT:]
            if str(item).strip()
        ]
    for key in ("lastPrompt", "originalEditRequest", "runtimeRenderError", "pollTitle"):
        value = artifact_context.get(key)
        if isinstance(value, str):
            artifact_context[key] = trim_artifact_context_text(value, 1200)
    return prepared


def build_stable_artifact_recovery_context(
    context: dict[str, Any], failed_html: str, validation_issues: list[str]
) -> dict[str, Any]:
    prepared = json.loads(json.dumps(context, ensure_ascii=False))
    artifact_context = (
        prepared.get("artifact") if isinstance(prepared.get("artifact"), dict) else None
    )
    if artifact_context is None:
        artifact_context = {}
        prepared["artifact"] = artifact_context
    artifact_context["requestMode"] = "repair"
    artifact_context["failedArtifactHtml"] = failed_html
    issue_text = "; ".join(issue.strip() for issue in validation_issues[:4] if issue.strip())
    existing_runtime_error = (
        artifact_context.get("runtimeRenderError")
        if isinstance(artifact_context.get("runtimeRenderError"), str)
        else ""
    )
    combined_runtime_error = ". ".join(
        part for part in (existing_runtime_error.strip(), issue_text.strip()) if part
    )
    artifact_context["runtimeRenderError"] = trim_artifact_context_text(
        combined_runtime_error,
        1200,
    )
    return prepared


def compress_artifact_markup_for_model(markup: str, *, request_mode: str) -> str:
    normalized = (markup or "").strip()
    if not normalized:
        return ""
    direct_limit = ARTIFACT_CONTEXT_DIRECT_CHAR_LIMIT
    combined_limit = ARTIFACT_CONTEXT_COMBINED_CHAR_LIMIT
    if request_mode == "edit":
        direct_limit = 18000
        combined_limit = 24000
    elif request_mode == "repair":
        direct_limit = 16000
        combined_limit = 22000
    if len(normalized) <= direct_limit:
        return normalized
    hook_scripts = "\n\n".join(extract_artifact_live_hook_scripts(normalized))
    head = normalized[:ARTIFACT_CONTEXT_HEAD_CHAR_LIMIT].strip()
    tail = normalized[-ARTIFACT_CONTEXT_TAIL_CHAR_LIMIT :].strip()
    combined = "\n\n<!-- artifact-context-cut -->\n\n".join(
        part for part in (head, hook_scripts, tail) if part
    )
    return trim_artifact_context_text(combined, combined_limit)


def compress_artifact_live_hooks_for_model(hook_text: str) -> str:
    normalized = (hook_text or "").strip()
    if not normalized:
        return ""
    extracted = extract_artifact_live_hook_scripts(normalized)
    joined = "\n\n".join(extracted) if extracted else normalized
    return trim_artifact_context_text(joined, ARTIFACT_LIVE_HOOK_CONTEXT_CHAR_LIMIT)


def inject_artifact_live_hook_scripts(html: str, hook_scripts: list[str]) -> str:
    normalized = (html or "").strip()
    if not normalized or not hook_scripts:
        return normalized
    injection = "\n\n".join(
        script_text for script_text in hook_scripts if script_text.strip()
    ).strip()
    if not injection:
        return normalized
    if re.search(r"</body>", normalized, re.IGNORECASE):
        return re.sub(
            r"</body>",
            f"{injection}\n</body>",
            normalized,
            count=1,
            flags=re.IGNORECASE,
        )
    if re.search(r"</html>", normalized, re.IGNORECASE):
        return re.sub(
            r"</html>",
            f"{injection}\n</html>",
            normalized,
            count=1,
            flags=re.IGNORECASE,
        )
    return f"{normalized}\n{injection}"


def restore_artifact_live_hooks_if_missing(html: str, context: dict[str, Any]) -> str:
    normalized = (html or "").strip()
    if not normalized or contains_artifact_live_state_token(normalized):
        return normalized
    hook_scripts = collect_context_artifact_live_hooks(context)
    if not hook_scripts:
        return normalized
    return inject_artifact_live_hook_scripts(normalized, hook_scripts)


def trim_artifact_context_text(text: str, limit: int) -> str:
    normalized = (text or "").strip()
    if not normalized or limit <= 0 or len(normalized) <= limit:
        return normalized
    marker = "\n\n<!-- artifact-context-cut -->\n\n"
    head_chars = max(1, (limit - len(marker)) // 2)
    tail_chars = max(1, limit - len(marker) - head_chars)
    return f"{normalized[:head_chars].rstrip()}{marker}{normalized[-tail_chars:].lstrip()}"


def has_artifact_syntax_or_truncation_issue(validation_issues: list[str]) -> bool:
    if not validation_issues:
        return False
    for issue in validation_issues:
        normalized = issue.strip().lower()
        if not normalized:
            continue
        if "unbalanced <script>" in normalized:
            return True
        if "unterminated" in normalized:
            return True
        if "mismatched closing" in normalized:
            return True
        if "unexpected closing" in normalized:
            return True
        if "truncated" in normalized:
            return True
    return False


def should_attempt_stable_artifact_recovery(
    request_mode: str, validation_issues: list[str], context: dict[str, Any]
) -> bool:
    if request_mode not in {"edit", "repair"}:
        return False
    if not has_artifact_syntax_or_truncation_issue(validation_issues):
        return False
    artifact_context = context.get("artifact") if isinstance(context.get("artifact"), dict) else {}
    current_html = artifact_context.get("currentArtifactHtml")
    return isinstance(current_html, str) and bool(current_html.strip())


def resolve_artifact_max_repair_attempts(request_mode: str) -> int:
    if request_mode == "edit":
        return ARTIFACT_EDIT_MAX_REPAIR_ATTEMPTS
    if request_mode == "repair":
        return ARTIFACT_REPAIR_MODE_MAX_REPAIR_ATTEMPTS
    return min(ARTIFACT_MAX_REPAIR_ATTEMPTS, ARTIFACT_BUILD_MAX_REPAIR_ATTEMPTS)


def resolve_artifact_followup_reserve_seconds(request_mode: str) -> float:
    if request_mode == "edit":
        return ARTIFACT_EDIT_FOLLOWUP_RESERVE_SECONDS
    if request_mode == "repair":
        return ARTIFACT_REPAIR_FOLLOWUP_RESERVE_SECONDS
    return ARTIFACT_BUILD_FOLLOWUP_RESERVE_SECONDS


def ensure_artifact_time_budget_remaining(
    deadline: float,
    stage: str,
    *,
    minimum_seconds: float,
    reserve_seconds: float = 0.0,
) -> float:
    remaining = deadline - time.monotonic()
    available = remaining - max(0.0, reserve_seconds)
    if available >= minimum_seconds:
        return available
    raise HTTPException(
        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
        detail=(
            f"Artifact request exceeded the server time budget while {stage}. "
            "Try a simpler edit or retry."
        ),
    )


def validate_inline_script_syntax(script_body: str) -> str:
    text = script_body or ""
    mode_stack: list[str] = ["code"]
    delimiter_stack: list[str] = []
    index = 0
    length = len(text)

    while index < length:
        mode = mode_stack[-1]
        char = text[index]
        next_char = text[index + 1] if index + 1 < length else ""

        if mode == "line_comment":
            if char in "\r\n":
                mode_stack.pop()
            index += 1
            continue

        if mode == "block_comment":
            if char == "*" and next_char == "/":
                mode_stack.pop()
                index += 2
                continue
            index += 1
            continue

        if mode == "single_quote":
            if char == "\\":
                index += 2
                continue
            if char == "'":
                mode_stack.pop()
            index += 1
            continue

        if mode == "double_quote":
            if char == "\\":
                index += 2
                continue
            if char == '"':
                mode_stack.pop()
            index += 1
            continue

        if mode == "template":
            if char == "\\":
                index += 2
                continue
            if char == "`":
                mode_stack.pop()
                index += 1
                continue
            if char == "$" and next_char == "{":
                delimiter_stack.append("${")
                mode_stack.append("code")
                index += 2
                continue
            index += 1
            continue

        if char == "/" and next_char == "/":
            mode_stack.append("line_comment")
            index += 2
            continue
        if char == "/" and next_char == "*":
            mode_stack.append("block_comment")
            index += 2
            continue
        if char == "'":
            mode_stack.append("single_quote")
            index += 1
            continue
        if char == '"':
            mode_stack.append("double_quote")
            index += 1
            continue
        if char == "`":
            mode_stack.append("template")
            index += 1
            continue
        if char in "({[":
            delimiter_stack.append(char)
            index += 1
            continue
        if char == "}":
            if delimiter_stack:
                top = delimiter_stack[-1]
                if top == "{":
                    delimiter_stack.pop()
                    index += 1
                    continue
                if top == "${":
                    delimiter_stack.pop()
                    if len(mode_stack) > 1:
                        mode_stack.pop()
                    index += 1
                    continue
                return f"script has mismatched closing `{char}`."
            return f"script has unexpected closing `{char}`."
        if char == ")":
            if not delimiter_stack:
                return f"script has unexpected closing `{char}`."
            top = delimiter_stack[-1]
            if top != "(":
                return f"script has mismatched closing `{char}`."
            delimiter_stack.pop()
            index += 1
            continue
        if char == "]":
            if not delimiter_stack:
                return f"script has unexpected closing `{char}`."
            top = delimiter_stack[-1]
            if top != "[":
                return f"script has mismatched closing `{char}`."
            delimiter_stack.pop()
            index += 1
            continue
        index += 1

    unfinished_mode = mode_stack[-1] if mode_stack else "code"
    if unfinished_mode == "single_quote":
        return "script has an unterminated single-quoted string."
    if unfinished_mode == "double_quote":
        return 'script has an unterminated double-quoted string.'
    if unfinished_mode == "template":
        return "script has an unterminated template literal."
    if unfinished_mode == "block_comment":
        return "script has an unterminated block comment."
    if unfinished_mode == "line_comment":
        mode_stack.pop()

    if delimiter_stack:
        top = delimiter_stack[-1]
        if top == "${":
            return "script has an unterminated template expression."
        if top == "{":
            return "script has an unterminated block or object literal."
        if top == "(":
            return "script has an unterminated parenthesized expression."
        if top == "[":
            return "script has an unterminated array or property access expression."

    return ""
