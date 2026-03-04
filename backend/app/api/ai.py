from __future__ import annotations

import json
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
        "gridVisible, visualMode, raceCar, raceCarImageUrl, logoUrl, assetUrl, fontFamily.",
        "Allowed move targets: panel, eyebrow, question, meta, footer, options, logo, asset, bgImage, overlay, grid.",
        "Allowed resize targets: panel, eyebrow, question, meta, footer, logo, asset, bgImage, overlay, grid.",
        "Use hex colors only (#RRGGBB).",
        "Use minimal actions required for the request.",
        "Do not invent keys, fields, or unsupported action types.",
    ]
)


class PollGameEditPlanRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    context: dict[str, Any] = Field(default_factory=dict)
    model: str | None = Field(default=None, max_length=120)


class PollGameEditPlanResponse(BaseModel):
    text: str
    model: str


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

    return PollGameEditPlanResponse(text=text, model=model)


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
