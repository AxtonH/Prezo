"""Anthropic and Gemini HTTP clients, response parsing, and model resolution.

request_anthropic_text / request_gemini_text are the only functions here
that perform I/O. NOTE: the test suite patches these two on app.api.ai,
so their callers must keep resolving them through ai.py's module globals;
do not import them directly into new call sites without updating the
tests. Extracted from app.api.ai.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import HTTPException, status

from .config import settings

logger = logging.getLogger("prezo.ai")


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

GEMINI_ARTIFACT_PATCH_MAX_TOKENS = 8000

GEMINI_ARTIFACT_BACKGROUND_TREATMENT_MAX_TOKENS = 1200

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
    reference_images: list[tuple[str, str]] | None = None,
) -> tuple[str, str]:
    base_url = resolve_anthropic_base_url()
    endpoint = f"{base_url}/messages"
    content: list[dict[str, Any]] = []
    if reference_images:
        for media_type, b64_data in reference_images:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": b64_data,
                    },
                }
            )
    content.append({"type": "text", "text": prompt_text})
    resolved_model = (
        normalize_anthropic_model_name(model) or DEFAULT_ANTHROPIC_ARTIFACT_BUILD_MODEL
    )
    body = {
        "model": resolved_model,
        "system": system_instruction,
        "messages": [
            {
                "role": "user",
                "content": content,
            }
        ],
        "max_tokens": max_tokens,
    }
    # Opus 4.7/4.8 reject temperature (400). Only send it on models that accept it.
    if anthropic_model_accepts_sampling_params(resolved_model):
        body["temperature"] = temperature

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
        logger.error("Anthropic timeout: %s stage=%s timeout=%.1fs", exc.__class__.__name__, request_stage, timeout_seconds)
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
        logger.error("Anthropic request error: %s stage=%s", detail, request_stage)
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
        logger.error(
            "Anthropic API error: status=%s detail=%s model=%s stage=%s",
            response.status_code, detail, model, request_stage,
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
    vision_images: list[tuple[str, str]] | None = None,
) -> tuple[str, str]:
    base_url = resolve_gemini_base_url()
    endpoint = build_gemini_generate_content_endpoint(base_url, model)
    # Gemini vision parts: inlineData with base64 image, placed before the text part
    # so the model can SEE attached images (style-matching) in addition to the prompt.
    user_parts: list[dict[str, Any]] = []
    if vision_images:
        for media_type, b64_data in vision_images:
            user_parts.append(
                {
                    "inlineData": {
                        "mimeType": media_type,
                        "data": b64_data,
                    }
                }
            )
    user_parts.append({"text": prompt_text})
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
                "parts": user_parts,
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
        generation_config["thinkingConfig"] = {
            "thinkingBudget": effective_gemini_thinking_budget(model, thinking_budget)
        }

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
        logger.error("Gemini timeout: %s stage=%s timeout=%.1fs", exc.__class__.__name__, request_stage, timeout_seconds)
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
        logger.error("Gemini request error: %s stage=%s", detail, request_stage)
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
        logger.error(
            "Gemini API error: status=%s detail=%s model=%s stage=%s",
            response.status_code, detail, model, request_stage,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    text = extract_gemini_text(raw_payload)
    stop_reason = extract_gemini_stop_reason(raw_payload)
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini response did not include text content.",
        )
    return text, stop_reason

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

def is_gemini_schema_state_overflow_error_detail(detail: Any) -> bool:
    normalized = str(detail or "").strip().lower()
    if not normalized:
        return False
    return (
        "too many states for serving" in normalized
        or "schema produces a constraint" in normalized
        or ("schema" in normalized and "too many states" in normalized)
    )

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

# Anthropic models from Opus 4.7 onward removed sampling params (temperature,
# top_p, top_k) and the enabled/budget_tokens thinking mode — sending any of them
# returns a 400. Older Claude models (Opus 4.6 and earlier, all Sonnet/Haiku 4.x)
# still accept temperature. This gate only applies to the Anthropic call; the
# Gemini path is unaffected.
ANTHROPIC_MODELS_WITHOUT_SAMPLING_PARAMS = ("opus-4-8", "opus-4-7")

def anthropic_model_accepts_sampling_params(model: str) -> bool:
    normalized = (model or "").strip().lower()
    return not any(
        marker in normalized for marker in ANTHROPIC_MODELS_WITHOUT_SAMPLING_PARAMS
    )

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

# Patch / JSON artifact paths pass thinking_budget=0 to skip thinking on Flash. Gemini 3.x Pro
# returns 400: "Budget 0 is invalid. This model only works in thinking mode."
GEMINI_THINKING_ONLY_MODEL_MIN_BUDGET = 8192

def effective_gemini_thinking_budget(model: str, requested: int | None) -> int | None:
    """Map requested budget; upgrade 0 → minimum for thinking-only Gemini 3.x models."""
    if requested is None:
        return None
    if requested > 0:
        return requested
    name = (normalize_gemini_model_name(model) or "").lower()
    if "gemini-3" in name or "3.1" in name:
        return GEMINI_THINKING_ONLY_MODEL_MIN_BUDGET
    return 0

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
