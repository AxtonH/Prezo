from __future__ import annotations

import json
import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..config import settings

router = APIRouter(prefix="/ai", tags=["ai"])
DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview"
LEGACY_GEMINI_MODELS = {
    "gemini-2.0-flash",
}

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
        "- Do not require external libraries or network assets unless the user explicitly requests them.",
        "- Build resilient rendering when options/votes change over time.",
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

    requested_model = normalize_gemini_model_name(payload.model)
    configured_model = normalize_gemini_model_name(settings.gemini_model)
    model = configured_model or DEFAULT_GEMINI_MODEL
    if requested_model and requested_model not in LEGACY_GEMINI_MODELS:
        model = requested_model
    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    body = {
        "systemInstruction": {"parts": [{"text": POLL_GAME_SYSTEM_INSTRUCTION}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": json.dumps(
                            {"prompt": payload.prompt, "context": payload.context},
                            indent=2,
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.9,
            "maxOutputTokens": 1400,
            "responseMimeType": "application/json",
        },
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(45.0, connect=10.0)
        ) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key,
                },
                json=body,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach Gemini API.",
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
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini response did not include text content.",
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
    api_key = (settings.gemini_api_key or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI editor is not configured. Set GEMINI_API_KEY on backend.",
        )

    requested_model = normalize_gemini_model_name(payload.model)
    configured_model = normalize_gemini_model_name(settings.gemini_model)
    model = configured_model or DEFAULT_GEMINI_MODEL
    if requested_model and requested_model not in LEGACY_GEMINI_MODELS:
        model = requested_model
    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    body = {
        "systemInstruction": {
            "parts": [{"text": POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": json.dumps(
                            {"prompt": payload.prompt, "context": payload.context},
                            indent=2,
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.8,
            "topP": 0.95,
            "maxOutputTokens": 5200,
            "responseMimeType": "text/plain",
        },
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0)
        ) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key,
                },
                json=body,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach Gemini API.",
        ) from exc

    raw_payload: Any = {}
    if response.content:
        try:
            raw_payload = response.json()
        except ValueError:
            raw_payload = {}
    if response.status_code >= 400:
        detail = (
            extract_gemini_error(raw_payload)
            or f"Gemini request failed ({response.status_code})"
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    text = extract_gemini_text(raw_payload)
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini response did not include text content.",
        )

    html = normalize_poll_game_artifact_html(text)
    if not html:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini response did not include artifact HTML.",
        )

    return PollGameArtifactBuildResponse(
        html=html,
        model=model,
        assistantMessage="Artifact build generated. Keep prompting to iterate.",
    )


def extract_gemini_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    first = candidates[0] if isinstance(candidates[0], dict) else {}
    content = first.get("content") if isinstance(first, dict) else {}
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""
    chunks: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        text = part.get("text")
        if isinstance(text, str) and text.strip():
            chunks.append(text.strip())
    return "\n".join(chunks).strip()


def extract_gemini_error(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if not isinstance(error, dict):
        return ""
    for key in ("message", "status"):
        value = error.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def normalize_gemini_model_name(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    if text.startswith("models/"):
        return text.removeprefix("models/").strip()
    return text


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
