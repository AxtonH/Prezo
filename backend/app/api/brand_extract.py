from __future__ import annotations

import base64
import logging
import re
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from ..auth import AuthUser, get_library_user
from ..config import settings

logger = logging.getLogger("prezo.brand_extract")

router = APIRouter(prefix="/library/poll-game/brand-profiles", tags=["brand-extract"])

EXTRACT_TIMEOUT_SECONDS = 180.0
EXTRACT_MAX_FILE_SIZE = 50 * 1024 * 1024   # 50 MB hard cap
INLINE_MAX_FILE_SIZE = 14 * 1024 * 1024    # >14 MB → use File API (base64 would exceed 20 MB limit)

SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
SUPPORTED_UPLOAD_TYPES = SUPPORTED_IMAGE_TYPES | {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

BRAND_EXTRACT_SYSTEM = (
    "You are a meticulous brand identity analyst. Given the uploaded content (brand "
    "guidelines PDF, presentation slides, logo image, or website screenshot), perform "
    "an exhaustive extraction of the brand's complete identity system.\n\n"
    "You MUST be thorough — extract EVERY detail you can find. For a multi-page brand "
    "guide, your output should be extensive and comprehensive. Do NOT summarise or "
    "abbreviate; capture the full depth of the source material.\n\n"
    "Return a JSON object (and nothing else) with these keys:\n"
    "- primary_colors: array of hex colour strings with usage notes "
    "(e.g. [\"#1A2B3C – primary brand blue, used for headlines and CTAs\"])\n"
    "- secondary_colors: array of hex colour strings with usage notes\n"
    "- accent_colors: array of hex colour strings for any accent/highlight colours\n"
    "- gradient_styles: array of gradient definitions if present "
    "(e.g. [\"linear-gradient from #1A2B3C to #FF6600, used on hero banners\"])\n"
    "- fonts: array of objects with family name, weight, and usage "
    "(e.g. [{\"family\": \"Inter\", \"weights\": [\"400\", \"700\"], \"usage\": \"body text\"}])\n"
    "- typography_hierarchy: description of heading/body/caption size and weight relationships\n"
    "- logo_description: detailed description of the logo including variations, "
    "clear space rules, minimum sizes, and any do's/don'ts\n"
    "- logo_colors: hex colours used in the logo specifically\n"
    "- visual_style: detailed summary of the brand's visual tone, aesthetic, and design "
    "philosophy (multiple sentences encouraged)\n"
    "- key_principles: array of ALL brand guidelines principles found (not limited to 5)\n"
    "- tone_of_voice: description of the brand's communication style, voice, and "
    "messaging tone (formal/casual, playful/serious, etc.)\n"
    "- messaging_framework: key messages, taglines, slogans, or value propositions\n"
    "- iconography_style: description of icon style, line weight, and approach\n"
    "- illustration_style: description of illustration approach if present\n"
    "- photography_style: description of photography direction, mood, and treatment\n"
    "- patterns_and_textures: description of any brand patterns, scribbles, textures, "
    "or decorative elements (e.g. \"hand-drawn scribble borders\", \"dot grid overlay\")\n"
    "- spacing_and_layout: layout grid rules, spacing principles, whitespace usage\n"
    "- brand_shapes: any signature shapes or geometric elements used in the brand\n"
    "- background_styles: preferred background treatments (solid, gradient, image, etc.)\n"
    "- animation_motion: any motion/animation guidelines if present\n"
    "- dos_and_donts: array of explicit do's and don'ts from the guidelines\n"
    "- raw_notes: any other relevant brand details not captured above — be generous "
    "and include everything remaining. For a large brand guide, this should be extensive.\n\n"
    "IMPORTANT: Extract MAXIMUM detail. A 100+ page brand guide should produce a very "
    "long, thorough response. Never truncate or omit details to save space. Every colour "
    "swatch, every font pairing, every layout rule matters.\n\n"
    "If a field cannot be determined from the content, use an empty array or empty string."
)


def _gemini_base_url() -> str:
    return settings.gemini_base_url.rstrip("/")


def _gemini_generate_url(model: str) -> str:
    return f"{_gemini_base_url()}/models/{model}:generateContent"


def _gemini_upload_url() -> str:
    return f"{_gemini_base_url().replace('/v1beta', '')}/upload/v1beta/files"


async def _upload_to_gemini_files_api(
    file_bytes: bytes,
    content_type: str,
    filename: str,
    api_key: str,
) -> str:
    """Upload a file to the Gemini File API and return its URI."""
    boundary = f"----GeminiBoundary{uuid.uuid4().hex}"
    metadata = f'{{"file": {{"displayName": "{filename}"}}}}'

    body = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{metadata}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + file_bytes + f"\r\n--{boundary}--".encode()

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=10.0)
        ) as client:
            response = await client.post(
                _gemini_upload_url(),
                params={"key": api_key, "uploadType": "multipart"},
                content=body,
                headers={"Content-Type": f"multipart/related; boundary={boundary}"},
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File upload to Gemini timed out",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File upload to Gemini failed",
        ) from exc

    if response.status_code >= 400:
        detail = ""
        try:
            detail = response.json().get("error", {}).get("message", "")
        except Exception:
            pass
        logger.error("Gemini file upload error: status=%d detail=%s", response.status_code, detail)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"File upload failed: {detail or response.status_code}",
        )

    try:
        file_uri = response.json()["file"]["uri"]
    except (KeyError, TypeError) as exc:
        logger.error("Gemini file upload: unexpected response shape")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="File upload returned an unexpected response",
        ) from exc

    return file_uri


async def _delete_gemini_file(file_uri: str, api_key: str) -> None:
    """Best-effort deletion of an uploaded Gemini file."""
    try:
        # URI format: https://generativelanguage.googleapis.com/v1beta/files/{name}
        file_name = file_uri.rstrip("/").rsplit("/", 1)[-1]
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.delete(
                f"{_gemini_base_url()}/files/{file_name}",
                params={"key": api_key},
            )
    except Exception as exc:
        logger.warning("Could not delete Gemini file %s: %s", file_uri, exc)


async def _extract_with_gemini(parts: list[dict[str, Any]]) -> dict[str, Any]:
    api_key = settings.gemini_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key is not configured",
        )

    model = settings.gemini_model
    url = _gemini_generate_url(model)

    body = {
        "contents": [{"parts": parts}],
        "systemInstruction": {"parts": [{"text": BRAND_EXTRACT_SYSTEM}]},
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 16384,
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
        file_size = len(file_bytes)

        if file_size > EXTRACT_MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large (max {EXTRACT_MAX_FILE_SIZE // (1024 * 1024)} MB)",
            )

        api_key = settings.gemini_api_key
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Gemini API key is not configured",
            )

        file_uri: str | None = None
        try:
            if file_size > INLINE_MAX_FILE_SIZE:
                # Large file — upload via Gemini File API to avoid base64 size limit
                logger.info(
                    "Uploading large file (%d MB) via Gemini File API",
                    file_size // (1024 * 1024),
                )
                file_uri = await _upload_to_gemini_files_api(
                    file_bytes, content_type, file.filename or "file", api_key
                )
                parts.append({
                    "fileData": {"mimeType": content_type, "fileUri": file_uri}
                })
            else:
                # Small file — inline base64
                b64 = base64.standard_b64encode(file_bytes).decode("ascii")
                parts.append({
                    "inlineData": {"mimeType": content_type, "data": b64}
                })

            parts.append({
                "text": f"Extract brand guidelines from this uploaded file ({file.filename or 'file'})."
            })

            source_type = "file"
            source_filename = file.filename or ""

            guidelines = await _extract_with_gemini(parts)
        finally:
            if file_uri:
                await _delete_gemini_file(file_uri, api_key)

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
                    f"Analyse the brand identity of the website at: {url}\n"
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
