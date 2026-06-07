from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse

from ..auth import AuthUser, get_optional_library_user
from ..config import settings

logger = logging.getLogger("prezo.artifact_images")

router = APIRouter(prefix="/library/poll-game/artifact-images", tags=["artifact-images"])

MAX_ARTIFACT_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXT = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"})

# Anonymous PoC users (no Bearer token) share this storage segment. The
# artifact-build endpoint also accepts anonymous callers, so the upload path
# must not require sign-in.
ANON_USER_SEGMENT = "anon"

_EXT_BY_SUFFIX = {
    ".png": ".png",
    ".jpg": ".jpg",
    ".jpeg": ".jpg",
    ".webp": ".webp",
    ".gif": ".gif",
    ".svg": ".svg",
}


def _artifact_images_dir() -> Path:
    root = Path(settings.data_dir).resolve()
    d = root / "artifact_images"
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


def _supabase_artifact_images_enabled() -> bool:
    return bool(
        settings.supabase_url
        and settings.supabase_service_role_key
        and (settings.supabase_artifact_images_bucket or "").strip()
    )


async def _upload_artifact_image_to_supabase_storage(
    user_segment: str,
    image_id: str,
    ext: str,
    raw: bytes,
    media_type: str,
) -> str | None:
    if not _supabase_artifact_images_enabled():
        return None

    base = (settings.supabase_url or "").rstrip("/")
    key = settings.supabase_service_role_key
    bucket = settings.supabase_artifact_images_bucket.strip()

    safe_user = quote(user_segment, safe="")
    object_path = f"artifacts/{safe_user}/{image_id}{ext}"
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
        logger.warning("Supabase Storage artifact image upload failed (network): %s", exc)
        return None

    if response.status_code not in (200, 201):
        logger.warning(
            "Supabase Storage artifact image upload HTTP %s: %s",
            response.status_code,
            response.text[:800],
        )
        return None

    public_url = f"{base}/storage/v1/object/public/{bucket}/{object_path}"
    logger.info("Stored artifact image in Supabase Storage: %s", object_path)
    return public_url


async def upload_artifact_image_bytes(
    *,
    user_segment: str,
    raw: bytes,
    ext: str,
    media_type: str,
    request: Request,
) -> str:
    """Persist artifact image bytes; prefer Supabase public URL, else local file + absolute API URL."""
    image_id = uuid.uuid4().hex
    ext_norm = ext if ext.startswith(".") else f".{ext}"
    if ext_norm not in ALLOWED_EXT:
        ext_norm = ".png"

    public_url = await _upload_artifact_image_to_supabase_storage(
        user_segment, image_id, ext_norm, raw, media_type
    )
    if public_url:
        return public_url

    dest = _artifact_images_dir() / f"{image_id}{ext_norm}"
    dest.write_bytes(raw)
    logger.info(
        "Saved artifact image locally %s (%d bytes) user=%s",
        dest.name,
        len(raw),
        user_segment,
    )

    api_path = f"/library/poll-game/artifact-images/files/{image_id}{ext_norm}"
    base = (settings.public_base_url or str(request.base_url)).rstrip("/")
    return f"{base}{api_path}"


@router.post("/upload")
async def upload_artifact_image(
    request: Request,
    file: UploadFile = File(...),
    user: AuthUser | None = Depends(get_optional_library_user),
) -> dict[str, Any]:
    """Upload a reference image for an AI artifact (PNG, SVG, JPEG, WebP, GIF).

    Anonymous PoC callers (no Bearer token) are allowed; their uploads share a
    shared storage segment, mirroring the anonymous-friendly artifact-build endpoint.
    """
    raw = await file.read()
    if len(raw) > MAX_ARTIFACT_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image too large (max {MAX_ARTIFACT_IMAGE_BYTES // (1024 * 1024)} MB)",
        )
    ext = _guess_ext(file.filename, file.content_type)
    if ext is None or ext not in ALLOWED_EXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image type. Use PNG, JPEG, WebP, GIF, or SVG",
        )
    media_type = _media_type_for_ext(ext)
    user_segment = user.id if user is not None else ANON_USER_SEGMENT
    url = await upload_artifact_image_bytes(
        user_segment=user_segment,
        raw=raw,
        ext=ext,
        media_type=media_type,
        request=request,
    )
    return {"image_url": url, "url": url, "source": "upload"}


@router.get("/files/{name}")
async def get_artifact_image_file(name: str) -> FileResponse:
    """Serve an artifact image stored on local disk (dev fallback)."""
    safe_name = Path(name).name
    if safe_name != name or not any(safe_name.endswith(s) for s in ALLOWED_EXT):
        raise HTTPException(status_code=400, detail="Invalid artifact image file")

    path = _artifact_images_dir() / safe_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Artifact image not found")

    ext = path.suffix.lower()
    return FileResponse(
        path,
        media_type=_media_type_for_ext(ext),
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Access-Control-Allow-Origin": "*",
        },
    )
