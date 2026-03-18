from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..artifact_package import (
    ARTIFACT_PACKAGE_ENTRY_FILE,
    ARTIFACT_PACKAGE_RENDERER_FILE,
    ARTIFACT_PACKAGE_STYLES_FILE,
    build_segmented_artifact_package,
    materialize_artifact_html_from_package,
    sanitize_artifact_package,
)
from ..artifact_patch import (
    apply_artifact_patch_plan_to_package,
    normalize_artifact_patch_plan as normalize_artifact_patch_plan_payload,
)
from ..config import settings
from ..models import ArtifactPackage

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
ANTHROPIC_ARTIFACT_MAX_TOKENS = 16000
GEMINI_ARTIFACT_MAX_TOKENS = 16000
GEMINI_ARTIFACT_REPAIR_MAX_TOKENS = 12000
GEMINI_ARTIFACT_RECOVERY_MAX_TOKENS = 10000
GEMINI_ARTIFACT_PATCH_MAX_TOKENS = 4000
GEMINI_ARTIFACT_BACKGROUND_TREATMENT_MAX_TOKENS = 1200
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
ARTIFACT_BACKGROUND_TREATMENT_SCRIPT_ID = "prezo-background-treatment-data"
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
    r"\b(?:background|backdrop|sky|track|road|ground|terrain|landscape|sunrise|sunset|daytime|nighttime|lighting|ambient|weather|color|colour|gradient|opacity|shadow|glow|border|radius|font|typography|title|headline|question|label|badge|text|padding|margin|spacing|size|bigger|smaller|larger)\b",
    re.IGNORECASE,
)
ARTIFACT_FEEDBACK_FOLLOWUP_RE = re.compile(
    r"\b(?:nothing changed|no change|still white|still blank|still the same|didn['’]?t work|didnt work|not a city|not a skyline|isn['’]?t a city|isnt a city|too white|too blank|can['’]?t see|cant see|background didn['’]?t change|background didnt change)\b",
    re.IGNORECASE,
)
ARTIFACT_STRUCTURAL_LOCAL_EDIT_REQUEST_RE = re.compile(
    r"\b(?:image|photo|picture|texture|asset|logo|svg|illustration|replace|swap|convert|turn into|add|remove|insert|delete|layout|rearrange|reposition|restructure|scene element|track image)\b",
    re.IGNORECASE,
)
ARTIFACT_LAYOUT_ORIENTATION_EDIT_REQUEST_RE = re.compile(
    r"\b(?:align|alignment|horizontal|vertical|column|columns|stack|stacked|orientation|left-align|right-align|center-align|centre-align|side by side|top to bottom|flip to vertical|flip to horizontal)\b",
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
        '- Use a stable main scene container marked with data-prezo-scene-root="true" whenever you build or substantially revise the artifact structure.',
        '- When the scene has a distinct background/backdrop layer, mark it with data-prezo-background-layer="true" so targeted background edits can modify it safely.',
        '- When feasible, keep the main interactive foreground content inside a container marked with data-prezo-foreground-layer="true".',
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
        "- Renderer idempotence is required: repeated calls with the same or newer state must not increase option-row count or duplicate labels.",
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
        '- { "type":"set_css_property", "file":"styles.css", "selector": string, "property": string, "value": string }',
        "Rules:",
        "- Prefer 1-4 edits and never emit more than 8 edits.",
        "- Preserve unrelated HTML, CSS, JavaScript, SVG, ids, classes, data attributes, and live poll wiring exactly.",
        "- The artifact is edited as a package with files: index.html, styles.css, renderer.js.",
        "- For set_css_property, use file='styles.css'.",
        "- For local visual edits such as background, time-of-day, lighting, or atmosphere, modify only background/backdrop/ambient layers and closely related color tokens.",
        "- Do not redesign cars, avatars, icons, labels, vote chips, foreground gameplay visuals, or unrelated decorative detail unless the user explicitly asks.",
        "- Prefer set_css_property for color, lighting, spacing, and timing tweaks.",
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
                        ],
                    },
                    "file": {"type": "string"},
                    "selector": {"type": "string"},
                    "property": {"type": "string"},
                    "value": {"type": "string"},
                },
                "required": ["type"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["assistantMessage", "edits"],
    "additionalProperties": False,
}

POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_SYSTEM_INSTRUCTION = "\n".join(
    [
        "You convert a user's background-only artifact request into a safe structured background treatment.",
        "Output JSON only. Do not output HTML, CSS, markdown, or explanations outside JSON.",
        'Response shape: { "assistantMessage": string, "treatment": BackgroundTreatment }',
        "Rules:",
        "- Preserve foreground gameplay visuals. Do not redesign cars, labels, badges, icons, or layout.",
        "- Do not invent external image URLs.",
        "- Use composition types that can be rendered safely with CSS only.",
        "- Choose colors with meaningful contrast. Avoid blank, washed-out, or near-white-only palettes unless the user explicitly asks for a pale/minimal white look.",
        "- For skyline requests, use real structural controls, not just colors: layerCount, buildingCount, heightVariance, windowDensity, spireFrequency, and roofVariation.",
        "- If the user asks for more detail, richer buildings, visible windows, rooflines, antennas, or spires, increase those structural controls instead of only changing colors.",
        "- Do not claim features like windows, spires, antennas, or multi-layer depth in assistantMessage unless the treatment values will actually render them.",
        "- If the prompt implies a skyline, city, or urban scene, prefer `skyline`.",
        "- If the prompt implies mountains or peaks, prefer `mountains`.",
        "- If the prompt implies desert, dunes, or sand, prefer `dunes`.",
        "- If the prompt implies clouds, haze, mist, or fog, prefer `clouds`.",
        "- Otherwise use `abstract`.",
        "- Use only hex colors in #RRGGBB format.",
    ]
)

POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "assistantMessage": {"type": "string"},
        "treatment": {
            "type": "object",
            "properties": {
                "composition": {
                    "type": "string",
                    "enum": ["abstract", "skyline", "mountains", "dunes", "clouds"],
                },
                "timeOfDay": {
                    "type": "string",
                    "enum": ["day", "golden-hour", "sunset", "night", "stormy"],
                },
                "intensity": {
                    "type": "string",
                    "enum": ["soft", "balanced", "dramatic"],
                },
                "topColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "midColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "bottomColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "silhouetteColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "accentColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "hazeColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "lightColor": {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"},
                "horizonHeightPct": {"type": "integer", "minimum": 18, "maximum": 78},
                "detailDensity": {"type": "integer", "minimum": 10, "maximum": 90},
                "layerCount": {"type": "integer", "minimum": 2, "maximum": 4},
                "buildingCount": {"type": "integer", "minimum": 8, "maximum": 32},
                "heightVariance": {"type": "integer", "minimum": 10, "maximum": 95},
                "windowDensity": {"type": "integer", "minimum": 0, "maximum": 100},
                "spireFrequency": {"type": "integer", "minimum": 0, "maximum": 100},
                "roofVariation": {"type": "integer", "minimum": 0, "maximum": 100},
                "targetSelector": {"type": "string"},
            },
            "required": [
                "composition",
                "timeOfDay",
                "intensity",
                "topColor",
                "midColor",
                "bottomColor",
                "silhouetteColor",
                "accentColor",
                "hazeColor",
                "lightColor",
                "horizonHeightPct",
                "detailDensity",
                "layerCount",
                "buildingCount",
                "heightVariance",
                "windowDensity",
                "spireFrequency",
                "roofVariation",
            ],
            "additionalProperties": False,
        },
    },
    "required": ["assistantMessage", "treatment"],
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
    artifact_package: ArtifactPackage | None = None
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
    use_anthropic_for_edit = should_route_artifact_edit_to_anthropic(
        request_mode,
        artifact_context,
        original_edit_request,
    ) and bool((settings.anthropic_api_key or "").strip())
    use_anthropic_for_patch = should_use_anthropic_for_artifact_patch_edit(
        request_mode,
        original_edit_request,
    ) and bool((settings.anthropic_api_key or "").strip())
    patch_failure_reasons: list[str] = []
    if should_attempt_artifact_patch_edit(
        request_mode,
        artifact_context,
        original_edit_request,
    ):
        patch_api_key = (
            (settings.anthropic_api_key or "").strip()
            if use_anthropic_for_patch
            else (settings.gemini_api_key or "").strip()
        )
        if patch_api_key:
            patch_model = (
                resolve_anthropic_artifact_build_model()
                if use_anthropic_for_patch
                else resolve_gemini_artifact_edit_model()
            )
            current_html = get_artifact_patch_source_html(artifact_context)
            current_package = get_artifact_patch_source_package(artifact_context)
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
                patch_html, patch_package, patch_assistant_message, patch_issues = await attempt_artifact_patch_edit(
                    api_key=patch_api_key,
                    model=patch_model,
                    original_edit_request=original_edit_request,
                    context=payload.context,
                    current_html=current_html,
                    current_package=current_package,
                    timeout_seconds=patch_timeout_seconds,
                    remaining_budget_seconds=remaining_budget_seconds,
                    use_anthropic_background_treatment=use_anthropic_for_patch,
                )
                if patch_html:
                    patch_html = restore_artifact_live_hooks_if_missing(
                        patch_html, payload.context
                    )
                    patch_package = build_segmented_artifact_package(
                        patch_html,
                        patch_package,
                    )
                    patch_validation_issues = validate_poll_game_artifact_html(patch_html)
                    if not patch_validation_issues:
                        return PollGameArtifactBuildResponse(
                            html=patch_html,
                            artifact_package=patch_package,
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
        model = resolve_anthropic_artifact_build_model()
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
            max_tokens=ANTHROPIC_ARTIFACT_MAX_TOKENS,
            timeout_seconds=timeout_seconds,
            request_stage="artifact initial build",
            remaining_budget_seconds=remaining_budget_seconds,
        )
    else:
        if use_anthropic_for_edit:
            build_api_key = (settings.anthropic_api_key or "").strip()
            model = resolve_anthropic_artifact_build_model()
            temperature = 0.35
            request_stage = "artifact complex edit generation"
            configured_timeout_seconds = settings.anthropic_artifact_build_timeout_seconds
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
            request_text, stop_reason = await request_anthropic_text(
                api_key=build_api_key,
                model=model,
                system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
                prompt_text=json.dumps(
                    {"prompt": payload.prompt, "context": model_context},
                    indent=2,
                ),
                temperature=temperature,
                max_tokens=ANTHROPIC_ARTIFACT_MAX_TOKENS,
                timeout_seconds=timeout_seconds,
                request_stage=request_stage,
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
            detail=f"{'Anthropic' if is_initial_build or use_anthropic_for_edit else 'Gemini'} response did not include artifact HTML.",
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

    response_package = build_segmented_artifact_package(html)
    if response_package:
        html = materialize_artifact_html_from_package(
            response_package,
            fallback_html=html,
        )

    return PollGameArtifactBuildResponse(
        html=html,
        artifact_package=response_package,
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
    current_package: dict[str, Any] | None,
    timeout_seconds: float,
    remaining_budget_seconds: float | None = None,
    use_anthropic_background_treatment: bool = False,
) -> tuple[str, dict[str, Any] | None, str, list[str]]:
    if artifact_edit_request_requires_external_asset_url(original_edit_request):
        return (
            "",
            current_package,
            "This edit needs a direct image URL. Provide the exact Dubai image URL and the editor can swap only the background image without redesigning the scene.",
            ["the requested edit needs a direct external image URL."],
        )
    if is_background_visual_edit_request(original_edit_request):
        treatment_html, treatment_message, treatment_issues = (
            await attempt_artifact_background_treatment_edit(
                api_key=api_key,
                model=model,
                original_edit_request=original_edit_request,
                context=context,
                current_html=current_html,
                timeout_seconds=timeout_seconds,
                remaining_budget_seconds=remaining_budget_seconds,
                use_anthropic=use_anthropic_background_treatment,
            )
        )
        if treatment_html:
            treatment_package = build_segmented_artifact_package(
                treatment_html,
                current_package,
            )
            return treatment_html, treatment_package, treatment_message, []
        if treatment_issues:
            if not should_fallback_to_generic_patch_after_background_treatment_failure(
                treatment_issues
            ):
                return "", current_package, treatment_message, treatment_issues
    builtin_html, builtin_message = attempt_builtin_cityscape_background_patch(
        current_html=current_html,
        original_edit_request=original_edit_request,
    )
    if builtin_html:
        builtin_package = build_segmented_artifact_package(builtin_html, current_package)
        return builtin_html, builtin_package, builtin_message, []
    orientation_html, orientation_package, orientation_message = (
        attempt_builtin_layout_orientation_patch(
            current_html=current_html,
            current_package=current_package,
            original_edit_request=original_edit_request,
        )
    )
    if orientation_html:
        return orientation_html, orientation_package, orientation_message, []
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
        plan=normalize_artifact_patch_plan_payload(text),
        current_html=current_html,
        original_edit_request=original_edit_request,
    )
    patched_html, patched_package, issues = apply_artifact_patch_plan_to_package(
        html=current_html,
        artifact_package=current_package,
        plan=plan,
        max_edits=ARTIFACT_PATCH_MAX_EDITS,
    )
    if issues:
        return "", current_package, plan.get("assistantMessage", ""), issues
    return patched_html, patched_package, plan.get("assistantMessage", ""), []


async def attempt_artifact_background_treatment_edit(
    *,
    api_key: str,
    model: str,
    original_edit_request: str,
    context: dict[str, Any],
    current_html: str,
    timeout_seconds: float,
    remaining_budget_seconds: float | None = None,
    use_anthropic: bool = False,
) -> tuple[str, str, list[str]]:
    prompt = build_artifact_background_treatment_prompt(
        original_edit_request=original_edit_request,
        context=context,
        current_html=current_html,
    )
    if use_anthropic:
        text, _stop_reason = await request_anthropic_text(
            api_key=api_key,
            model=model,
            system_instruction=POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_SYSTEM_INSTRUCTION,
            prompt_text=prompt,
            temperature=0.15,
            max_tokens=GEMINI_ARTIFACT_BACKGROUND_TREATMENT_MAX_TOKENS,
            timeout_seconds=timeout_seconds,
            request_stage="artifact background treatment",
            remaining_budget_seconds=remaining_budget_seconds,
        )
    else:
        text, _stop_reason = await request_gemini_text(
            api_key=api_key,
            model=model,
            system_instruction=POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_SYSTEM_INSTRUCTION,
            prompt_text=prompt,
            temperature=0.15,
            max_tokens=GEMINI_ARTIFACT_BACKGROUND_TREATMENT_MAX_TOKENS,
            timeout_seconds=timeout_seconds,
            request_stage="artifact background treatment",
            remaining_budget_seconds=remaining_budget_seconds,
            response_mime_type="application/json",
            response_json_schema=POLL_GAME_ARTIFACT_BACKGROUND_TREATMENT_JSON_SCHEMA,
            thinking_budget=0,
        )
    plan = normalize_artifact_background_treatment_plan(text)
    treatment = plan.get("treatment") if isinstance(plan.get("treatment"), dict) else {}
    if not treatment:
        fallback_treatment = normalize_background_treatment({}, original_edit_request)
        treated_html, issues = apply_background_treatment_to_artifact_html(
            current_html=current_html,
            treatment=fallback_treatment,
            original_edit_request=original_edit_request,
        )
        if not issues:
            applied_config = parse_artifact_background_treatment_config(treated_html)
            return (
                treated_html,
                build_applied_background_treatment_assistant_message(
                    applied_config or fallback_treatment, original_edit_request
                ),
                [],
            )
        return "", plan.get("assistantMessage", ""), [
            "background treatment planner returned no usable treatment."
        ] + issues
    treated_html, issues = apply_background_treatment_to_artifact_html(
        current_html=current_html,
        treatment=treatment,
        original_edit_request=original_edit_request,
    )
    if issues:
        return "", plan.get("assistantMessage", ""), issues
    applied_config = parse_artifact_background_treatment_config(treated_html)
    return (
        treated_html,
        build_applied_background_treatment_assistant_message(
            applied_config or normalize_background_treatment(treatment, original_edit_request),
            original_edit_request,
        ),
        [],
    )


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


def resolve_anthropic_artifact_build_model() -> str:
    return (
        normalize_anthropic_model_name(settings.anthropic_artifact_build_model)
        or DEFAULT_ANTHROPIC_ARTIFACT_BUILD_MODEL
    )


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
    request = value.strip() if isinstance(value, str) and value.strip() else (fallback_prompt or "").strip()
    return resolve_artifact_edit_request_feedback(artifact_context, request)


def is_artifact_feedback_followup_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    return bool(ARTIFACT_FEEDBACK_FOLLOWUP_RE.search(normalized))


def resolve_artifact_edit_request_feedback(
    artifact_context: dict[str, Any], request_text: str
) -> str:
    normalized = (request_text or "").strip()
    if not normalized or not is_artifact_feedback_followup_request(normalized):
        return normalized
    recent_requests = (
        artifact_context.get("recentEditRequests")
        if isinstance(artifact_context.get("recentEditRequests"), list)
        else []
    )
    for item in reversed(recent_requests):
        prior_request = item.strip() if isinstance(item, str) else ""
        if (
            not prior_request
            or prior_request == normalized
            or is_artifact_feedback_followup_request(prior_request)
        ):
            continue
        if is_background_visual_edit_request(prior_request):
            return (
                "Retry the previous background-only edit and make the result clearly visible. "
                f"Previous request: {prior_request}. "
                f"User feedback on the last attempt: {normalized}. "
                "Keep the cars, labels, layout, vote visuals, and foreground gameplay art unchanged. "
                "Apply a visibly different background treatment across the full scene. "
                "Do not leave the result pale, blank, nearly white, or barely changed."
            )
        return (
            "Retry the previous targeted edit more faithfully. "
            f"Previous request: {prior_request}. "
            f"User feedback on the last attempt: {normalized}. "
            "Keep unrelated parts of the artifact unchanged."
        )
    return normalized


def is_broad_artifact_edit_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    return bool(ARTIFACT_BROAD_EDIT_REQUEST_RE.search(normalized))


def is_layout_orientation_artifact_edit_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    return bool(ARTIFACT_LAYOUT_ORIENTATION_EDIT_REQUEST_RE.search(normalized))


def infer_requested_artifact_layout_orientation(request_text: str) -> str:
    lowered = (request_text or "").strip().lower()
    if not lowered:
        return ""
    if re.search(
        r"horizontal[\s\S]{0,80}(?:become|becomes|turn(?:ed)?|change(?:d)?|convert(?:ed)?|to)\s+vertical",
        lowered,
    ):
        return "vertical"
    if re.search(
        r"vertical[\s\S]{0,80}(?:become|becomes|turn(?:ed)?|change(?:d)?|convert(?:ed)?|to)\s+horizontal",
        lowered,
    ):
        return "horizontal"
    if re.search(
        r"(?:instead of|from)\s+horizontal[\s\S]{0,80}(?:to|into)?\s*vertical",
        lowered,
    ):
        return "vertical"
    if re.search(
        r"(?:instead of|from)\s+vertical[\s\S]{0,80}(?:to|into)?\s*horizontal",
        lowered,
    ):
        return "horizontal"
    vertical_score = 0
    horizontal_score = 0
    if re.search(r"\b(?:vertical|column|columns|stack|stacked|top to bottom)\b", lowered):
        vertical_score += 1
    if re.search(
        r"\b(?:horizontal|row|rows|side by side|left to right)\b", lowered
    ):
        horizontal_score += 1
    if re.search(r"\b(?:rotate|flip|switch|convert|change)\b", lowered):
        vertical_score += 1 if "vertical" in lowered else 0
        horizontal_score += 1 if "horizontal" in lowered else 0
    if "vertical" in lowered and "horizontal" in lowered:
        if lowered.rfind("vertical") > lowered.rfind("horizontal"):
            vertical_score += 1
        elif lowered.rfind("horizontal") > lowered.rfind("vertical"):
            horizontal_score += 1
    if vertical_score > horizontal_score:
        return "vertical"
    if horizontal_score > vertical_score:
        return "horizontal"
    return ""


def is_patch_only_artifact_edit_request(request_text: str) -> bool:
    normalized = (request_text or "").strip()
    if not normalized:
        return False
    if is_background_image_asset_edit_request(normalized):
        return True
    if is_layout_orientation_artifact_edit_request(normalized):
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


def should_route_artifact_edit_to_anthropic(
    request_mode: str,
    artifact_context: dict[str, Any],
    original_edit_request: str,
) -> bool:
    if request_mode != "edit":
        return False
    normalized = (original_edit_request or "").strip()
    if not normalized:
        return False
    if is_layout_orientation_artifact_edit_request(normalized):
        return not bool(get_artifact_patch_source_html(artifact_context))
    if is_background_visual_edit_request(normalized):
        if artifact_edit_request_requires_external_asset_url(normalized):
            return False
        return not bool(get_artifact_patch_source_html(artifact_context))
    return classify_artifact_edit_request_scope(normalized) in {
        "broad",
        "structural_local",
    }


def should_use_anthropic_for_artifact_patch_edit(
    request_mode: str, original_edit_request: str
) -> bool:
    if request_mode != "edit":
        return False
    normalized = (original_edit_request or "").strip()
    if not normalized or artifact_edit_request_requires_external_asset_url(normalized):
        return False
    return is_background_visual_edit_request(normalized)


def get_artifact_patch_source_html(artifact_context: dict[str, Any]) -> str:
    full_html = artifact_context.get("currentArtifactFullHtml")
    if isinstance(full_html, str) and full_html.strip():
        return full_html.strip()
    package = get_artifact_patch_source_package(artifact_context)
    if package:
        return materialize_artifact_html_from_package(package)
    current_html = artifact_context.get("currentArtifactHtml")
    if isinstance(current_html, str) and current_html.strip():
        return current_html.strip()
    return ""


def get_artifact_patch_source_package(
    artifact_context: dict[str, Any],
) -> dict[str, Any] | None:
    for key in ("currentArtifactPackage", "currentArtifactFullPackage"):
        value = artifact_context.get(key)
        if isinstance(value, dict):
            sanitized = sanitize_artifact_package(value)
            if sanitized:
                return sanitized
    return None


def should_require_safe_patch_only_edit(
    request_mode: str, artifact_context: dict[str, Any], original_edit_request: str
) -> bool:
    if request_mode not in {"edit", "repair"}:
        return False
    if should_route_artifact_edit_to_anthropic(
        request_mode, artifact_context, original_edit_request
    ):
        return False
    if classify_artifact_edit_request_scope(original_edit_request) != "patch_only":
        return False
    return bool(get_artifact_patch_source_html(artifact_context))


def should_attempt_artifact_patch_edit(
    request_mode: str, artifact_context: dict[str, Any], original_edit_request: str
) -> bool:
    if request_mode not in {"edit", "repair"}:
        return False
    if should_route_artifact_edit_to_anthropic(
        request_mode, artifact_context, original_edit_request
    ):
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
    is_layout_orientation_edit = is_layout_orientation_artifact_edit_request(
        original_edit_request
    )
    requested_layout_orientation = infer_requested_artifact_layout_orientation(
        original_edit_request
    )
    is_city_background_edit = is_city_background_edit_request(original_edit_request)
    requires_external_asset_url = artifact_edit_request_requires_external_asset_url(
        original_edit_request
    )
    background_selector_candidates = extract_artifact_background_selector_candidates(
        current_html
    )
    layout_selector_candidates = extract_artifact_layout_selector_candidates(current_html)
    scene_root_selector_candidates = extract_artifact_scene_root_selector_candidates(
        current_html
    )
    background_style_snippets = extract_artifact_background_style_snippets(current_html)
    return "\n".join(
        [
            "Artifact patch edit task",
            "Apply the user request with minimal edits to the current artifact.",
            "Do not redesign the scene. Preserve unrelated markup exactly.",
            f"Original user edit request: {original_edit_request}",
            (
                "Artifact package target files: "
                f"{ARTIFACT_PACKAGE_ENTRY_FILE}, "
                f"{ARTIFACT_PACKAGE_STYLES_FILE}, "
                f"{ARTIFACT_PACKAGE_RENDERER_FILE}."
            ),
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
                "This is an orientation/alignment request. Keep the same concept and visuals, but switch poll option layout orientation using local CSS changes only."
                if is_layout_orientation_edit
                else ""
            ),
            (
                f"Requested poll layout orientation: {requested_layout_orientation}."
                if is_layout_orientation_edit and requested_layout_orientation
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
                "Available exact scene-root selectors in the current artifact: "
                + ", ".join(scene_root_selector_candidates)
                if scene_root_selector_candidates
                else ""
            ),
            (
                "Available exact layout selectors in the current artifact: "
                + ", ".join(layout_selector_candidates)
                if layout_selector_candidates
                else ""
            ),
            (
                "For background edits, if you use set_css_property, the selector must match one of the available exact background selectors above. Do not invent selectors."
                if background_selector_candidates
                else ""
            ),
            (
                "For layout-orientation edits, target the exact layout selectors above and prefer flex-direction/grid-flow changes over HTML rewrites. Do not invent selectors."
                if is_layout_orientation_edit and layout_selector_candidates
                else ""
            ),
            (
                "If no dedicated background selector fits, use the existing scene-root selectors above as the safe fallback target instead of inventing a new selector."
                if scene_root_selector_candidates
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
            f"For set_css_property, target file `{ARTIFACT_PACKAGE_STYLES_FILE}`.",
            "Do not rename or remove live poll hooks, ids, classes, or data attributes relied on by the existing artifact.",
            "If patch mode is not suitable for this request, return an empty edits array.",
            "Current artifact HTML:",
            current_html,
        ]
    )


def build_artifact_background_treatment_prompt(
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
    background_selector_candidates = extract_artifact_background_selector_candidates(
        current_html
    )
    scene_root_selector_candidates = extract_artifact_scene_root_selector_candidates(
        current_html
    )
    background_style_snippets = extract_artifact_background_style_snippets(current_html)
    return "\n".join(
        [
            "<task>",
            "Translate the user request into a structured background-only treatment for the current artifact.",
            "Do not modify cars, labels, gameplay elements, or live hooks.",
            "</task>",
            "<request>",
            original_edit_request,
            "</request>",
            f"<artifact_type>{artifact_type}</artifact_type>" if artifact_type else "",
            (
                f"<design_guidelines>{design_guidelines}</design_guidelines>"
                if design_guidelines
                else ""
            ),
            f"<poll_title>{poll_title}</poll_title>" if poll_title else "",
            (
                "<exact_background_selectors>"
                + ", ".join(background_selector_candidates)
                + "</exact_background_selectors>"
                if background_selector_candidates
                else ""
            ),
            (
                "<exact_scene_root_selectors>"
                + ", ".join(scene_root_selector_candidates)
                + "</exact_scene_root_selectors>"
                if scene_root_selector_candidates
                else ""
            ),
            (
                "<current_background_css>\n"
                + "\n\n".join(background_style_snippets)
                + "\n</current_background_css>"
                if background_style_snippets
                else ""
            ),
            "<quality_bar>",
            "Prefer a meaningful visual composition over a weak color wash.",
            "Never return a pale blank background unless the user explicitly asks for a minimal white background.",
            "Choose a composition that fits the request and can be rendered with CSS only.",
            "Use targetSelector only when one of the exact background selectors above is an obvious fit. Otherwise leave it empty and the backend will choose.",
            "If no dedicated background selector is available, the backend may target a stable scene-root selector instead. Do not invent your own selector names.",
            "For skyline or city requests, use structural controls, not just colors.",
            "If the request asks for more detail, richer buildings, or better skyline detail, return at least layerCount 3, buildingCount 18, heightVariance 45, windowDensity 25, and roofVariation 25.",
            "If the request mentions windows, increase windowDensity to 45 or higher.",
            "If the request mentions spires or antennas, increase spireFrequency to 35 or higher and roofVariation to 45 or higher.",
            "</quality_bar>",
            "<example name=\"detailed_skyline\">",
            '{"assistantMessage":"Apply a night skyline with three depth layers and visible windows.","treatment":{"composition":"skyline","timeOfDay":"night","intensity":"dramatic","topColor":"#173A5C","midColor":"#476C8F","bottomColor":"#D39A63","silhouetteColor":"#122033","accentColor":"#F0B36F","hazeColor":"#6E88A3","lightColor":"#FFE1A0","horizonHeightPct":44,"detailDensity":78,"layerCount":4,"buildingCount":24,"heightVariance":70,"windowDensity":58,"spireFrequency":36,"roofVariation":54,"targetSelector":""}}',
            "</example>",
            "<example name=\"sunset_gradient\">",
            '{"assistantMessage":"Apply a layered sunset atmosphere.","treatment":{"composition":"abstract","timeOfDay":"sunset","intensity":"balanced","topColor":"#2E4E78","midColor":"#D87862","bottomColor":"#F0B06C","silhouetteColor":"#394C5E","accentColor":"#FFD08A","hazeColor":"#E7B38F","lightColor":"#FFE1A6","horizonHeightPct":40,"detailDensity":48,"layerCount":2,"buildingCount":10,"heightVariance":22,"windowDensity":0,"spireFrequency":0,"roofVariation":0,"targetSelector":""}}',
            "</example>",
        ]
    )


def normalize_artifact_background_treatment_plan(raw_text: str) -> dict[str, Any]:
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
        return {"assistantMessage": "", "treatment": {}}
    assistant_message = (
        parsed.get("assistantMessage")
        if isinstance(parsed.get("assistantMessage"), str)
        else parsed.get("message")
        if isinstance(parsed.get("message"), str)
        else ""
    )
    treatment = parsed.get("treatment") if isinstance(parsed.get("treatment"), dict) else {}
    return {"assistantMessage": assistant_message.strip(), "treatment": treatment}


def normalize_artifact_patch_plan(raw_text: str) -> dict[str, Any]:
    return normalize_artifact_patch_plan_payload(raw_text)


def apply_artifact_patch_plan(html: str, plan: dict[str, Any]) -> tuple[str, list[str]]:
    patched_html, _patched_package, issues = apply_artifact_patch_plan_to_package(
        html=html,
        artifact_package=None,
        plan=plan,
        max_edits=ARTIFACT_PATCH_MAX_EDITS,
    )
    return patched_html, issues


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
            r"\b(?:background|backdrop|sky|track|road|ground|terrain|landscape|sunrise|sunset|daytime|nighttime|lighting|ambient|weather|day\b|night\b|city|cityscape|urban|skyline|downtown|buildings?)\b",
            request or "",
            re.IGNORECASE,
        )
    )


def is_city_background_edit_request(request: str) -> bool:
    lowered = (request or "").strip().lower()
    if not lowered:
        return False
    return bool(
        re.search(r"\b(?:city|cityscape|urban|skyline|downtown|buildings?|skyscraper)\b", lowered)
    ) and bool(re.search(r"\b(?:background|backdrop|sky|scene|track)\b", lowered))


def is_background_like_selector(selector: str) -> bool:
    lowered = (selector or "").strip().lower()
    if not lowered:
        return False
    if lowered in {"body", "html"}:
        return True
    if "data-prezo-background-layer" in lowered:
        return True
    return bool(
        re.search(
            r"(?:#|\.|^)(?:[a-z0-9_-]*?(?:bg|background|backdrop|sky|city|scene|track)[a-z0-9_-]*)",
            lowered,
        )
    )


def is_explicit_background_layer_selector(selector: str) -> bool:
    lowered = (selector or "").strip().lower()
    if not lowered:
        return False
    if "data-prezo-background-layer" in lowered or "data-prezo-generated-background-layer" in lowered:
        return True
    return bool(
        re.search(r"(?:bg|background|backdrop|sky|track)", lowered)
    )


def is_layout_like_selector(selector: str) -> bool:
    lowered = (selector or "").strip().lower()
    if not lowered:
        return False
    if lowered in {"body", "html"}:
        return False
    if "::before" in lowered or "::after" in lowered:
        return False
    if "data-prezo-foreground-layer" in lowered:
        return True
    return bool(
        re.search(
            r"(?:option|poll|choice|answer|lane|row|bar|column|stack|vote|result|list|grid|rank)",
            lowered,
        )
    )


def extract_artifact_layout_selector_candidates(html: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def remember(selector: str) -> None:
        normalized = selector.strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    for selector in (
        "#options",
        "#poll-options",
        "#poll-rows",
        "#lanes",
        ".options",
        ".poll-options",
        ".poll-rows",
        ".choices",
        ".answers",
        ".lanes",
        ".rows",
        ".bars",
        ".columns",
        ".option-list",
        ".poll-list",
    ):
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
                if is_layout_like_selector(normalized):
                    remember(normalized)

    for match in re.finditer(r'id\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        raw_id = match.group(1).strip()
        if raw_id and re.search(
            r"(option|poll|choice|answer|lane|row|bar|column|stack|vote|result|list|grid|rank)",
            raw_id,
            re.IGNORECASE,
        ):
            remember(f"#{raw_id}")

    for match in re.finditer(r'class\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        for raw_class in match.group(1).split():
            if raw_class and re.search(
                r"(option|poll|choice|answer|lane|row|bar|column|stack|vote|result|list|grid|rank)",
                raw_class,
                re.IGNORECASE,
            ):
                remember(f".{raw_class}")

    return candidates[:14]


def score_layout_selector_candidate(
    requested_selector: str, candidate: str
) -> tuple[int, int, int]:
    requested_tokens = set(re.findall(r"[a-z]+", (requested_selector or "").lower()))
    candidate_tokens = set(re.findall(r"[a-z]+", (candidate or "").lower()))
    overlap = len(requested_tokens & candidate_tokens)
    specificity = (
        2
        if candidate.startswith("#")
        else 1
        if candidate.startswith(".") or candidate.startswith("[")
        else 0
    )
    priority_tokens = (
        "options",
        "poll-options",
        "poll-rows",
        "choices",
        "answers",
        "lanes",
        "rows",
        "bars",
        "columns",
        "option",
        "poll",
        "vote",
        "result",
        "list",
        "grid",
        "stack",
        "rank",
    )
    priority = 0
    lowered_candidate = candidate.lower()
    for index, token in enumerate(priority_tokens):
        if token in lowered_candidate:
            priority = len(priority_tokens) - index
            break
    complexity_penalty = -1 if (" " in candidate or ">" in candidate) else 0
    return (overlap, priority, specificity + complexity_penalty)


def choose_layout_selector_candidate(
    requested_selector: str, candidates: list[str]
) -> str:
    if not candidates:
        return ""
    normalized_candidates = [item for item in candidates if is_layout_like_selector(item)]
    if not normalized_candidates:
        return ""
    normalized_requested = (requested_selector or "").strip()
    if normalized_requested in normalized_candidates:
        return normalized_requested
    ranked = sorted(
        normalized_candidates,
        key=lambda candidate: score_layout_selector_candidate(
            normalized_requested, candidate
        ),
        reverse=True,
    )
    return ranked[0] if ranked else ""


def extract_artifact_scene_root_selector_candidates(html: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def remember(selector: str) -> None:
        normalized = selector.strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    if re.search(r"data-prezo-scene-root\b", html, re.IGNORECASE):
        remember("[data-prezo-scene-root]")
    for selector in (
        "#scene",
        "#stage",
        "#viewport",
        "#artifact-root",
        "#root",
        "#app",
        "#canvas",
        "#frame",
        "#shell",
        "#container",
        "main",
        "body",
        "html",
    ):
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
                    normalized in {"body", "html", "main"}
                    or "data-prezo-scene-root" in lowered
                    or re.search(
                        r"(?:#|\.)(?:[A-Za-z0-9_-]*?(?:scene|stage|viewport|frame|app|root|canvas|shell|container|wrapper|surface|board|arena)[A-Za-z0-9_-]*)",
                        lowered,
                    )
                ):
                    remember(normalized)

    for match in re.finditer(r'id\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        raw_id = match.group(1).strip()
        if raw_id and re.search(
            r"(scene|stage|viewport|frame|app|root|canvas|shell|container|wrapper|surface|board|arena)",
            raw_id,
            re.IGNORECASE,
        ):
            remember(f"#{raw_id}")

    for match in re.finditer(r'class\s*=\s*["\']([^"\']+)["\']', html, re.IGNORECASE):
        for raw_class in match.group(1).split():
            if raw_class and re.search(
                r"(scene|stage|viewport|frame|app|root|canvas|shell|container|wrapper|surface|board|arena)",
                raw_class,
                re.IGNORECASE,
            ):
                remember(f".{raw_class}")

    body_match = re.search(r"<body\b[^>]*>(?P<body>[\s\S]*?)</body>", html, re.IGNORECASE)
    if body_match:
        body_inner = body_match.group("body") or ""
        first_child_match = re.search(r"<([a-z0-9:_-]+)\b(?P<attrs>[^>]*)>", body_inner, re.IGNORECASE)
        if first_child_match:
            attrs = first_child_match.group("attrs") or ""
            id_match = re.search(r'id\s*=\s*["\']([^"\']+)["\']', attrs, re.IGNORECASE)
            if id_match:
                remember(f"#{id_match.group(1).strip()}")
            class_match = re.search(r'class\s*=\s*["\']([^"\']+)["\']', attrs, re.IGNORECASE)
            if class_match:
                first_class = next(
                    (item.strip() for item in class_match.group(1).split() if item.strip()),
                    "",
                )
                if first_class:
                    remember(f".{first_class}")
            tag_name = (first_child_match.group(1) or "").strip().lower()
            if tag_name in {"main", "section", "article", "div"}:
                remember(tag_name)

    return candidates[:14]


def score_scene_root_selector_candidate(candidate: str) -> tuple[int, int]:
    lowered = (candidate or "").strip().lower()
    if not lowered:
        return (0, 0)
    specificity = (
        3
        if lowered.startswith("[data-prezo-scene-root]")
        else 2
        if lowered.startswith("#")
        else 1
        if lowered.startswith(".")
        else 0
    )
    priority_tokens = (
        "data-prezo-scene-root",
        "artifact-root",
        "scene",
        "stage",
        "viewport",
        "root",
        "app",
        "canvas",
        "frame",
        "shell",
        "container",
        "wrapper",
        "surface",
        "board",
        "arena",
        "main",
        "body",
        "html",
    )
    priority = 0
    for index, token in enumerate(priority_tokens):
        if token in lowered:
            priority = len(priority_tokens) - index
            break
    return (priority, specificity)


def choose_scene_root_selector_candidate(candidates: list[str]) -> str:
    if not candidates:
        return ""
    ranked = sorted(
        candidates,
        key=score_scene_root_selector_candidate,
        reverse=True,
    )
    return ranked[0] if ranked else ""


def choose_artifact_background_treatment_target_selector(
    current_html: str, requested_selector: str
) -> str:
    background_candidates = [
        candidate
        for candidate in extract_artifact_background_selector_candidates(current_html)
        if candidate not in {"body", "html"}
    ]
    if background_candidates:
        chosen_background = choose_background_selector_candidate(
            requested_selector,
            background_candidates,
        )
        if chosen_background:
            return chosen_background

    scene_root_candidates = [
        candidate
        for candidate in extract_artifact_scene_root_selector_candidates(current_html)
        if candidate not in {"body", "html"}
    ]
    if scene_root_candidates:
        chosen_scene_root = choose_scene_root_selector_candidate(scene_root_candidates)
        if chosen_scene_root:
            return chosen_scene_root

    return choose_background_selector_candidate(
        requested_selector,
        extract_artifact_background_selector_candidates(current_html),
    )


def ensure_generated_background_layer_in_artifact_html(html: str) -> tuple[str, str]:
    selector = "[data-prezo-generated-background-layer]"
    if re.search(r"data-prezo-generated-background-layer\b", html, re.IGNORECASE):
        return html, selector
    layer_markup = (
        '\n<div data-prezo-background-layer="true" '
        'data-prezo-generated-background-layer="true" '
        'aria-hidden="true"></div>'
    )
    body_open = re.search(r"<body\b[^>]*>", html, re.IGNORECASE)
    if body_open:
        insert_at = body_open.end()
        return f"{html[:insert_at]}{layer_markup}{html[insert_at:]}", selector
    html_open = re.search(r"<html\b[^>]*>", html, re.IGNORECASE)
    if html_open:
        insert_at = html_open.end()
        return f"{html[:insert_at]}<body>{layer_markup}</body>{html[insert_at:]}", selector
    return f"<body>{layer_markup}{html}</body>", selector


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
    is_background_edit = is_background_visual_edit_request(original_edit_request)
    is_layout_orientation_edit = is_layout_orientation_artifact_edit_request(
        original_edit_request
    )
    if not is_background_edit and not is_layout_orientation_edit:
        return {"assistantMessage": assistant_message, "edits": edits}

    background_candidates = extract_artifact_background_selector_candidates(current_html)
    layout_candidates = extract_artifact_layout_selector_candidates(current_html)
    for raw_edit in edits:
        if not isinstance(raw_edit, dict):
            continue
        edit = dict(raw_edit)
        edit_type = str(edit.get("type") or "").strip().lower()
        if edit_type != "set_css_property":
            rewritten.append(edit)
            continue
        selector = str(edit.get("selector") or "").strip()
        if (
            is_background_edit
            and selector
            and selector not in background_candidates
            and is_background_like_selector(selector)
        ):
            replacement = choose_background_selector_candidate(
                selector, background_candidates
            )
            if replacement:
                edit["selector"] = replacement
                selector = replacement
        if (
            is_layout_orientation_edit
            and selector
            and selector not in layout_candidates
            and is_layout_like_selector(selector)
        ):
            replacement = choose_layout_selector_candidate(selector, layout_candidates)
            if replacement:
                edit["selector"] = replacement
        rewritten.append(edit)
    return {"assistantMessage": assistant_message, "edits": rewritten}


def infer_background_composition_from_request(request: str) -> str:
    lowered = (request or "").strip().lower()
    if re.search(r"\b(?:city|cityscape|urban|skyline|downtown|buildings?|skyscraper)\b", lowered):
        return "skyline"
    if re.search(r"\b(?:mountain|mountains|peak|peaks|alps|cliff|ridge)\b", lowered):
        return "mountains"
    if re.search(r"\b(?:desert|dune|dunes|sand|sandy)\b", lowered):
        return "dunes"
    if re.search(r"\b(?:cloud|clouds|mist|fog|haze)\b", lowered):
        return "clouds"
    return "abstract"


def infer_background_time_of_day_from_request(request: str) -> str:
    lowered = (request or "").strip().lower()
    if re.search(r"\b(?:night|midnight|moonlit|after dark|dark)\b", lowered):
        return "night"
    if re.search(r"\b(?:storm|stormy|thunder|rainy|moody)\b", lowered):
        return "stormy"
    if re.search(r"\b(?:sunset|dusk|twilight)\b", lowered):
        return "sunset"
    if re.search(r"\b(?:golden hour|sunrise|dawn|morning)\b", lowered):
        return "golden-hour"
    return "day"


def background_request_explicitly_allows_pale_palette(request: str) -> bool:
    lowered = (request or "").strip().lower()
    return bool(
        re.search(r"\b(?:white|minimal|foggy white|washed|airy|soft white|monochrome white|snow)\b", lowered)
    )


def background_request_wants_extra_detail(request: str) -> bool:
    lowered = (request or "").strip().lower()
    return bool(
        re.search(
            r"\b(?:detailed?|detail|richer|more detail|more detailed|intricate|complex|layered|depth|textured?|refined|more interesting)\b",
            lowered,
        )
    )


def background_request_mentions_windows(request: str) -> bool:
    lowered = (request or "").strip().lower()
    return bool(re.search(r"\b(?:window|windows|lit windows?|glowing windows?)\b", lowered))


def background_request_mentions_spires(request: str) -> bool:
    lowered = (request or "").strip().lower()
    return bool(re.search(r"\b(?:spire|spires|antenna|antennas|crown|crowns|roofline|rooflines)\b", lowered))


def background_request_mentions_depth_layers(request: str) -> bool:
    lowered = (request or "").strip().lower()
    return bool(
        re.search(
            r"\b(?:foreground|midground|background layers?|multiple layers?|depth layers?|parallax)\b",
            lowered,
        )
    )


def clamp_int(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, int(value)))


def normalize_background_structure_controls(
    *,
    composition: str,
    treatment: dict[str, Any],
    original_edit_request: str,
) -> dict[str, int]:
    defaults_by_composition = {
        "skyline": {
            "detailDensity": 58,
            "layerCount": 3,
            "buildingCount": 18,
            "heightVariance": 52,
            "windowDensity": 28,
            "spireFrequency": 16,
            "roofVariation": 34,
        },
        "mountains": {
            "detailDensity": 54,
            "layerCount": 3,
            "buildingCount": 12,
            "heightVariance": 72,
            "windowDensity": 0,
            "spireFrequency": 0,
            "roofVariation": 0,
        },
        "dunes": {
            "detailDensity": 50,
            "layerCount": 3,
            "buildingCount": 10,
            "heightVariance": 46,
            "windowDensity": 0,
            "spireFrequency": 0,
            "roofVariation": 0,
        },
        "clouds": {
            "detailDensity": 46,
            "layerCount": 3,
            "buildingCount": 10,
            "heightVariance": 32,
            "windowDensity": 0,
            "spireFrequency": 0,
            "roofVariation": 0,
        },
        "abstract": {
            "detailDensity": 48,
            "layerCount": 2,
            "buildingCount": 10,
            "heightVariance": 28,
            "windowDensity": 0,
            "spireFrequency": 0,
            "roofVariation": 0,
        },
    }
    defaults = dict(
        defaults_by_composition.get(composition, defaults_by_composition["abstract"])
    )
    if background_request_wants_extra_detail(original_edit_request):
        defaults["detailDensity"] = max(defaults["detailDensity"], 72)
        if composition == "skyline":
            defaults["layerCount"] = max(defaults["layerCount"], 4)
            defaults["buildingCount"] = max(defaults["buildingCount"], 24)
            defaults["heightVariance"] = max(defaults["heightVariance"], 66)
            defaults["windowDensity"] = max(defaults["windowDensity"], 42)
            defaults["spireFrequency"] = max(defaults["spireFrequency"], 22)
            defaults["roofVariation"] = max(defaults["roofVariation"], 46)
    if composition == "skyline" and background_request_mentions_windows(original_edit_request):
        defaults["detailDensity"] = max(defaults["detailDensity"], 78)
        defaults["windowDensity"] = max(defaults["windowDensity"], 58)
    if composition == "skyline" and background_request_mentions_spires(original_edit_request):
        defaults["detailDensity"] = max(defaults["detailDensity"], 78)
        defaults["spireFrequency"] = max(defaults["spireFrequency"], 42)
        defaults["roofVariation"] = max(defaults["roofVariation"], 58)
    if composition == "skyline" and background_request_mentions_depth_layers(original_edit_request):
        defaults["layerCount"] = max(defaults["layerCount"], 4)
        defaults["detailDensity"] = max(defaults["detailDensity"], 74)

    bounds = {
        "detailDensity": (10, 90),
        "layerCount": (2, 4),
        "buildingCount": (8, 32),
        "heightVariance": (10, 95),
        "windowDensity": (0, 100),
        "spireFrequency": (0, 100),
        "roofVariation": (0, 100),
    }
    normalized: dict[str, int] = {}
    for key, (minimum, maximum) in bounds.items():
        raw_value = treatment.get(key)
        if isinstance(raw_value, int):
            normalized[key] = clamp_int(raw_value, minimum, maximum)
        else:
            normalized[key] = clamp_int(defaults[key], minimum, maximum)

    if composition != "skyline":
        normalized["windowDensity"] = 0
        normalized["spireFrequency"] = 0
        normalized["roofVariation"] = 0

    if composition == "skyline" and background_request_wants_extra_detail(
        original_edit_request
    ):
        normalized["layerCount"] = max(normalized["layerCount"], 3)
        normalized["buildingCount"] = max(normalized["buildingCount"], 18)
        normalized["heightVariance"] = max(normalized["heightVariance"], 48)
        normalized["windowDensity"] = max(normalized["windowDensity"], 26)
        normalized["roofVariation"] = max(normalized["roofVariation"], 28)
    if composition == "skyline" and background_request_mentions_windows(
        original_edit_request
    ):
        normalized["windowDensity"] = max(normalized["windowDensity"], 48)
    if composition == "skyline" and background_request_mentions_spires(
        original_edit_request
    ):
        normalized["spireFrequency"] = max(normalized["spireFrequency"], 34)
        normalized["roofVariation"] = max(normalized["roofVariation"], 46)
    return normalized


def default_background_palette(time_of_day: str) -> dict[str, str]:
    palettes = {
        "day": {
            "topColor": "#83BFE6",
            "midColor": "#C9DEF0",
            "bottomColor": "#F0CF9C",
            "silhouetteColor": "#3D5670",
            "accentColor": "#8DD3FF",
            "hazeColor": "#D7EBF7",
            "lightColor": "#FFF0C2",
        },
        "golden-hour": {
            "topColor": "#6DA6D6",
            "midColor": "#F2C789",
            "bottomColor": "#EF9E5B",
            "silhouetteColor": "#38445A",
            "accentColor": "#FFD38A",
            "hazeColor": "#F3D5AB",
            "lightColor": "#FFF0CF",
        },
        "sunset": {
            "topColor": "#27395D",
            "midColor": "#DB7B62",
            "bottomColor": "#FFBF7A",
            "silhouetteColor": "#1C2234",
            "accentColor": "#FFB561",
            "hazeColor": "#E7A07F",
            "lightColor": "#FFD8AE",
        },
        "night": {
            "topColor": "#081728",
            "midColor": "#112743",
            "bottomColor": "#2A3E5A",
            "silhouetteColor": "#0B0F19",
            "accentColor": "#5CBCFF",
            "hazeColor": "#243650",
            "lightColor": "#FFE0A4",
        },
        "stormy": {
            "topColor": "#304862",
            "midColor": "#556779",
            "bottomColor": "#8F8C86",
            "silhouetteColor": "#1B232D",
            "accentColor": "#B8C9D9",
            "hazeColor": "#90A1B0",
            "lightColor": "#DDE6EF",
        },
    }
    return dict(palettes.get(time_of_day, palettes["day"]))


def parse_hex_color(value: str) -> tuple[int, int, int] | None:
    text = (value or "").strip()
    match = re.fullmatch(r"#([0-9a-fA-F]{6})", text)
    if not match:
        return None
    raw = match.group(1)
    return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)


def format_hex_color(rgb: tuple[int, int, int]) -> str:
    r, g, b = rgb
    return f"#{max(0, min(255, r)):02X}{max(0, min(255, g)):02X}{max(0, min(255, b)):02X}"


def color_luminance(hex_color: str) -> float:
    rgb = parse_hex_color(hex_color)
    if not rgb:
        return 0.0
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255.0


def blend_hex_colors(base: str, accent: str, amount: float) -> str:
    base_rgb = parse_hex_color(base)
    accent_rgb = parse_hex_color(accent)
    if not base_rgb or not accent_rgb:
        return base
    weight = max(0.0, min(1.0, amount))
    blended = tuple(
        round(base_channel * (1.0 - weight) + accent_channel * weight)
        for base_channel, accent_channel in zip(base_rgb, accent_rgb)
    )
    return format_hex_color(blended)


def normalize_background_treatment(
    treatment: dict[str, Any],
    original_edit_request: str,
) -> dict[str, Any]:
    inferred_composition = infer_background_composition_from_request(original_edit_request)
    inferred_time = infer_background_time_of_day_from_request(original_edit_request)
    composition = str(treatment.get("composition") or inferred_composition).strip().lower()
    if composition not in {"abstract", "skyline", "mountains", "dunes", "clouds"}:
        composition = inferred_composition
    if inferred_composition != "abstract":
        composition = inferred_composition

    time_of_day = str(treatment.get("timeOfDay") or inferred_time).strip().lower()
    if time_of_day not in {"day", "golden-hour", "sunset", "night", "stormy"}:
        time_of_day = inferred_time
    if inferred_time != "day":
        time_of_day = inferred_time

    intensity = str(treatment.get("intensity") or "balanced").strip().lower()
    if intensity not in {"soft", "balanced", "dramatic"}:
        intensity = "balanced"

    palette = default_background_palette(time_of_day)
    for key in (
        "topColor",
        "midColor",
        "bottomColor",
        "silhouetteColor",
        "accentColor",
        "hazeColor",
        "lightColor",
    ):
        value = treatment.get(key)
        if isinstance(value, str) and parse_hex_color(value):
            palette[key] = value.upper()

    luminances = [
        color_luminance(palette["topColor"]),
        color_luminance(palette["midColor"]),
        color_luminance(palette["bottomColor"]),
    ]
    if (
        not background_request_explicitly_allows_pale_palette(original_edit_request)
        and max(luminances) - min(luminances) < 0.14
        and sum(luminances) / len(luminances) > 0.72
    ):
        palette = default_background_palette(time_of_day)

    if intensity == "dramatic":
        palette["topColor"] = blend_hex_colors(palette["topColor"], "#000814", 0.18)
        palette["silhouetteColor"] = blend_hex_colors(palette["silhouetteColor"], "#000000", 0.22)
        palette["accentColor"] = blend_hex_colors(palette["accentColor"], "#FFD38A", 0.16)
    elif intensity == "soft":
        palette["topColor"] = blend_hex_colors(palette["topColor"], "#FFFFFF", 0.08)
        palette["hazeColor"] = blend_hex_colors(palette["hazeColor"], "#FFFFFF", 0.18)

    horizon_height = treatment.get("horizonHeightPct")
    target_selector = (
        treatment.get("targetSelector").strip()
        if isinstance(treatment.get("targetSelector"), str)
        else ""
    )
    structure = normalize_background_structure_controls(
        composition=composition,
        treatment=treatment,
        original_edit_request=original_edit_request,
    )
    return {
        "composition": composition,
        "timeOfDay": time_of_day,
        "intensity": intensity,
        "targetSelector": target_selector,
        "horizonHeightPct": int(horizon_height)
        if isinstance(horizon_height, int)
        else 42,
        **palette,
        **structure,
    }


def serialize_artifact_background_treatment_config(
    treatment_config: dict[str, Any],
) -> str:
    return json.dumps(treatment_config, separators=(",", ":"), ensure_ascii=True).replace(
        "</", "<\\/"
    )


def extract_artifact_background_treatment_config_text(html: str) -> str:
    pattern = re.compile(
        rf"<script\b[^>]*\bid\s*=\s*['\"]{re.escape(ARTIFACT_BACKGROUND_TREATMENT_SCRIPT_ID)}['\"][^>]*>(?P<body>[\s\S]*?)</script>",
        re.IGNORECASE,
    )
    match = pattern.search(html or "")
    if not match:
        return ""
    return (match.group("body") or "").strip()


def parse_artifact_background_treatment_config(html: str) -> dict[str, Any]:
    text = extract_artifact_background_treatment_config_text(html)
    parsed = try_parse_json(text) if text else None
    return parsed if isinstance(parsed, dict) else {}


def upsert_artifact_background_treatment_config(
    html: str, treatment_config: dict[str, Any]
) -> str:
    script_tag = (
        f'<script id="{ARTIFACT_BACKGROUND_TREATMENT_SCRIPT_ID}" type="application/json">'
        f"{serialize_artifact_background_treatment_config(treatment_config)}</script>"
    )
    pattern = re.compile(
        rf"<script\b[^>]*\bid\s*=\s*['\"]{re.escape(ARTIFACT_BACKGROUND_TREATMENT_SCRIPT_ID)}['\"][^>]*>[\s\S]*?</script>",
        re.IGNORECASE,
    )
    if pattern.search(html or ""):
        return pattern.sub(script_tag, html, count=1)
    if re.search(r"</head>", html, re.IGNORECASE):
        return re.sub(r"</head>", f"{script_tag}\n</head>", html, count=1, flags=re.IGNORECASE)
    if re.search(r"<body\b[^>]*>", html, re.IGNORECASE):
        return re.sub(
            r"<body\b[^>]*>",
            lambda match: f"{match.group(0)}\n{script_tag}",
            html,
            count=1,
            flags=re.IGNORECASE,
        )
    if re.search(r"</body>", html, re.IGNORECASE):
        return re.sub(r"</body>", f"{script_tag}\n</body>", html, count=1, flags=re.IGNORECASE)
    return f"{script_tag}\n{html}"


def build_background_base_gradient(treatment: dict[str, Any]) -> str:
    return (
        "linear-gradient(180deg, "
        f"{treatment['topColor']} 0%, "
        f"{treatment['midColor']} 46%, "
        f"{treatment['bottomColor']} 100%)"
    )


def build_background_composition_rule(treatment: dict[str, Any]) -> str:
    composition = treatment["composition"]
    horizon = max(18, min(78, int(treatment["horizonHeightPct"])))
    silhouette = treatment["silhouetteColor"]
    accent = treatment["accentColor"]
    haze = treatment["hazeColor"]
    if composition == "skyline":
        return "\n".join(
            [
                "content: \"\";",
                "position: absolute;",
                "left: 0;",
                "right: 0;",
                "bottom: 0;",
                f"height: {horizon}%;",
                "pointer-events: none;",
                "z-index: 0;",
                "opacity: 0.95;",
                "background:",
                f"  linear-gradient(180deg, {haze}22 0%, transparent 18%),",
                "  linear-gradient(90deg,",
                f"    {silhouette} 0 6%,",
                "    transparent 6% 8%,",
                f"    {silhouette} 8% 15%,",
                "    transparent 15% 17%,",
                f"    {silhouette} 17% 23%,",
                "    transparent 23% 26%,",
                f"    {silhouette} 26% 34%,",
                "    transparent 34% 37%,",
                f"    {silhouette} 37% 45%,",
                "    transparent 45% 48%,",
                f"    {silhouette} 48% 56%,",
                "    transparent 56% 59%,",
                f"    {silhouette} 59% 67%,",
                "    transparent 67% 70%,",
                f"    {silhouette} 70% 79%,",
                "    transparent 79% 82%,",
                f"    {silhouette} 82% 100%),",
                f"  linear-gradient(0deg, {accent}24 0%, transparent 28%);",
            ]
        )
    if composition == "mountains":
        return "\n".join(
            [
                "content: \"\";",
                "position: absolute;",
                "inset: 0;",
                "pointer-events: none;",
                "z-index: 0;",
                "opacity: 0.92;",
                "background:",
                f"  linear-gradient(140deg, transparent 0 38%, {silhouette} 38% 58%, transparent 58% 100%),",
                f"  linear-gradient(35deg, transparent 0 42%, {blend_hex_colors(silhouette, accent, 0.18)} 42% 61%, transparent 61% 100%),",
                f"  linear-gradient(155deg, transparent 0 54%, {silhouette} 54% 72%, transparent 72% 100%),",
                f"  linear-gradient(25deg, transparent 0 60%, {blend_hex_colors(silhouette, '#FFFFFF', 0.1)} 60% 76%, transparent 76% 100%),",
                f"  linear-gradient(0deg, {haze}44 0%, transparent {max(24, horizon - 10)}%);",
                f"background-position: left bottom, 18% bottom, 62% bottom, 72% bottom, center bottom;",
                "background-size: 48% 56%, 38% 46%, 46% 52%, 34% 42%, 100% 100%;",
                "background-repeat: no-repeat;",
            ]
        )
    if composition == "dunes":
        return "\n".join(
            [
                "content: \"\";",
                "position: absolute;",
                "left: 0;",
                "right: 0;",
                "bottom: 0;",
                "top: 34%;",
                "pointer-events: none;",
                "z-index: 0;",
                "opacity: 0.95;",
                "background:",
                f"  radial-gradient(140% 70% at 8% 100%, {blend_hex_colors(treatment['bottomColor'], accent, 0.18)} 0 38%, transparent 39%),",
                f"  radial-gradient(125% 62% at 40% 100%, {blend_hex_colors(treatment['bottomColor'], silhouette, 0.12)} 0 34%, transparent 35%),",
                f"  radial-gradient(135% 68% at 74% 100%, {blend_hex_colors(treatment['bottomColor'], accent, 0.1)} 0 37%, transparent 38%),",
                f"  linear-gradient(0deg, {haze}55 0%, transparent 42%);",
            ]
        )
    if composition == "clouds":
        return "\n".join(
            [
                "content: \"\";",
                "position: absolute;",
                "inset: 0;",
                "pointer-events: none;",
                "z-index: 0;",
                "opacity: 0.82;",
                "background:",
                f"  radial-gradient(24% 12% at 18% 20%, {haze}AA 0 58%, transparent 60%),",
                f"  radial-gradient(28% 14% at 44% 24%, {haze}99 0 58%, transparent 60%),",
                f"  radial-gradient(26% 13% at 72% 18%, {haze}88 0 58%, transparent 60%),",
                f"  linear-gradient(180deg, {blend_hex_colors(haze, '#FFFFFF', 0.18)}55 0%, transparent {max(26, horizon)}%);",
            ]
        )
    return "\n".join(
        [
            "content: \"\";",
            "position: absolute;",
            "inset: 0;",
            "pointer-events: none;",
            "z-index: 0;",
            "opacity: 0.88;",
            "background:",
            f"  radial-gradient(circle at 18% 24%, {accent}44 0 10%, transparent 11%),",
            f"  radial-gradient(circle at 76% 28%, {haze}55 0 12%, transparent 13%),",
            f"  linear-gradient(135deg, transparent 0 46%, {silhouette}1E 46% 58%, transparent 58% 100%),",
            f"  linear-gradient(0deg, {haze}44 0%, transparent {max(28, horizon)}%);",
        ]
    )


def build_background_atmosphere_rule(treatment: dict[str, Any]) -> str:
    haze = treatment["hazeColor"]
    light = treatment["lightColor"]
    top = treatment["topColor"]
    intensity = treatment["intensity"]
    overlay_opacity = {"soft": "0.58", "balanced": "0.72", "dramatic": "0.86"}[intensity]
    return "\n".join(
        [
            "content: \"\";",
            "position: absolute;",
            "inset: 0;",
            "pointer-events: none;",
            "z-index: 0;",
            f"opacity: {overlay_opacity};",
            "background:",
            f"  radial-gradient(circle at 50% 20%, {light}33 0 9%, transparent 10%),",
            f"  linear-gradient(180deg, {blend_hex_colors(top, '#FFFFFF', 0.14)}22 0%, transparent 24%),",
            f"  linear-gradient(0deg, {haze}30 0%, transparent 26%);",
            "mix-blend-mode: screen;",
        ]
    )


def apply_background_treatment_to_artifact_html(
    *,
    current_html: str,
    treatment: dict[str, Any],
    original_edit_request: str,
) -> tuple[str, list[str]]:
    normalized = normalize_background_treatment(treatment, original_edit_request)
    requested_selector = normalized.get("targetSelector") or "#background"
    chosen_target_selector = choose_artifact_background_treatment_target_selector(
        current_html,
        requested_selector,
    )
    scene_root_candidates = [
        candidate
        for candidate in extract_artifact_scene_root_selector_candidates(current_html)
        if candidate not in {"body", "html"}
    ]
    scene_root_selector = choose_scene_root_selector_candidate(scene_root_candidates)
    treatment_config = {
        **normalized,
        "targetSelector": chosen_target_selector or "",
        "sceneRootSelector": scene_root_selector or "",
        "allowPalePalette": background_request_explicitly_allows_pale_palette(
            original_edit_request
        ),
        "requestText": (original_edit_request or "").strip(),
        "runtimeMode": "overlay",
    }
    working = upsert_artifact_background_treatment_config(current_html, treatment_config)
    issues = validate_background_edit_result(
        original_html=current_html,
        edited_html=working,
        original_edit_request=original_edit_request,
    )
    return (working, issues) if issues else (working, [])


def describe_background_time_of_day(time_of_day: str) -> str:
    mapping = {
        "day": "daytime",
        "golden-hour": "golden-hour",
        "sunset": "sunset",
        "night": "nighttime",
        "stormy": "stormy",
    }
    return mapping.get((time_of_day or "").strip().lower(), "daytime")


def build_applied_background_treatment_assistant_message(
    treatment_config: dict[str, Any], original_edit_request: str
) -> str:
    composition = str(treatment_config.get("composition") or "abstract").strip().lower()
    time_of_day = describe_background_time_of_day(
        str(treatment_config.get("timeOfDay") or "day").strip().lower()
    )
    intensity = str(treatment_config.get("intensity") or "balanced").strip().lower()
    intensity_text = {
        "soft": "soft",
        "balanced": "layered",
        "dramatic": "dramatic",
    }.get(intensity, "layered")
    if composition == "skyline":
        layer_count = clamp_int(int(treatment_config.get("layerCount") or 3), 2, 4)
        building_count = clamp_int(
            int(treatment_config.get("buildingCount") or 18), 8, 32
        )
        height_variance = clamp_int(
            int(treatment_config.get("heightVariance") or 52), 10, 95
        )
        window_density = clamp_int(
            int(treatment_config.get("windowDensity") or 0), 0, 100
        )
        spire_frequency = clamp_int(
            int(treatment_config.get("spireFrequency") or 0), 0, 100
        )
        roof_variation = clamp_int(
            int(treatment_config.get("roofVariation") or 0), 0, 100
        )
        features = [f"{layer_count} skyline layers"]
        if building_count >= 24:
            features.append("dense varied buildings")
        elif building_count >= 16:
            features.append("multiple varied buildings")
        else:
            features.append("varied building silhouettes")
        if height_variance >= 42:
            features.append("noticeable height variation")
        if window_density >= 22:
            features.append("visible window grids")
        if roof_variation >= 28:
            features.append("varied rooflines")
        if spire_frequency >= 24:
            features.append("spires and antenna accents")
        return (
            f"Applied a {intensity_text} {time_of_day} skyline background with "
            + ", ".join(features)
            + ", while keeping the cars and layout unchanged."
        )
    if composition == "mountains":
        return (
            f"Applied a {intensity_text} {time_of_day} mountain background with layered peaks "
            "while keeping the cars and layout unchanged."
        )
    if composition == "dunes":
        return (
            f"Applied a {intensity_text} {time_of_day} dune background with layered sand shapes "
            "while keeping the cars and layout unchanged."
        )
    if composition == "clouds":
        return (
            f"Applied a {intensity_text} {time_of_day} cloud background with layered haze "
            "while keeping the cars and layout unchanged."
        )
    return (
        f"Applied a {intensity_text} {time_of_day} atmospheric background treatment "
        "while keeping the cars and layout unchanged."
    )


def extract_background_edit_signature(html: str) -> str:
    candidates = extract_artifact_background_selector_candidates(html)
    snippets = extract_artifact_background_style_snippets(html)
    pseudo_snippets: list[str] = []
    treatment_config = extract_artifact_background_treatment_config_text(html)
    for candidate in candidates:
        for pseudo in ("::before", "::after"):
            selector = f"{candidate}{pseudo}"
            selector_re = re.compile(rf"{re.escape(selector)}\s*\{{", re.IGNORECASE)
            for style_match in ARTIFACT_STYLE_TAG_RE.finditer(html):
                style_body = style_match.group("body") or ""
                match = selector_re.search(style_body)
                if not match:
                    continue
                brace_start = match.end() - 1
                brace_end = find_matching_delimiter(style_body, brace_start, "{", "}")
                if brace_end < 0:
                    continue
                pseudo_snippets.append(style_body[match.start(): brace_end + 1].strip())
                break
    parts = snippets + pseudo_snippets
    if treatment_config:
        parts.append(treatment_config)
    return "\n".join(parts)


def validate_background_edit_result(
    *,
    original_html: str,
    edited_html: str,
    original_edit_request: str,
) -> list[str]:
    if not is_background_visual_edit_request(original_edit_request):
        return []
    original_signature = extract_background_edit_signature(original_html)
    edited_signature = extract_background_edit_signature(edited_html)
    if edited_signature.strip() == original_signature.strip():
        return ["background edit did not materially change the background treatment."]
    if background_request_explicitly_allows_pale_palette(original_edit_request):
        return []
    colors = re.findall(r"#[0-9A-Fa-f]{6}", edited_signature)
    if len(colors) >= 3:
        luminances = [color_luminance(color) for color in colors[:8]]
        if max(luminances) - min(luminances) < 0.1 and sum(luminances) / len(luminances) > 0.74:
            return ["background edit appears visually washed out or too close to blank."]
    config = parse_artifact_background_treatment_config(edited_html)
    if (
        str(config.get("composition") or "").strip().lower() == "skyline"
        and background_request_wants_extra_detail(original_edit_request)
    ):
        if int(config.get("layerCount") or 0) < 3:
            return ["background edit still lacks skyline depth layers."]
        if int(config.get("buildingCount") or 0) < 16:
            return ["background edit still lacks skyline density."]
        if int(config.get("heightVariance") or 0) < 40:
            return ["background edit still lacks skyline height variation."]
        if int(config.get("windowDensity") or 0) < 18:
            return ["background edit still lacks visible window detail."]
        if int(config.get("roofVariation") or 0) < 20:
            return ["background edit still lacks varied roofline detail."]
    if (
        str(config.get("composition") or "").strip().lower() == "skyline"
        and background_request_mentions_spires(original_edit_request)
        and int(config.get("spireFrequency") or 0) < 22
    ):
        return ["background edit still lacks the requested spire or antenna detail."]
    return []


def should_fallback_to_generic_patch_after_background_treatment_failure(
    issues: list[str],
) -> bool:
    normalized = [issue.strip().lower() for issue in issues if issue and issue.strip()]
    if not normalized:
        return True
    return all(
        issue in {
            "background treatment planner returned no usable treatment.",
            "no suitable background selector was found in the current artifact html.",
        }
        for issue in normalized
    )


def attempt_builtin_cityscape_background_patch(
    *,
    current_html: str,
    original_edit_request: str,
) -> tuple[str, str]:
    if artifact_edit_request_requires_external_asset_url(original_edit_request):
        return "", ""
    if not is_city_background_edit_request(original_edit_request):
        return "", ""
    background_candidates = [
        candidate
        for candidate in extract_artifact_background_selector_candidates(current_html)
        if candidate not in {"body", "html"}
    ]
    target_selector = choose_background_selector_candidate("#city-bg", background_candidates)
    if not target_selector:
        return "", ""

    working = current_html
    for property_name, value in (
        ("position", "relative"),
        ("overflow", "hidden"),
        ("isolation", "isolate"),
        (
            "background",
            "linear-gradient(180deg, #0f2138 0%, #31506f 44%, #f2b77d 100%)",
        ),
    ):
        working = ensure_css_property_in_artifact_html(
            working,
            target_selector,
            property_name,
            value,
        )

    skyline_rule = "\n".join(
        [
            "content: \"\";",
            "position: absolute;",
            "left: 0;",
            "right: 0;",
            "bottom: 0;",
            "height: 46%;",
            "pointer-events: none;",
            "z-index: 0;",
            "opacity: 0.92;",
            "background:",
            "  linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 18%),",
            "  linear-gradient(90deg,",
            "    rgba(15,20,34,0.96) 0 5%,",
            "    transparent 5% 7%,",
            "    rgba(18,24,40,0.96) 7% 13%,",
            "    transparent 13% 16%,",
            "    rgba(12,18,32,0.95) 16% 21%,",
            "    transparent 21% 24%,",
            "    rgba(16,22,36,0.96) 24% 31%,",
            "    transparent 31% 34%,",
            "    rgba(19,25,43,0.97) 34% 41%,",
            "    transparent 41% 44%,",
            "    rgba(14,21,35,0.96) 44% 51%,",
            "    transparent 51% 54%,",
            "    rgba(20,27,46,0.97) 54% 62%,",
            "    transparent 62% 65%,",
            "    rgba(17,24,42,0.96) 65% 72%,",
            "    transparent 72% 75%,",
            "    rgba(13,19,33,0.96) 75% 83%,",
            "    transparent 83% 86%,",
            "    rgba(18,24,40,0.96) 86% 100%);",
        ]
    )
    glow_rule = "\n".join(
        [
            "content: \"\";",
            "position: absolute;",
            "inset: 0;",
            "pointer-events: none;",
            "z-index: 0;",
            "opacity: 0.82;",
            "background:",
            "  radial-gradient(circle at 14% 22%, rgba(255,221,170,0.22) 0 1.1%, transparent 1.2%),",
            "  radial-gradient(circle at 26% 18%, rgba(255,210,150,0.16) 0 1%, transparent 1.1%),",
            "  radial-gradient(circle at 39% 28%, rgba(255,229,186,0.18) 0 1%, transparent 1.1%),",
            "  radial-gradient(circle at 58% 20%, rgba(255,215,156,0.18) 0 1%, transparent 1.1%),",
            "  radial-gradient(circle at 74% 25%, rgba(255,228,180,0.18) 0 1%, transparent 1.1%),",
            "  radial-gradient(circle at 86% 19%, rgba(255,214,148,0.16) 0 1%, transparent 1.1%),",
            "  linear-gradient(180deg, rgba(255,189,120,0.18) 0%, rgba(255,189,120,0.02) 34%, rgba(255,255,255,0) 55%),",
            "  linear-gradient(0deg, rgba(255,210,150,0.12) 0%, rgba(255,210,150,0) 28%);",
            "mix-blend-mode: screen;",
        ]
    )
    working = upsert_css_rule_in_artifact_html(
        working,
        f"{target_selector}::before",
        skyline_rule,
    )
    working = upsert_css_rule_in_artifact_html(
        working,
        f"{target_selector}::after",
        glow_rule,
    )
    return (
        working,
        "Applied a cityscape-style background treatment while keeping the cars and layout unchanged.",
    )


def attempt_builtin_layout_orientation_patch(
    *,
    current_html: str,
    current_package: dict[str, Any] | None,
    original_edit_request: str,
) -> tuple[str, dict[str, Any] | None, str]:
    if not is_layout_orientation_artifact_edit_request(original_edit_request):
        return "", current_package, ""
    target_orientation = infer_requested_artifact_layout_orientation(
        original_edit_request
    )
    if target_orientation not in {"horizontal", "vertical"}:
        return "", current_package, ""

    layout_candidates = [
        candidate
        for candidate in extract_artifact_layout_selector_candidates(current_html)
        if candidate not in {"body", "html"}
    ]
    if not layout_candidates:
        scene_root_candidates = [
            candidate
            for candidate in extract_artifact_scene_root_selector_candidates(current_html)
            if candidate not in {"body", "html"}
        ]
        fallback_selector = choose_scene_root_selector_candidate(scene_root_candidates)
        if fallback_selector:
            layout_candidates = [fallback_selector]
    if not layout_candidates:
        return "", current_package, ""

    preferred_selector = choose_layout_selector_candidate(
        "#poll-options", layout_candidates
    )
    ordered_candidates: list[str] = []
    if preferred_selector:
        ordered_candidates.append(preferred_selector)
    ordered_candidates.extend(
        candidate
        for candidate in layout_candidates
        if candidate not in ordered_candidates
    )

    for target_selector in ordered_candidates[:3]:
        plan = {
            "assistantMessage": "",
            "edits": [
                {
                    "type": "set_css_property",
                    "file": ARTIFACT_PACKAGE_STYLES_FILE,
                    "selector": target_selector,
                    "property": "display",
                    "value": "flex",
                },
                {
                    "type": "set_css_property",
                    "file": ARTIFACT_PACKAGE_STYLES_FILE,
                    "selector": target_selector,
                    "property": "flex-direction",
                    "value": "column" if target_orientation == "vertical" else "row",
                },
                {
                    "type": "set_css_property",
                    "file": ARTIFACT_PACKAGE_STYLES_FILE,
                    "selector": target_selector,
                    "property": "align-items",
                    "value": "stretch",
                },
            ],
        }
        patched_html, patched_package, issues = apply_artifact_patch_plan_to_package(
            html=current_html,
            artifact_package=current_package,
            plan=plan,
            max_edits=ARTIFACT_PATCH_MAX_EDITS,
        )
        if issues:
            continue
        if not patched_html or patched_html.strip() == current_html.strip():
            continue
        orientation_text = (
            "vertical" if target_orientation == "vertical" else "horizontal"
        )
        return (
            patched_html,
            patched_package,
            f"Applied a targeted layout patch so poll options align {orientation_text}.",
        )
    return "", current_package, ""


def extract_artifact_background_selector_candidates(html: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def remember(selector: str) -> None:
        normalized = selector.strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    if re.search(r"data-prezo-background-layer\b", html, re.IGNORECASE):
        remember("[data-prezo-background-layer]")
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
                    or "data-prezo-background-layer" in lowered
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


def ensure_css_property_in_artifact_html(
    html: str, selector: str, property_name: str, value: str
) -> str:
    updated_html, changed = set_css_property_in_artifact_html(
        html,
        selector,
        property_name,
        value,
    )
    if changed:
        return updated_html
    rule_body = f"{property_name}: {value};"
    return upsert_css_rule_in_artifact_html(updated_html, selector, rule_body)


def upsert_css_rule_in_artifact_html(html: str, selector: str, rule_body: str) -> str:
    for match in ARTIFACT_STYLE_TAG_RE.finditer(html):
        style_body = match.group("body") or ""
        updated_body, changed = upsert_css_rule_in_css(style_body, selector, rule_body)
        if not changed:
            continue
        body_start, body_end = match.span("body")
        return f"{html[:body_start]}{updated_body}{html[body_end:]}"

    rule = build_css_rule(selector, rule_body)
    head_close = re.search(r"</head\s*>", html, re.IGNORECASE)
    if head_close:
        return f"{html[:head_close.start()]}<style>\n{rule}\n</style>\n{html[head_close.start():]}"
    body_open = re.search(r"<body\b[^>]*>", html, re.IGNORECASE)
    if body_open:
        insert_at = body_open.end()
        return f"{html[:insert_at]}\n<style>\n{rule}\n</style>{html[insert_at:]}"
    return f"<style>\n{rule}\n</style>\n{html}"


def upsert_css_rule_in_css(css_text: str, selector: str, rule_body: str) -> tuple[str, bool]:
    selector_re = re.compile(rf"(^|}})\s*{re.escape(selector)}\s*\{{", re.IGNORECASE | re.MULTILINE)
    match = selector_re.search(css_text)
    if match:
        brace_start = css_text.find("{", match.start())
        if brace_start >= 0:
            brace_end = find_matching_delimiter(css_text, brace_start, "{", "}")
            if brace_end >= 0:
                return (
                    f"{css_text[:match.start()]}{build_css_rule(selector, rule_body)}{css_text[brace_end + 1:]}",
                    True,
                )

    suffix = "" if not css_text.strip() or css_text.endswith("\n") else "\n"
    return f"{css_text}{suffix}{build_css_rule(selector, rule_body)}\n", True


def build_css_rule(selector: str, rule_body: str) -> str:
    lines = [line.rstrip() for line in (rule_body or "").splitlines() if line.strip()]
    if not lines:
        return f"{selector} {{\n}}\n"
    formatted = "\n".join(f"  {line.strip()}" for line in lines)
    return f"{selector} {{\n{formatted}\n}}"


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


def detect_append_only_option_render_issue(script_body: str) -> str | None:
    normalized = (script_body or "").strip()
    if not normalized:
        return None
    lowered = normalized.lower()
    if "prezosetpollrenderer" not in lowered and "prezorenderpoll" not in lowered:
        return None
    if not re.search(
        r"(?:poll\s*\.\s*options|state\s*\.\s*poll\s*\.\s*options|options)\s*\.\s*forEach\s*\(",
        normalized,
        re.IGNORECASE,
    ):
        return None
    if "appendChild" not in normalized or "createElement" not in normalized:
        return None
    reconciliation_markers = (
        r"\.replaceChildren\s*\(",
        r"\.innerHTML\s*=\s*['\"]\s*['\"]",
        r"\.textContent\s*=\s*['\"]\s*['\"]",
        r"data-option-id",
        r"data-prezo-option-id",
        r"\browsById\b",
        r"\browById\b",
        r"\boptionNodesById\b",
        r"\bmountedRows\b",
        r"\bnew Map\s*\(",
    )
    if any(
        re.search(marker, normalized, re.IGNORECASE)
        for marker in reconciliation_markers
    ):
        return None
    return (
        "script appears to append option rows on each render without clear keyed reconciliation; "
        "repeated poll updates can duplicate rows."
    )


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
        append_only_issue = detect_append_only_option_render_issue(script_body)
        if append_only_issue:
            issues.append(append_only_issue)
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
    artifact_context.pop("currentArtifactPackage", None)
    artifact_context.pop("currentArtifactFullPackage", None)
    artifact_context.pop("failedArtifactPackage", None)
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
