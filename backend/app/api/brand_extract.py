from __future__ import annotations

import base64
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from ..auth import AuthUser, get_library_user
from ..config import settings

logger = logging.getLogger("prezo.brand_extract")

router = APIRouter(prefix="/library/poll-game/brand-profiles", tags=["brand-extract"])

EXTRACT_TIMEOUT_SECONDS = 60.0
EXTRACT_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
SUPPORTED_UPLOAD_TYPES = SUPPORTED_IMAGE_TYPES | {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

BRAND_EXTRACT_SYSTEM = (
    "You are a brand identity analyst. Given the uploaded content (brand guidelines PDF, "
    "presentation slides, logo image, or website screenshot), extract and summarise the "
    "brand's visual identity.\n\n"
    "Return a JSON object (and nothing else) with these keys:\n"
    "- primary_colors: array of hex colour strings (e.g. [\"#1A2B3C\", \"#FF6600\"])\n"
    "- secondary_colors: array of hex colour strings\n"
    "- fonts: array of font family names\n"
    "- logo_description: one-sentence description of the logo\n"
    "- visual_style: one-sentence summary of the brand's visual tone (e.g. \"clean "
    "and modern with bold geometric shapes\")\n"
    "- key_principles: array of 2-5 short brand guidelines principles\n"
    "- raw_notes: any other relevant brand details in free text\n\n"
    "If a field cannot be determined from the content, use an empty array or empty string."
)


def _gemini_extract_url(model: str) -> str:
    base = settings.gemini_base_url.rstrip("/")
    return f"{base}/models/{model}:generateContent"


async def _extract_with_gemini(parts: list[dict[str, Any]]) -> dict[str, Any]:
    api_key = settings.gemini_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key is not configured",
        )

    model = settings.gemini_model
    url = _gemini_extract_url(model)

    body = {
        "contents": [{"parts": parts}],
        "systemInstruction": {"parts": [{"text": BRAND_EXTRACT_SYSTEM}]},
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
        },
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(EXTRACT_TIMEOUT_SECONDS, connect=10.0)
        ) as client:
            response = await client.post(
                url,
                params={"key": api_key},
                json=body,
            )
    except httpx.TimeoutException as exc:
        logger.error("Gemini brand extract timeout: %s", exc.__class__.__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Brand extraction timed out",
        ) from exc
    except httpx.RequestError as exc:
        logger.error("Gemini brand extract request error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Brand extraction request failed",
        ) from exc

    if response.status_code >= 400:
        detail = ""
        try:
            detail = response.json().get("error", {}).get("message", "")
        except Exception:
            pass
        logger.error(
            "Gemini brand extract error: status=%d detail=%s", response.status_code, detail
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brand extraction failed: {detail or response.status_code}",
        )

    try:
        data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.error("Gemini brand extract: unexpected response shape")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Brand extraction returned an unexpected response",
        ) from exc

    import json as _json

    try:
        return _json.loads(text)
    except _json.JSONDecodeError:
        return {"raw_notes": text}


@router.post("/extract")
async def extract_brand_profile(
    user: AuthUser = Depends(get_library_user),
    file: UploadFile | None = File(default=None),
    url: str | None = Form(default=None),
) -> dict[str, Any]:
    """Extract brand guidelines from an uploaded file or a website URL."""

    if file and url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either a file or a URL, not both",
        )

    if not file and not url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide a file upload or a URL",
        )

    parts: list[dict[str, Any]] = []

    if file:
        content_type = file.content_type or "application/octet-stream"
        if content_type not in SUPPORTED_UPLOAD_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type: {content_type}. "
                "Supported: PDF, PPTX, PNG, JPEG, GIF, WEBP",
            )

        file_bytes = await file.read()
        if len(file_bytes) > EXTRACT_MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large (max {EXTRACT_MAX_FILE_SIZE // (1024 * 1024)} MB)",
            )

        b64 = base64.standard_b64encode(file_bytes).decode("ascii")

        if content_type in SUPPORTED_IMAGE_TYPES:
            parts.append({
                "inlineData": {"mimeType": content_type, "data": b64}
            })
        elif content_type == "application/pdf":
            parts.append({
                "inlineData": {"mimeType": "application/pdf", "data": b64}
            })
        else:
            # PPTX — send as inline data; Gemini handles it
            parts.append({
                "inlineData": {"mimeType": content_type, "data": b64}
            })

        parts.append({
            "text": f"Extract brand guidelines from this uploaded file ({file.filename or 'file'})."
        })

        source_type = "file"
        source_filename = file.filename or ""

    else:
        assert url is not None
        # Fetch the actual website HTML so Gemini can analyse real content
        page_snippet = ""
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(15.0, connect=5.0),
                follow_redirects=True,
                max_redirects=5,
            ) as client:
                page_response = await client.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (compatible; PrezoBot/1.0)",
                    "Accept": "text/html,application/xhtml+xml",
                })
                if page_response.status_code < 400:
                    raw_html = page_response.text[:60000]
                    # Strip script/style blocks to reduce noise, keep structure
                    import re
                    raw_html = re.sub(
                        r"<(script|style)[^>]*>[\s\S]*?</\1>",
                        "",
                        raw_html,
                        flags=re.IGNORECASE,
                    )
                    page_snippet = raw_html[:30000]
        except Exception as exc:
            logger.info("Could not fetch URL %s for brand extraction: %s", url, exc)

        if page_snippet:
            parts.append({
                "text": (
                    f"Analyse the brand identity of the website at {url}.\n"
                    "Below is the page HTML. Extract colours, fonts, visual style, "
                    "and brand guidelines from the actual content.\n\n"
                    f"{page_snippet}"
                )
            })
        else:
            parts.append({
                "text": (
                    f"I want you to analyse the brand identity of the website at: {url}\n"
                    "Based on the URL, describe the likely visual identity, colours, fonts, "
                    "and brand style. Extract brand guidelines as best you can."
                )
            })
        source_type = "url"
        source_filename = url

    guidelines = await _extract_with_gemini(parts)

    raw_summary = guidelines.pop("raw_notes", "") if isinstance(guidelines, dict) else ""

    return {
        "source_type": source_type,
        "source_filename": source_filename,
        "guidelines": guidelines,
        "raw_summary": raw_summary,
    }
