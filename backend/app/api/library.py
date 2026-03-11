from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import AuthUser, get_current_user
from ..deps import get_store
from ..models import (
    SavedArtifact,
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
    user: AuthUser = Depends(get_current_user),
) -> list[SavedTheme]:
    return await store.list_saved_themes(user.id)


@router.put("/themes/{name}", response_model=SavedTheme)
async def save_saved_theme(
    name: str,
    payload: SavedThemeUpsert,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> SavedTheme:
    normalized_name = normalize_library_name(name)
    return await store.save_saved_theme(user.id, normalized_name, payload.theme)


@router.delete("/themes/{name}", response_model=SavedTheme)
async def delete_saved_theme(
    name: str,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> SavedTheme:
    normalized_name = normalize_library_name(name)
    try:
        return await store.delete_saved_theme(user.id, normalized_name)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/artifacts", response_model=list[SavedArtifact])
async def list_saved_artifacts(
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> list[SavedArtifact]:
    return await store.list_saved_artifacts(user.id)


@router.put("/artifacts/{name}", response_model=SavedArtifact)
async def save_saved_artifact(
    name: str,
    payload: SavedArtifactUpsert,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> SavedArtifact:
    normalized_name = normalize_library_name(name)
    html = payload.html.strip()
    if not html:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Artifact HTML is required"
        )
    return await store.save_saved_artifact(
        user.id,
        normalized_name,
        html,
        payload.last_prompt.strip() if payload.last_prompt else None,
        payload.last_answers,
        payload.theme_snapshot,
    )


@router.delete("/artifacts/{name}", response_model=SavedArtifact)
async def delete_saved_artifact(
    name: str,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> SavedArtifact:
    normalized_name = normalize_library_name(name)
    try:
        return await store.delete_saved_artifact(user.id, normalized_name)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
