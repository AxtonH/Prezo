from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..ai_prompts import normalize_artifact_activity_kind
from ..artifact_package import resolve_saved_artifact_html
from ..auth import AuthUser, get_current_user, get_library_user, issue_library_sync_token
from ..brand_context import build_brand_context, build_brand_context_from_profile
from ..deps import get_store
from ..models import (
    BrandContextPackage,
    BrandContextPreviewRequest,
    BrandProfile,
    BrandProfileUpsert,
    LibrarySyncToken,
    SavedArtifact,
    SavedArtifactVersion,
    SavedArtifactUpsert,
    SavedTheme,
    SavedThemeUpsert,
    WidgetPresetLibrary,
    WidgetPresetLibraryUpsert,
)
from ..store import InMemoryStore, NotFoundError

router = APIRouter(prefix="/library/poll-game", tags=["library"])


def normalize_library_name(value: str) -> str:
    normalized = " ".join(value.split()).strip()[:64]
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required"
        )
    return normalized


@router.get("/themes", response_model=list[SavedTheme])
async def list_saved_themes(
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> list[SavedTheme]:
    return await store.list_saved_themes(user.id)


@router.put("/themes/{name}", response_model=SavedTheme)
async def save_saved_theme(
    name: str,
    payload: SavedThemeUpsert,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> SavedTheme:
    normalized_name = normalize_library_name(name)
    return await store.save_saved_theme(user.id, normalized_name, payload.theme)


@router.delete("/themes/{name}", response_model=SavedTheme)
async def delete_saved_theme(
    name: str,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> SavedTheme:
    normalized_name = normalize_library_name(name)
    try:
        return await store.delete_saved_theme(user.id, normalized_name)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/artifacts", response_model=list[SavedArtifact])
async def list_saved_artifacts(
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> list[SavedArtifact]:
    return await store.list_saved_artifacts(user.id)


@router.put("/artifacts/{name}", response_model=SavedArtifact)
async def save_saved_artifact(
    name: str,
    payload: SavedArtifactUpsert,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> SavedArtifact:
    normalized_name = normalize_library_name(name)
    artifact_package = (
        payload.artifact_package.model_dump(mode="json")
        if payload.artifact_package
        else None
    )
    html = resolve_saved_artifact_html(payload.html, artifact_package)
    if not html:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Artifact HTML or an artifact package with an HTML entry is required",
        )
    return await store.save_saved_artifact(
        user.id,
        normalized_name,
        html,
        artifact_package,
        payload.last_prompt.strip() if payload.last_prompt else None,
        payload.last_answers,
        payload.theme_snapshot,
        payload.style_overrides,
        kind=normalize_artifact_activity_kind(payload.kind) if payload.kind else None,
    )


@router.delete("/artifacts/{name}", response_model=SavedArtifact)
async def delete_saved_artifact(
    name: str,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> SavedArtifact:
    normalized_name = normalize_library_name(name)
    try:
        return await store.delete_saved_artifact(user.id, normalized_name)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# --------------------------------------------------------------------------
# Widget design presets (widget styler dialog). One JSON document per user,
# same shape as the add-in's local cache, so sync is a plain GET/PUT and the
# merge logic stays in function-file where the local cache lives.
# --------------------------------------------------------------------------

widgets_router = APIRouter(prefix="/library/widgets", tags=["library"])

WIDGET_PRESET_KINDS = ("poll", "qna", "discussion")
WIDGET_PRESET_LIMIT = 30
WIDGET_PRESET_STYLE_MAX_KEYS = 40


def sanitize_widget_preset_library(data: object) -> dict:
    """Keep only well-formed kinds/presets; silently drop the rest.

    The client is the sole writer, so malformed input means a bug or a
    hand-edited payload — sanitizing beats erroring because a single bad
    entry must not brick the whole library.
    """
    result: dict = {}
    source = data if isinstance(data, dict) else {}
    for kind in WIDGET_PRESET_KINDS:
        bucket = source.get(kind)
        if not isinstance(bucket, dict):
            continue
        raw_presets = bucket.get("presets")
        presets: list[dict] = []
        seen_ids: set[str] = set()
        if isinstance(raw_presets, list):
            for entry in raw_presets:
                if len(presets) >= WIDGET_PRESET_LIMIT:
                    break
                if not isinstance(entry, dict):
                    continue
                preset_id = entry.get("id")
                name = entry.get("name")
                style = entry.get("style")
                if not isinstance(preset_id, str) or not preset_id.strip():
                    continue
                preset_id = preset_id.strip()[:64]
                if preset_id in seen_ids:
                    continue
                if not isinstance(name, str) or not name.strip():
                    continue
                if not isinstance(style, dict) or len(style) > WIDGET_PRESET_STYLE_MAX_KEYS:
                    continue
                seen_ids.add(preset_id)
                cleaned: dict = {
                    "id": preset_id,
                    "name": " ".join(name.split())[:60],
                    "style": style,
                }
                updated_at = entry.get("updatedAt")
                if isinstance(updated_at, str) and updated_at:
                    cleaned["updatedAt"] = updated_at[:40]
                presets.append(cleaned)
        default_id = bucket.get("defaultId")
        result[kind] = {
            "presets": presets,
            "defaultId": default_id
            if isinstance(default_id, str)
            and any(preset["id"] == default_id for preset in presets)
            else None,
        }
    return result


@widgets_router.get("/presets", response_model=WidgetPresetLibrary)
async def get_widget_presets(
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> WidgetPresetLibrary:
    library = await store.get_widget_preset_library(user.id)
    if library is None:
        return WidgetPresetLibrary(data={}, updated_at=None)
    return WidgetPresetLibrary(
        data=sanitize_widget_preset_library(library.data),
        updated_at=library.updated_at,
    )


@widgets_router.put("/presets", response_model=WidgetPresetLibrary)
async def save_widget_presets(
    payload: WidgetPresetLibraryUpsert,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> WidgetPresetLibrary:
    return await store.save_widget_preset_library(
        user.id, sanitize_widget_preset_library(payload.data)
    )


@router.get("/artifacts/{name}/versions", response_model=list[SavedArtifactVersion])
async def list_saved_artifact_versions(
    name: str,
    limit: int = 30,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> list[SavedArtifactVersion]:
    normalized_name = normalize_library_name(name)
    safe_limit = max(1, min(limit, 100))
    try:
        return await store.list_saved_artifact_versions(
            user.id,
            normalized_name,
            safe_limit,
        )
    except NotFoundError:
        # Artifact not saved to this account yet — same as “no version history”.
        return []


@router.post("/artifacts/{name}/versions/{version}/restore", response_model=SavedArtifact)
async def restore_saved_artifact_version(
    name: str,
    version: int,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> SavedArtifact:
    normalized_name = normalize_library_name(name)
    safe_version = max(1, int(version))
    try:
        return await store.restore_saved_artifact_version(
            user.id,
            normalized_name,
            safe_version,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/sync-token", response_model=LibrarySyncToken)
async def create_library_sync_token(
    user: AuthUser = Depends(get_current_user),
) -> LibrarySyncToken:
    token, expires_at = issue_library_sync_token(user)
    return LibrarySyncToken(token=token, expires_at=expires_at)


# ── Brand Profiles ──────────────────────────────────────────────────


@router.get("/brand-profiles", response_model=list[BrandProfile])
async def list_brand_profiles(
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> list[BrandProfile]:
    return await store.list_brand_profiles(user.id)


@router.get("/brand-profiles/{name}", response_model=BrandProfile)
async def get_brand_profile(
    name: str,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> BrandProfile:
    normalized_name = normalize_library_name(name)
    profile = await store.get_brand_profile(user.id, normalized_name)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="brand profile not found",
        )
    return profile


@router.put("/brand-profiles/{name}", response_model=BrandProfile)
async def save_brand_profile(
    name: str,
    payload: BrandProfileUpsert,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> BrandProfile:
    normalized_name = normalize_library_name(name)
    return await store.save_brand_profile(
        user.id,
        normalized_name,
        payload.source_type,
        payload.source_filename,
        payload.guidelines,
        payload.raw_summary,
    )


@router.delete("/brand-profiles/{name}", response_model=BrandProfile)
async def delete_brand_profile(
    name: str,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> BrandProfile:
    normalized_name = normalize_library_name(name)
    try:
        return await store.delete_brand_profile(user.id, normalized_name)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/brand-profiles/{name}/context", response_model=BrandContextPackage)
async def get_brand_profile_context(
    name: str,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> BrandContextPackage:
    """Return bounded CSS + font links + LLM prompt for generation (see `brand_context`)."""
    normalized_name = normalize_library_name(name)
    profiles = await store.list_brand_profiles(user.id)
    profile = next((p for p in profiles if p.name == normalized_name), None)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="brand profile not found",
        )
    return build_brand_context_from_profile(profile)


@router.post("/brand-profiles/preview-context", response_model=BrandContextPackage)
async def preview_brand_profile_context(
    payload: BrandContextPreviewRequest,
    user: AuthUser = Depends(get_library_user),
) -> BrandContextPackage:
    """Build a context package from ad-hoc guidelines without persisting."""
    _ = user  # auth ensures library access
    return build_brand_context(
        brand_name=payload.brand_name.strip() or "Brand",
        guidelines=payload.guidelines,
        raw_summary=payload.raw_summary,
    )
