from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import json as _json
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

# Image extraction settings
IMAGE_MIN_DIMENSION = 40      # skip tiny images (icons, bullets)
IMAGE_MAX_CANDIDATES = 10     # return at most N candidate images
IMAGE_MAX_DATA_URL_BYTES = 500_000  # skip images whose base64 exceeds ~500 KB

SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
SUPPORTED_UPLOAD_TYPES = SUPPORTED_IMAGE_TYPES | {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

# ---------------------------------------------------------------------------
# Pass 1 — Visual Identity
# Focused on: colours, typography, patterns, shapes, asset styles
# ---------------------------------------------------------------------------

PASS1_SYSTEM = (
    "You are a meticulous brand identity analyst. Given the uploaded content "
    "(brand guidelines PDF, presentation slides, logo image, or website screenshot), "
    "extract the brand's VISUAL IDENTITY SYSTEM.\n\n"
    "Focus ONLY on visual/design elements:\n"
    "- Colours (primary, secondary, accent) with hex values, names, and usage\n"
    "- Gradients with definitions and usage\n"
    "- Fonts with family names, weights, and usage roles\n"
    "- Typography hierarchy (heading/body/caption relationships)\n"
    "- Logo description, variations, rules, and colours\n"
    "- Patterns, textures, scribbles, and decorative elements\n"
    "- Brand shapes and geometric elements\n"
    "- Background treatment styles\n"
    "- Iconography style and rules\n"
    "- Illustration style and approach\n"
    "- Photography style and treatment\n"
    "- Spacing and layout grid rules\n"
    "- Animation/motion guidelines\n\n"
    "Be EXHAUSTIVE. Extract every colour swatch with its hex, RGB, CMYK, and "
    "Pantone values if provided. List every font weight. Describe every pattern. "
    "For a 100+ page brand guide, your response should be very detailed.\n\n"
    "Return a JSON object matching the required schema."
)

PASS1_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "primary_colors": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Hex colour strings with usage notes, e.g. '#1A2B3C – Navy, for headlines'",
        },
        "secondary_colors": {
            "type": "array",
            "items": {"type": "string"},
        },
        "accent_colors": {
            "type": "array",
            "items": {"type": "string"},
        },
        "gradient_styles": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Gradient definitions with usage",
        },
        "fonts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "family": {"type": "string"},
                    "weights": {"type": "array", "items": {"type": "string"}},
                    "usage": {"type": "string"},
                },
                "required": ["family"],
                "additionalProperties": False,
            },
        },
        "typography_hierarchy": {"type": "string"},
        "logo_description": {"type": "string"},
        "logo_colors": {
            "type": "array",
            "items": {"type": "string"},
        },
        "patterns_and_textures": {"type": "string"},
        "brand_shapes": {"type": "string"},
        "background_styles": {"type": "string"},
        "iconography_style": {"type": "string"},
        "illustration_style": {"type": "string"},
        "photography_style": {"type": "string"},
        "spacing_and_layout": {"type": "string"},
        "animation_motion": {"type": "string"},
    },
    "required": [
        "primary_colors", "secondary_colors", "accent_colors",
        "gradient_styles", "fonts", "typography_hierarchy",
        "logo_description", "logo_colors",
        "patterns_and_textures", "brand_shapes", "background_styles",
        "iconography_style", "illustration_style", "photography_style",
        "spacing_and_layout", "animation_motion",
    ],
    "additionalProperties": False,
}

# ---------------------------------------------------------------------------
# Pass 2 — Brand Voice & Strategy
# Focused on: tone, messaging, principles, dos/don'ts, visual style philosophy
# ---------------------------------------------------------------------------

PASS2_SYSTEM = (
    "You are a meticulous brand identity analyst. Given the uploaded content "
    "(brand guidelines PDF, presentation slides, logo image, or website screenshot), "
    "extract the brand's VOICE, STRATEGY, AND DESIGN PHILOSOPHY.\n\n"
    "Focus ONLY on:\n"
    "- Overall visual style philosophy and aesthetic direction\n"
    "- Tone of voice (personality, communication style, formality level)\n"
    "- Key brand principles and values\n"
    "- Messaging framework (taglines, slogans, key messages, value propositions)\n"
    "- Do's and Don'ts (explicit rules from the guidelines)\n\n"
    "Be EXHAUSTIVE. Extract every principle, every do/don't, every messaging "
    "example. Quote directly from the guidelines where possible. For a 100+ page "
    "brand guide, your response should be very detailed.\n\n"
    "Return a JSON object matching the required schema."
)

PASS2_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "visual_style": {
            "type": "string",
            "description": "Detailed summary of the brand's visual tone, aesthetic, and design philosophy",
        },
        "tone_of_voice": {
            "type": "string",
            "description": "Communication style, personality traits, formality level",
        },
        "key_principles": {
            "type": "array",
            "items": {"type": "string"},
            "description": "ALL brand guidelines principles found",
        },
        "messaging_framework": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Key messages, taglines, slogans, value propositions",
        },
        "dos_and_donts": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Explicit do's and don'ts from the guidelines",
        },
    },
    "required": [
        "visual_style", "tone_of_voice", "key_principles",
        "messaging_framework", "dos_and_donts",
    ],
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# Image extraction from PDF / PPTX
# ---------------------------------------------------------------------------

def _extract_images_from_pdf(file_bytes: bytes) -> list[dict[str, Any]]:
    """Extract embedded images from a PDF as data URL candidates."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.info("PyMuPDF not installed — skipping PDF image extraction")
        return []

    candidates: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        logger.warning("Failed to open PDF for image extraction: %s", exc)
        return []

    try:
        for page_num in range(min(len(doc), 30)):
            page = doc[page_num]
            for img_info in page.get_images(full=True):
                xref = img_info[0]
                try:
                    base_image = doc.extract_image(xref)
                except Exception:
                    continue
                if not base_image or not base_image.get("image"):
                    continue

                width = base_image.get("width", 0)
                height = base_image.get("height", 0)
                if width < IMAGE_MIN_DIMENSION or height < IMAGE_MIN_DIMENSION:
                    continue

                img_bytes = base_image["image"]
                img_hash = hashlib.md5(img_bytes).hexdigest()
                if img_hash in seen_hashes:
                    continue
                seen_hashes.add(img_hash)

                ext = base_image.get("ext", "png")
                mime = f"image/{ext}" if ext != "jpg" else "image/jpeg"
                b64 = base64.standard_b64encode(img_bytes).decode("ascii")
                if len(b64) > IMAGE_MAX_DATA_URL_BYTES:
                    continue

                candidates.append({
                    "data_url": f"data:{mime};base64,{b64}",
                    "width": width,
                    "height": height,
                    "page": page_num + 1,
                })
    finally:
        doc.close()

    candidates.sort(key=lambda c: c["width"] * c["height"], reverse=True)
    return candidates[:IMAGE_MAX_CANDIDATES]


def _extract_images_from_pptx(file_bytes: bytes) -> list[dict[str, Any]]:
    """Extract embedded images from a PPTX file."""
    try:
        from pptx import Presentation
        from pptx.enum.shapes import MSO_SHAPE_TYPE
    except ImportError:
        logger.info("python-pptx not installed — skipping PPTX image extraction")
        return []

    candidates: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()

    try:
        prs = Presentation(io.BytesIO(file_bytes))
    except Exception as exc:
        logger.warning("Failed to open PPTX for image extraction: %s", exc)
        return []

    for slide_num, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                try:
                    img_blob = shape.image.blob
                    content_type = shape.image.content_type or "image/png"
                except Exception:
                    continue

                img_hash = hashlib.md5(img_blob).hexdigest()
                if img_hash in seen_hashes:
                    continue
                seen_hashes.add(img_hash)

                b64 = base64.standard_b64encode(img_blob).decode("ascii")
                if len(b64) > IMAGE_MAX_DATA_URL_BYTES:
                    continue

                width = int(shape.width / 9525) if shape.width else 0
                height = int(shape.height / 9525) if shape.height else 0
                if width < IMAGE_MIN_DIMENSION or height < IMAGE_MIN_DIMENSION:
                    continue

                candidates.append({
                    "data_url": f"data:{content_type};base64,{b64}",
                    "width": width,
                    "height": height,
                    "page": slide_num,
                })

    candidates.sort(key=lambda c: c["width"] * c["height"], reverse=True)
    return candidates[:IMAGE_MAX_CANDIDATES]


def _extract_images_from_upload(
    file_bytes: bytes, content_type: str,
) -> list[dict[str, Any]]:
    """Extract candidate logo/brand images from an uploaded file."""
    if content_type in SUPPORTED_IMAGE_TYPES:
        b64 = base64.standard_b64encode(file_bytes).decode("ascii")
        if len(b64) <= IMAGE_MAX_DATA_URL_BYTES:
            return [{"data_url": f"data:{content_type};base64,{b64}", "width": 0, "height": 0, "page": 1}]
        return []
    if content_type == "application/pdf":
        return _extract_images_from_pdf(file_bytes)
    if content_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        return _extract_images_from_pptx(file_bytes)
    return []


# ---------------------------------------------------------------------------
# Gemini helpers
# ---------------------------------------------------------------------------

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
        file_name = file_uri.rstrip("/").rsplit("/", 1)[-1]
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.delete(
                f"{_gemini_base_url()}/files/{file_name}",
                params={"key": api_key},
            )
    except Exception as exc:
        logger.warning("Could not delete Gemini file %s: %s", file_uri, exc)


async def _gemini_extract_pass(
    *,
    parts: list[dict[str, Any]],
    system_instruction: str,
    response_schema: dict[str, Any],
    pass_name: str,
) -> dict[str, Any]:
    """Run a single schema-enforced Gemini extraction pass.

    Uses `responseJsonSchema` to force Gemini to populate every field
    in the schema, preventing the raw_notes dumping problem.
    Falls back to non-schema mode if the schema exceeds Gemini's state limit.
    """
    api_key = settings.gemini_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key is not configured",
        )

    model = settings.gemini_brand_extract_model or settings.gemini_model
    url = _gemini_generate_url(model)

    body: dict[str, Any] = {
        "contents": [{"parts": parts}],
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 12000,
            "responseMimeType": "application/json",
            "responseJsonSchema": response_schema,
        },
    }

    result = await _call_gemini(url, api_key, body, pass_name)
    if result is not None:
        return result

    # Fallback: retry without schema if schema caused a state overflow error
    logger.warning("Pass %s: retrying without responseJsonSchema", pass_name)
    body["generationConfig"].pop("responseJsonSchema", None)
    result = await _call_gemini(url, api_key, body, pass_name)
    if result is not None:
        return result

    return {}


async def _call_gemini(
    url: str,
    api_key: str,
    body: dict[str, Any],
    pass_name: str,
) -> dict[str, Any] | None:
    """Execute a Gemini generateContent call. Returns parsed JSON or None on failure."""
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(EXTRACT_TIMEOUT_SECONDS, connect=10.0)
        ) as client:
            response = await client.post(url, params={"key": api_key}, json=body)
    except httpx.TimeoutException:
        logger.error("Gemini brand extract timeout: pass=%s", pass_name)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Brand extraction timed out ({pass_name})",
        )
    except httpx.RequestError as exc:
        logger.error("Gemini brand extract request error: pass=%s error=%s", pass_name, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Brand extraction request failed ({pass_name})",
        )

    if response.status_code >= 400:
        detail = ""
        try:
            detail = response.json().get("error", {}).get("message", "")
        except Exception:
            pass
        # If schema caused a "too many states" error, return None so caller can retry
        if "too many" in detail.lower() or "state" in detail.lower():
            logger.warning("Gemini schema overflow in pass %s: %s", pass_name, detail)
            return None
        logger.error("Gemini brand extract error: pass=%s status=%d detail=%s", pass_name, response.status_code, detail)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Brand extraction failed ({pass_name}): {detail or response.status_code}",
        )

    try:
        data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        logger.error("Gemini brand extract: unexpected response shape in pass %s", pass_name)
        return None

    try:
        return _json.loads(text)
    except _json.JSONDecodeError:
        logger.warning("Gemini brand extract: invalid JSON in pass %s", pass_name)
        return None


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------

@router.post("/extract")
async def extract_brand_profile(
    user: AuthUser = Depends(get_library_user),
    file: UploadFile | None = File(default=None),
    url: str | None = Form(default=None),
) -> dict[str, Any]:
    """Extract brand guidelines from an uploaded file or a website URL.

    Uses a 2-pass parallel extraction strategy:
      Pass 1 — Visual Identity (colours, fonts, patterns, asset styles)
      Pass 2 — Brand Voice & Strategy (tone, principles, messaging, dos/don'ts)

    Both passes run concurrently with schema enforcement so Gemini is forced
    to populate every field instead of dumping into raw_notes.
    """

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

    # --- Build the content parts (shared by both passes) ---
    parts: list[dict[str, Any]] = []
    extracted_images: list[dict[str, Any]] = []

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

        # Extract embedded images (logos, assets) — runs synchronously, fast
        extracted_images = _extract_images_from_upload(file_bytes, content_type)

        file_uri: str | None = None
        try:
            if file_size > INLINE_MAX_FILE_SIZE:
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
                b64 = base64.standard_b64encode(file_bytes).decode("ascii")
                parts.append({
                    "inlineData": {"mimeType": content_type, "data": b64}
                })

            parts.append({
                "text": f"Extract brand guidelines from this uploaded file ({file.filename or 'file'})."
            })

            source_type = "file"
            source_filename = file.filename or ""

            # --- Run both passes in parallel ---
            pass1_result, pass2_result = await asyncio.gather(
                _gemini_extract_pass(
                    parts=parts,
                    system_instruction=PASS1_SYSTEM,
                    response_schema=PASS1_SCHEMA,
                    pass_name="visual",
                ),
                _gemini_extract_pass(
                    parts=parts,
                    system_instruction=PASS2_SYSTEM,
                    response_schema=PASS2_SCHEMA,
                    pass_name="voice",
                ),
            )
        finally:
            if file_uri:
                await _delete_gemini_file(file_uri, api_key)

    else:
        assert url is not None
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

        pass1_result, pass2_result = await asyncio.gather(
            _gemini_extract_pass(
                parts=parts,
                system_instruction=PASS1_SYSTEM,
                response_schema=PASS1_SCHEMA,
                pass_name="visual",
            ),
            _gemini_extract_pass(
                parts=parts,
                system_instruction=PASS2_SYSTEM,
                response_schema=PASS2_SCHEMA,
                pass_name="voice",
            ),
        )

    # --- Merge both pass results into a single guidelines object ---
    guidelines: dict[str, Any] = {}
    if isinstance(pass1_result, dict):
        guidelines.update(pass1_result)
    if isinstance(pass2_result, dict):
        guidelines.update(pass2_result)

    result: dict[str, Any] = {
        "source_type": source_type,
        "source_filename": source_filename,
        "guidelines": guidelines,
        "raw_summary": "",
    }

    if extracted_images:
        result["extracted_images"] = extracted_images

    return result
