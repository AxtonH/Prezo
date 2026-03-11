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
DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-6"
ANTHROPIC_API_BASE = "https://api.anthropic.com/v1"
ANTHROPIC_VERSION = "2023-06-01"
ANTHROPIC_ARTIFACT_MAX_TOKENS = 12000
ANTHROPIC_ARTIFACT_REPAIR_MAX_TOKENS = 12000
ARTIFACT_MAX_REPAIR_ATTEMPTS = 3
ARTIFACT_EDIT_MAX_REPAIR_ATTEMPTS = 1
ARTIFACT_BUILD_MAX_REPAIR_ATTEMPTS = 2
ARTIFACT_REPAIR_MODE_MAX_REPAIR_ATTEMPTS = 1
ARTIFACT_MIN_CALL_TIMEOUT_SECONDS = 15.0
ARTIFACT_CONTEXT_DIRECT_CHAR_LIMIT = 24000
ARTIFACT_CONTEXT_HEAD_CHAR_LIMIT = 9000
ARTIFACT_CONTEXT_TAIL_CHAR_LIMIT = 4000
ARTIFACT_CONTEXT_COMBINED_CHAR_LIMIT = 32000
ARTIFACT_LIVE_HOOK_CONTEXT_CHAR_LIMIT = 12000
ARTIFACT_RECENT_EDIT_REQUEST_LIMIT = 4
ARTIFACT_RECENT_EDIT_REQUEST_CHAR_LIMIT = 280
ARTIFACT_SCRIPT_RE = re.compile(
    r"<script\b[^>]*>(?P<body>[\s\S]*?)</script>", re.IGNORECASE
)
ARTIFACT_SCRIPT_OPEN_RE = re.compile(r"<script\b", re.IGNORECASE)
ARTIFACT_SCRIPT_CLOSE_RE = re.compile(r"</script>", re.IGNORECASE)
ARTIFACT_HTML_SHAPE_RE = re.compile(
    r"<(?:!doctype|html|body|main|section|article|div|style|script)\b",
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
        "- Preserve the current concept, layout, visual metaphor, typography, palette, and motion unless the user explicitly asks to change them.",
        "- For local requests such as title size, spacing, readability, color, motion, or positioning, do not redesign unrelated parts of the artifact.",
        "- In edit and repair mode, preserve existing container hierarchy, ids, classes, data attributes, and selector targets used by the current artifact unless the user explicitly asks for a structural redesign.",
        "- Prefer CSS, copy, spacing, animation tuning, and small DOM adjustments over replacing major sections of the artifact.",
        "- Do not rename, remove, or relocate containers that current render logic depends on unless you also update that logic safely and equivalently.",
        "- If context.artifact.recentEditRequests is present, use it to maintain continuity, but prioritize the latest request over earlier ones.",
        "- Preserve working live-data behavior, stable layout, and successful design decisions from the current artifact unless the user explicitly asks for a broader redesign.",
        "- The edited artifact must still consume host-delivered live poll state and must still call window.prezoSetPollRenderer(fn), define window.prezoRenderPoll(state), or use an equivalent runtime-approved render registration hook from the existing host contract.",
        "Update requirements:",
        "- Poll changes must animate smoothly (about 200ms-500ms easing) with no flicker.",
        "- Do not rebuild or re-mount the full scene on each update.",
        "- Reconcile by option id and update only changed elements when possible.",
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


async def request_anthropic_text(
    *,
    api_key: str,
    model: str,
    system_instruction: str,
    prompt_text: str,
    temperature: float,
    max_tokens: int,
    timeout_seconds: float,
) -> tuple[str, str]:
    base_url = resolve_anthropic_base_url()
    endpoint = f"{base_url}/messages"
    body = {
        "model": model,
        "system": system_instruction,
        "messages": [
            {
                "role": "user", "content": prompt_text
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
            detail=(
                f"Unable to reach Anthropic API at {base_url}: "
                f"{exc.__class__.__name__} after {timeout_seconds:.0f}s."
            ),
        ) from exc
    except httpx.RequestError as exc:
        detail = str(exc).strip() or exc.__class__.__name__
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to reach Anthropic API at {base_url}: {detail}",
        ) from exc

    raw_payload: Any = {}
    if response.content:
        try:
            raw_payload = response.json()
        except ValueError:
            raw_payload = {}
    if response.status_code >= 400:
        detail = extract_anthropic_error(raw_payload) or f"Anthropic request failed ({response.status_code})"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    text = extract_anthropic_text(raw_payload)
    stop_reason = extract_anthropic_stop_reason(raw_payload)
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Anthropic response did not include text content.",
        )
    return text, stop_reason


@router.post("/poll-game-edit-plan", response_model=PollGameEditPlanResponse)
async def create_poll_game_edit_plan(
    payload: PollGameEditPlanRequest,
) -> PollGameEditPlanResponse:
    api_key = (settings.anthropic_api_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI editor is not configured. Set ANTHROPIC_API_KEY on backend.",
        )

    requested_model = normalize_anthropic_model_name(payload.model)
    configured_model = normalize_anthropic_model_name(settings.anthropic_model)
    model = requested_model or configured_model or DEFAULT_ANTHROPIC_MODEL
    text, _stop_reason = await request_anthropic_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_SYSTEM_INSTRUCTION,
        prompt_text=json.dumps(
            {"prompt": payload.prompt, "context": payload.context},
            indent=2,
        ),
        temperature=0.2,
        max_tokens=1400,
        timeout_seconds=settings.anthropic_plan_timeout_seconds,
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
    api_key = (settings.anthropic_api_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI editor is not configured. Set ANTHROPIC_API_KEY on backend.",
        )

    requested_model = normalize_anthropic_model_name(payload.model)
    configured_model = normalize_anthropic_model_name(settings.anthropic_model)
    model = requested_model or configured_model or DEFAULT_ANTHROPIC_MODEL
    artifact_context = (
        payload.context.get("artifact")
        if isinstance(payload.context.get("artifact"), dict)
        else {}
    )
    request_mode = str(artifact_context.get("requestMode") or "").strip().lower()
    model_context = prepare_artifact_context_for_model(payload.context, request_mode)
    deadline = time.monotonic() + max(
        settings.anthropic_artifact_total_timeout_seconds,
        ARTIFACT_MIN_CALL_TIMEOUT_SECONDS,
    )
    if request_mode == "repair":
        temperature = 0.2
        timeout_seconds = settings.anthropic_artifact_repair_timeout_seconds
    elif request_mode == "edit":
        temperature = 0.2
        timeout_seconds = settings.anthropic_artifact_edit_timeout_seconds
    else:
        temperature = 0.8
        timeout_seconds = settings.anthropic_artifact_build_timeout_seconds
    timeout_seconds = min(
        timeout_seconds,
        ensure_artifact_time_budget_remaining(deadline, "starting artifact generation"),
    )
    text, stop_reason = await request_anthropic_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
        prompt_text=json.dumps(
            {"prompt": payload.prompt, "context": model_context},
            indent=2,
        ),
        temperature=temperature,
        max_tokens=ANTHROPIC_ARTIFACT_MAX_TOKENS,
        timeout_seconds=timeout_seconds,
    )

    html = normalize_poll_game_artifact_html(text)
    html = restore_artifact_live_hooks_if_missing(html, payload.context)
    if not html:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Anthropic response did not include artifact HTML.",
        )
    validation_issues = validate_poll_game_artifact_html(html)
    if stop_reason in {"max_tokens", "model_context_window_exceeded"}:
        validation_issues.insert(
            0,
            "artifact output appears truncated before completion.",
        )
    max_repair_attempts = resolve_artifact_max_repair_attempts(request_mode)
    repair_attempts = 0
    while validation_issues and repair_attempts < max_repair_attempts:
        repaired_html = await attempt_artifact_repair(
            api_key=api_key,
            model=model,
            original_prompt=payload.prompt,
            context=model_context,
            html=html,
            validation_issues=validation_issues,
            timeout_seconds=min(
                settings.anthropic_artifact_repair_timeout_seconds,
                ensure_artifact_time_budget_remaining(deadline, "repairing artifact output"),
            ),
        )
        if not repaired_html:
            break
        next_html = restore_artifact_live_hooks_if_missing(repaired_html, payload.context)
        if next_html.strip() == html.strip():
            break
        html = next_html
        validation_issues = validate_poll_game_artifact_html(html)
        repair_attempts += 1
    if validation_issues:
        issue_text = "; ".join(validation_issues[:4])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Artifact request failed validation: {issue_text}",
        )

    return PollGameArtifactBuildResponse(
        html=html,
        model=model,
        assistantMessage="Artifact ready. Keep prompting to iterate.",
    )


@router.post("/poll-game-artifact-answer", response_model=PollGameArtifactAssistantResponse)
async def create_poll_game_artifact_answer(
    payload: PollGameArtifactBuildRequest,
) -> PollGameArtifactAssistantResponse:
    api_key = (settings.anthropic_api_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI editor is not configured. Set ANTHROPIC_API_KEY on backend.",
        )

    requested_model = normalize_anthropic_model_name(payload.model)
    configured_model = normalize_anthropic_model_name(settings.anthropic_model)
    model = requested_model or configured_model or DEFAULT_ANTHROPIC_MODEL
    text, _stop_reason = await request_anthropic_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_ASSISTANT_SYSTEM_INSTRUCTION,
        prompt_text=json.dumps(
            {"prompt": payload.prompt, "context": payload.context},
            indent=2,
        ),
        temperature=0.25,
        max_tokens=900,
        timeout_seconds=settings.anthropic_artifact_answer_timeout_seconds,
    )

    answer = (text or "").strip()
    if not answer:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Artifact assistant returned an empty answer.",
        )

    return PollGameArtifactAssistantResponse(text=answer, model=model)


async def attempt_artifact_repair(
    *,
    api_key: str,
    model: str,
    original_prompt: str,
    context: dict[str, Any],
    html: str,
    validation_issues: list[str],
    timeout_seconds: float,
) -> str:
    if not validation_issues or ARTIFACT_MAX_REPAIR_ATTEMPTS <= 0:
        return ""
    has_truncation_issue = any(
        "truncated" in issue.lower() or "unbalanced <script>" in issue.lower()
        for issue in validation_issues
    )
    repair_prompt = "\n".join(
        [
            "Repair this artifact HTML so it passes validation and still satisfies the original request.",
            "Return raw HTML only.",
            f"Original prompt: {original_prompt}",
            f"Validation issues: {'; '.join(validation_issues[:6])}",
            (
                "The previous artifact output appears to have been cut off before completion. "
                "Re-emit a complete artifact with all closing tags, all </script> tags, and syntactically complete inline JavaScript."
                if has_truncation_issue
                else ""
            ),
            "If the validation issue mentions live poll state, preserve or restore the existing live-state hook from context.artifact.currentArtifactHtml / currentArtifactLiveHooks.",
            "Do not drop window.prezoSetPollRenderer(fn), window.prezoRenderPoll(state), prezo:poll-update listeners, or equivalent host-driven update wiring.",
            "Context JSON:",
            json.dumps(context, indent=2),
            "Current artifact HTML:",
            html,
        ]
    )
    text, _stop_reason = await request_anthropic_text(
        api_key=api_key,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
        prompt_text=repair_prompt,
        temperature=0.25,
        max_tokens=ANTHROPIC_ARTIFACT_REPAIR_MAX_TOKENS,
        timeout_seconds=timeout_seconds,
    )
    repaired = normalize_poll_game_artifact_html(text)
    return repaired.strip()


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
    return value.strip() if isinstance(value, str) else ""


def normalize_anthropic_model_name(value: str | None) -> str:
    text = (value or "").strip()
    return text


def resolve_anthropic_base_url() -> str:
    base_url = (settings.anthropic_base_url or "").strip() or ANTHROPIC_API_BASE
    return base_url.rstrip("/")


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

    direct = try_parse_json(text)
    if isinstance(direct, dict):
        html_field = direct.get("html")
        if isinstance(html_field, str) and html_field.strip():
            text = html_field.strip()

    fenced = re.search(r"```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fenced and fenced.group(1):
        text = fenced.group(1).strip()

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
    artifact_context["currentArtifactHtml"] = compress_artifact_markup_for_model(
        artifact_context.get("currentArtifactHtml")
        if isinstance(artifact_context.get("currentArtifactHtml"), str)
        else "",
        request_mode=request_mode,
    )
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


def resolve_artifact_max_repair_attempts(request_mode: str) -> int:
    if request_mode == "edit":
        return ARTIFACT_EDIT_MAX_REPAIR_ATTEMPTS
    if request_mode == "repair":
        return ARTIFACT_REPAIR_MODE_MAX_REPAIR_ATTEMPTS
    return min(ARTIFACT_MAX_REPAIR_ATTEMPTS, ARTIFACT_BUILD_MAX_REPAIR_ATTEMPTS)


def ensure_artifact_time_budget_remaining(deadline: float, stage: str) -> float:
    remaining = deadline - time.monotonic()
    if remaining >= ARTIFACT_MIN_CALL_TIMEOUT_SECONDS:
        return remaining
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
