from __future__ import annotations

import json
import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..config import settings

router = APIRouter(prefix="/ai", tags=["ai"])
DEFAULT_OPENAI_MODEL = "gpt-5.2"
OPENAI_MODEL_PREFIXES = (
    "gpt-",
    "chatgpt-",
    "o1",
    "o3",
    "o4",
)
ARTIFACT_MAX_REPAIR_ATTEMPTS = 1
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
ARTIFACT_UNSAFE_DOM_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            r"""document\.(?:querySelector|getElementById)\s*\([^)]*\)\s*\.\s*(?:innerText|textContent|innerHTML)\s*=""",
            re.IGNORECASE,
        ),
        "script mutates text/html on a direct DOM query result without checking the element exists.",
    ),
    (
        re.compile(
            r"""document\.(?:querySelector|getElementById)\s*\([^)]*\)\s*\.\s*style\s*\.""",
            re.IGNORECASE,
        ),
        "script mutates style on a direct DOM query result without checking the element exists.",
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
        "- Define window.prezoRenderPoll(state) to render and update the artifact when live data changes.",
        "- If context.artifact.currentArtifactHtml is present, treat it as the current artifact to revise and return a full updated HTML artifact, not a diff.",
        "- If context.artifact.currentArtifactLiveHooks is present, preserve that live update wiring unless the user explicitly asks to replace it with an equivalent working implementation.",
        "- If context.artifact.requestMode == 'edit', treat the latest user request as a targeted refinement of the current artifact.",
        "- If context.artifact.requestMode == 'repair', treat context.artifact.currentArtifactHtml as the last stable working artifact, treat context.artifact.failedArtifactHtml as the broken prior attempt, and satisfy the latest edit request while avoiding context.artifact.runtimeRenderError.",
        "- In edit mode, make the smallest viable change that satisfies the latest request.",
        "- In repair mode, do not simply return the unchanged stable artifact unless the latest request is already satisfied.",
        "- Preserve the current concept, layout, visual metaphor, typography, palette, and motion unless the user explicitly asks to change them.",
        "- For local requests such as title size, spacing, readability, color, motion, or positioning, do not redesign unrelated parts of the artifact.",
        "- If context.artifact.recentEditRequests is present, use it to maintain continuity, but prioritize the latest request over earlier ones.",
        "- Preserve working live-data behavior, stable layout, and successful design decisions from the current artifact unless the user explicitly asks for a broader redesign.",
        "- The edited artifact must still consume host-delivered live poll state and must still define a working window.prezoRenderPoll(state) hook or an equivalent listener using the existing host contract.",
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
        "- In window.prezoRenderPoll(state), guard DOM queries before mutating them. If an element is temporarily missing, skip that mutation instead of throwing.",
        "- Never write directly to .innerText, .textContent, .innerHTML, .style, or similar properties on the result of querySelector/getElementById without first checking that the element exists.",
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
    prompt: str = Field(min_length=1, max_length=4000)
    context: dict[str, Any] = Field(default_factory=dict)
    model: str | None = Field(default=None, max_length=120)


class PollGameEditPlanResponse(BaseModel):
    text: str
    model: str


class PollGameArtifactBuildRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    context: dict[str, Any] = Field(default_factory=dict)
    model: str | None = Field(default=None, max_length=120)


class PollGameArtifactBuildResponse(BaseModel):
    html: str
    model: str
    assistantMessage: str


class PollGameArtifactAssistantResponse(BaseModel):
    text: str
    model: str

async def request_openai_text(
    *,
    api_key: str,
    base_url: str,
    model: str,
    system_instruction: str,
    prompt_text: str,
    max_output_tokens: int,
    timeout_seconds: float,
) -> str:
    normalized_base_url = normalize_openai_base_url(base_url)
    endpoint = f"{normalized_base_url}/responses"
    body = {
        "model": model,
        "instructions": system_instruction,
        "input": prompt_text,
        "max_output_tokens": max_output_tokens,
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_seconds, connect=10.0)
        ) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json=body,
            )
    except httpx.RequestError as exc:
        detail = str(exc).strip() or exc.__class__.__name__
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to reach OpenAI API at {normalized_base_url}: {detail}",
        ) from exc

    raw_payload: Any = {}
    if response.content:
        try:
            raw_payload = response.json()
        except ValueError:
            raw_payload = {}
    if response.status_code >= 400:
        detail = extract_openai_error(raw_payload) or f"OpenAI request failed ({response.status_code})"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    text = extract_openai_text(raw_payload)
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenAI response did not include text content.",
        )
    return text


@router.post("/poll-game-edit-plan", response_model=PollGameEditPlanResponse)
async def create_poll_game_edit_plan(
    payload: PollGameEditPlanRequest,
) -> PollGameEditPlanResponse:
    openai_api_key = (settings.openai_api_key or "").strip()
    if not openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI editor is not configured. Set OPENAI_API_KEY on backend.",
        )

    requested_model = normalize_openai_model_name(payload.model)
    model = requested_model or resolve_openai_default_model()
    text = await request_openai_text(
        api_key=openai_api_key,
        base_url=settings.openai_base_url,
        model=model,
        system_instruction=POLL_GAME_SYSTEM_INSTRUCTION,
        prompt_text=json.dumps(
            {"prompt": payload.prompt, "context": payload.context},
            indent=2,
        ),
        max_output_tokens=1400,
        timeout_seconds=45.0,
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
    artifact_context = payload.context.get("artifact", {})
    request_mode = ""
    if isinstance(artifact_context, dict):
        request_mode = str(artifact_context.get("requestMode") or "").strip().lower()
    model = choose_artifact_generation_model(
        requested_model=payload.model or "",
        request_mode=request_mode,
    )
    openai_api_key = (settings.openai_api_key or "").strip()
    if not openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Artifact build is not configured. Set OPENAI_API_KEY on backend.",
        )
    generation_max_output_tokens = 5200
    generation_timeout_seconds = 60.0
    if request_mode == "edit":
        generation_max_output_tokens = 12000
        generation_timeout_seconds = 90.0
    elif request_mode == "repair":
        generation_max_output_tokens = 14000
        generation_timeout_seconds = 90.0
    prompt_text = json.dumps(
        {"prompt": payload.prompt, "context": payload.context},
        indent=2,
    )
    text = await request_openai_text(
        api_key=openai_api_key,
        base_url=settings.openai_base_url,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
        prompt_text=prompt_text,
        max_output_tokens=generation_max_output_tokens,
        timeout_seconds=generation_timeout_seconds,
    )

    html = normalize_poll_game_artifact_html(text)
    if not html:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI response did not include artifact HTML.",
        )
    validation_issues = validate_poll_game_artifact_html(html)
    if validation_issues:
        repaired_html = await attempt_artifact_repair(
            api_key=openai_api_key,
            model=model,
            original_prompt=payload.prompt,
            context=payload.context,
            html=html,
            validation_issues=validation_issues,
        )
        if repaired_html:
            html = repaired_html
            validation_issues = validate_poll_game_artifact_html(html)
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
    model = choose_artifact_generation_model(
        requested_model=payload.model or "",
        request_mode="answer",
    )
    openai_api_key = (settings.openai_api_key or "").strip()
    prompt_text = json.dumps(
        {"prompt": payload.prompt, "context": payload.context},
        indent=2,
    )
    if not openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Artifact assistant is not configured. Set OPENAI_API_KEY on backend.",
        )
    text = await request_openai_text(
        api_key=openai_api_key,
        base_url=settings.openai_base_url,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_ASSISTANT_SYSTEM_INSTRUCTION,
        prompt_text=prompt_text,
        max_output_tokens=900,
        timeout_seconds=45.0,
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
) -> str:
    if not validation_issues or ARTIFACT_MAX_REPAIR_ATTEMPTS <= 0:
        return ""
    repair_prompt = "\n".join(
        [
            "Repair this artifact HTML so it passes validation and still satisfies the original request.",
            "Return raw HTML only.",
            f"Original prompt: {original_prompt}",
            f"Validation issues: {'; '.join(validation_issues[:6])}",
            "If the validation issue mentions live poll state, preserve or restore the existing live-state hook from context.artifact.currentArtifactHtml / currentArtifactLiveHooks.",
            "Do not drop window.prezoRenderPoll(state), prezo:poll-update listeners, or equivalent host-driven update wiring.",
            "Context JSON:",
            json.dumps(context, indent=2),
            "Current artifact HTML:",
            html,
        ]
    )
    text = await request_openai_text(
        api_key=api_key,
        base_url=settings.openai_base_url,
        model=model,
        system_instruction=POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION,
        prompt_text=repair_prompt,
        max_output_tokens=14000,
        timeout_seconds=90.0,
    )
    repaired = normalize_poll_game_artifact_html(text)
    return repaired.strip()

def extract_openai_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    output = payload.get("output")
    if not isinstance(output, list):
        return ""
    chunks: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            text_value = part.get("text")
            if isinstance(text_value, str) and text_value.strip():
                chunks.append(text_value.strip())
                continue
            if isinstance(part.get("output_text"), str) and part["output_text"].strip():
                chunks.append(part["output_text"].strip())
    return "\n".join(chunks).strip()


def extract_openai_error(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if not isinstance(error, dict):
        return ""
    for key in ("message", "code", "type"):
        value = error.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def normalize_openai_model_name(value: str | None) -> str:
    return (value or "").strip()


def normalize_openai_base_url(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        return "https://api.openai.com/v1"
    return text.rstrip("/")


def is_openai_model_name(value: str | None) -> bool:
    text = (value or "").strip().lower()
    if not text:
        return False
    if "codex" in text:
        return True
    return text.startswith(OPENAI_MODEL_PREFIXES)


def resolve_openai_default_model() -> str:
    return (
        normalize_openai_model_name(settings.openai_model)
        or normalize_openai_model_name(settings.openai_artifact_edit_model)
        or DEFAULT_OPENAI_MODEL
    )


def choose_artifact_generation_model(
    *,
    requested_model: str,
    request_mode: str,
) -> str:
    normalized_requested_model = (requested_model or "").strip()
    openai_api_key = (settings.openai_api_key or "").strip()
    openai_default_model = resolve_openai_default_model()

    if is_openai_model_name(normalized_requested_model):
        if not openai_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Requested an OpenAI model but OPENAI_API_KEY is not configured.",
            )
        return normalized_requested_model

    if normalized_requested_model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported AI model '{normalized_requested_model}'. Use an OpenAI model such as gpt-5.2.",
        )

    if openai_api_key and openai_default_model:
        return openai_default_model

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="No AI model is configured. Set OPENAI_API_KEY to use GPT-5.2.",
    )


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
    if not any(token in text for token in ARTIFACT_LIVE_STATE_TOKENS):
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
        for pattern, message in ARTIFACT_UNSAFE_DOM_PATTERNS:
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
