from __future__ import annotations

import base64
import logging
import uuid
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse

from ..auth import AuthUser, get_library_user
from ..config import settings

logger = logging.getLogger("prezo.brand_logos")

router = APIRouter(prefix="/library/poll-game/brand-logos", tags=["brand-logos"])

MAX_LOGO_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXT = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"})

_EXT_BY_SUFFIX = {
    ".png": ".png",
    ".jpg": ".jpg",
    ".jpeg": ".jpg",
    ".webp": ".webp",
    ".gif": ".gif",
    ".svg": ".svg",
}


def _logo_dir() -> Path:
    root = Path(settings.data_dir).resolve()
    d = root / "brand_logos"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _guess_ext(filename: str | None, content_type: str | None) -> str | None:
    fn = (filename or "").lower()
    for suf in _EXT_BY_SUFFIX:
        if fn.endswith(suf):
            return _EXT_BY_SUFFIX[suf]
    ct = (content_type or "").lower().split(";")[0].strip()
    mapping = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
        "image/svg": ".svg",
    }
    return mapping.get(ct)


def _media_type_for_ext(ext: str) -> str:
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
    }.get(ext, "application/octet-stream")


def _supabase_logos_enabled() -> bool:
    return bool(
        settings.supabase_url
        and settings.supabase_service_role_key
        and (settings.supabase_brand_logos_bucket or "").strip()
    )


async def _upload_logo_to_supabase_storage(
    user_id: str,
    logo_id: str,
    ext: str,
    raw: bytes,
    media_type: str,
) -> str | None:
    if not _supabase_logos_enabled():
        return None

    base = (settings.supabase_url or "").rstrip("/")
    key = settings.supabase_service_role_key
    bucket = settings.supabase_brand_logos_bucket.strip()

    safe_user = quote(user_id, safe="")
    object_path = f"logos/{safe_user}/{logo_id}{ext}"
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
        logger.warning("Supabase Storage logo upload failed (network): %s", exc)
        return None

    if response.status_code not in (200, 201):
        logger.warning(
            "Supabase Storage logo upload HTTP %s: %s",
            response.status_code,
            response.text[:800],
        )
        return None

    public_url = f"{base}/storage/v1/object/public/{bucket}/{object_path}"
    logger.info("Stored brand logo in Supabase Storage: %s", object_path)
    return public_url


async def upload_brand_logo_bytes(
    *,
    user_id: str,
    raw: bytes,
    ext: str,
    media_type: str,
    request: Request,
) -> str:
    """Persist logo bytes; prefer Supabase public URL, else local file + absolute API URL."""
    logo_id = uuid.uuid4().hex
    ext_norm = ext if ext.startswith(".") else f".{ext}"
    if ext_norm not in ALLOWED_EXT:
        ext_norm = ".png"

    public_url = await _upload_logo_to_supabase_storage(
        user_id, logo_id, ext_norm, raw, media_type
    )
    if public_url:
        return public_url

    dest = _logo_dir() / f"{logo_id}{ext_norm}"
    dest.write_bytes(raw)
    logger.info("Saved brand logo locally %s (%d bytes) user=%s", dest.name, len(raw), user_id)

    api_path = f"/library/poll-game/brand-logos/files/{logo_id}{ext_norm}"
    base = (settings.public_base_url or str(request.base_url)).rstrip("/")
    return f"{base}{api_path}"


def parse_data_url(data_url: str) -> tuple[bytes, str]:
    """Return (raw bytes, mime type string)."""
    s = data_url.strip()
    if not s.startswith("data:") or "," not in s:
        raise ValueError("invalid data URL")
    comma = s.index(",")
    header = s[5:comma]
    payload = s[comma + 1 :]
    mime = "application/octet-stream"
    if ";" in header:
        mime = header.split(";")[0].strip() or mime
    else:
        mime = header.strip() or mime
    if ";base64" in header:
        raw = base64.standard_b64decode(payload)
    else:
        from urllib.parse import unquote

        raw = unquote(payload).encode("utf-8")
    return raw, mime


def ext_from_mime(mime: str) -> str:
    m = mime.lower().split(";")[0].strip()
    return {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
    }.get(m, ".png")


async def upload_brand_logo_from_data_url(
    user_id: str,
    data_url: str,
    request: Request,
) -> str | None:
    """Upload a logo from an extraction data URL. Returns public URL or None on failure."""
    try:
        raw, mime = parse_data_url(data_url)
    except Exception as exc:
        logger.warning("Could not parse logo data URL: %s", exc)
        return None
    if len(raw) > MAX_LOGO_BYTES:
        logger.warning("Extracted logo exceeds max size")
        return None
    ext = ext_from_mime(mime)
    mt = _media_type_for_ext(ext)
    try:
        return await upload_brand_logo_bytes(
            user_id=user_id, raw=raw, ext=ext, media_type=mt, request=request
        )
    except Exception as exc:
        logger.warning("Logo upload failed: %s", exc)
        return None


@router.post("/upload")
async def upload_brand_logo(
    request: Request,
    file: UploadFile = File(...),
    user: AuthUser = Depends(get_library_user),
) -> dict[str, Any]:
    """Upload a brand logo image (PNG, SVG, JPEG, WebP, GIF)."""
    raw = await file.read()
    if len(raw) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image too large (max {MAX_LOGO_BYTES // (1024 * 1024)} MB)",
        )
    ext = _guess_ext(file.filename, file.content_type)
    if ext is None or ext not in ALLOWED_EXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image type. Use PNG, JPEG, WebP, GIF, or SVG",
        )
    media_type = _media_type_for_ext(ext)
    url = await upload_brand_logo_bytes(
        user_id=user.id, raw=raw, ext=ext, media_type=media_type, request=request
    )
    return {"logo_url": url, "url": url, "source": "upload"}


@router.get("/files/{name}")
async def get_brand_logo_file(name: str) -> FileResponse:
    """Serve a logo stored on local disk."""
    safe_name = Path(name).name
    if safe_name != name or not any(safe_name.endswith(s) for s in ALLOWED_EXT):
        raise HTTPException(status_code=400, detail="Invalid logo file")

    path = _logo_dir() / safe_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Logo not found")

    ext = path.suffix.lower()
    return FileResponse(
        path,
        media_type=_media_type_for_ext(ext),
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Access-Control-Allow-Origin": "*",
        },
    )
