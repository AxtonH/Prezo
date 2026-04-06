from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse

from ..auth import AuthUser, get_library_user
from ..config import settings

logger = logging.getLogger("prezo.brand_fonts")

router = APIRouter(prefix="/library/poll-game/brand-fonts", tags=["brand-fonts"])

MAX_FONT_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXT = frozenset({".woff2", ".woff", ".ttf", ".otf"})

# filename suffix -> extension if client sends octet-stream
_EXT_BY_SUFFIX = {
    ".woff2": ".woff2",
    ".woff": ".woff",
    ".ttf": ".ttf",
    ".otf": ".otf",
}


def _font_dir() -> Path:
    root = Path(settings.data_dir).resolve()
    d = root / "brand_fonts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _guess_ext(filename: str | None, content_type: str | None) -> str | None:
    fn = (filename or "").lower()
    for suf in _EXT_BY_SUFFIX:
        if fn.endswith(suf):
            return suf
    ct = (content_type or "").lower().split(";")[0].strip()
    if ct in ("font/woff2", "application/font-woff2"):
        return ".woff2"
    if ct in ("font/woff", "application/font-woff", "application/x-font-woff"):
        return ".woff"
    if ct in ("font/ttf", "application/x-font-ttf", "application/x-font-truetype", "font/sfnt"):
        return ".ttf"
    if ct in ("font/otf", "application/x-font-otf", "application/vnd.ms-opentype"):
        return ".otf"
    return None


def _media_type_for_ext(ext: str) -> str:
    return {
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
        ".otf": "font/otf",
    }.get(ext, "application/octet-stream")


def _supabase_fonts_enabled() -> bool:
    return bool(
        settings.supabase_url
        and settings.supabase_service_role_key
        and (settings.supabase_brand_fonts_bucket or "").strip()
    )


async def _upload_font_to_supabase_storage(
    user_id: str,
    font_id: str,
    ext: str,
    raw: bytes,
    media_type: str,
) -> str | None:
    """Upload to Supabase Storage; return public URL for @font-face. None on failure."""
    if not _supabase_fonts_enabled():
        return None

    base = (settings.supabase_url or "").rstrip("/")
    key = settings.supabase_service_role_key
    bucket = settings.supabase_brand_fonts_bucket.strip()

    safe_user = quote(user_id, safe="")
    object_path = f"fonts/{safe_user}/{font_id}{ext}"
    upload_url = f"{base}/storage/v1/object/{bucket}/{object_path}"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0)) as client:
            response = await client.post(
                upload_url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "apikey": key,
                    "Content-Type": media_type,
                    "x-upsert": "true",
                },
                content=raw,
            )
    except Exception as exc:
        logger.warning("Supabase Storage font upload failed (network): %s", exc)
        return None

    if response.status_code not in (200, 201):
        logger.warning(
            "Supabase Storage font upload HTTP %s: %s",
            response.status_code,
            response.text[:800],
        )
        return None

    public_url = f"{base}/storage/v1/object/public/{bucket}/{object_path}"
    logger.info("Stored brand font in Supabase Storage: %s", object_path)
    return public_url


@router.post("/upload")
async def upload_brand_font(
    request: Request,
    file: UploadFile = File(...),
    user: AuthUser = Depends(get_library_user),
) -> dict[str, Any]:
    """Upload a custom font. Prefer Supabase Storage (persistent, any device); else local disk."""
    raw = await file.read()
    if len(raw) > MAX_FONT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Font file too large (max {MAX_FONT_BYTES // (1024 * 1024)} MB)",
        )
    ext = _guess_ext(file.filename, file.content_type)
    if ext is None or ext not in ALLOWED_EXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported font type. Use .woff2, .woff, .ttf, or .otf",
        )

    font_id = uuid.uuid4().hex
    media_type = _media_type_for_ext(ext)

    public_url = await _upload_font_to_supabase_storage(
        user.id, font_id, ext, raw, media_type
    )

    if public_url:
        return {
            "font_id": font_id,
            "custom_url": public_url,
            "storage": "supabase",
            "path": public_url,
            "url": public_url,
        }

    dest = _font_dir() / f"{font_id}{ext}"
    dest.write_bytes(raw)
    logger.info("Saved brand font locally %s (%d bytes) user=%s", dest.name, len(raw), user.id)

    api_path = f"/library/poll-game/brand-fonts/files/{font_id}{ext}"
    base = (settings.public_base_url or str(request.base_url)).rstrip("/")
    absolute_url = f"{base}{api_path}"
    return {
        "font_id": font_id,
        "custom_url": absolute_url,
        "storage": "local",
        "path": api_path,
        "url": absolute_url,
    }


@router.get("/files/{name}")
async def get_brand_font_file(name: str) -> FileResponse:
    """Serve a font stored on local disk (legacy / fallback when not using Supabase)."""
    safe_name = Path(name).name
    if safe_name != name or not any(safe_name.endswith(s) for s in ALLOWED_EXT):
        raise HTTPException(status_code=400, detail="Invalid font file")

    path = _font_dir() / safe_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Font not found")

    ext = path.suffix.lower()
    return FileResponse(
        path,
        media_type=_media_type_for_ext(ext),
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Access-Control-Allow-Origin": "*",
        },
    )
