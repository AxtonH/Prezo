from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..artifact_package import resolve_saved_artifact_html
from ..auth import AuthUser, get_current_user, get_library_user, issue_library_sync_token
from ..deps import get_store
from ..models import (
    LibrarySyncToken,
    SavedArtifact,
    SavedArtifactVersion,
    SavedArtifactUpsert,
    SavedTheme,
    SavedThemeUpsert,
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
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
