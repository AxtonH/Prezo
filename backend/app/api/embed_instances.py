"""CRUD router for PowerPoint embed instances.

Each row represents a single content add-in instance inserted on a slide.
The row id is the UUID the iframe stores in Office.context.document.settings
and which is persisted inside the .pptx via webextensionproperty. Any user
who opens the file with the add-in installed and has a valid auth token can
read and update the row by that id.

Auth stance (v1): all endpoints require an authenticated user. First writer
is recorded as owner_user_id but ownership is not enforced — any signed-in
user with the uuid can read/write. Tighten later if needed.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import AuthUser, get_current_user
from ..embed_instances_store import (
    EmbedInstanceNotFoundError,
    EmbedInstanceStoreError,
    EmbedInstancesStore,
    get_embed_instances_store,
)
from ..models import EmbedInstance, EmbedInstanceCreate, EmbedInstanceUpdate

router = APIRouter(prefix="/embed-instances", tags=["embed-instances"])


def _store_dependency() -> EmbedInstancesStore:
    try:
        return get_embed_instances_store()
    except EmbedInstanceStoreError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post(
    "",
    response_model=EmbedInstance,
    status_code=status.HTTP_201_CREATED,
)
async def create_embed_instance(
    payload: EmbedInstanceCreate,
    store: EmbedInstancesStore = Depends(_store_dependency),
    user: AuthUser = Depends(get_current_user),
) -> EmbedInstance:
    try:
        return await store.create(payload, owner_user_id=user.id)
    except EmbedInstanceStoreError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/{embed_id}", response_model=EmbedInstance)
async def get_embed_instance(
    embed_id: str,
    store: EmbedInstancesStore = Depends(_store_dependency),
    _user: AuthUser = Depends(get_current_user),
) -> EmbedInstance:
    try:
        instance = await store.get(embed_id)
    except EmbedInstanceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=exc.detail) from exc
    except EmbedInstanceStoreError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    # Best-effort last-seen touch; failure shouldn't break the read.
    try:
        await store.touch_last_seen(embed_id)
    except EmbedInstanceStoreError:
        pass
    return instance


@router.patch("/{embed_id}", response_model=EmbedInstance)
async def update_embed_instance(
    embed_id: str,
    payload: EmbedInstanceUpdate,
    store: EmbedInstancesStore = Depends(_store_dependency),
    _user: AuthUser = Depends(get_current_user),
) -> EmbedInstance:
    try:
        return await store.update(embed_id, payload)
    except EmbedInstanceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=exc.detail) from exc
    except EmbedInstanceStoreError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.delete("/{embed_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_embed_instance(
    embed_id: str,
    store: EmbedInstancesStore = Depends(_store_dependency),
    _user: AuthUser = Depends(get_current_user),
) -> None:
    try:
        await store.delete(embed_id)
    except EmbedInstanceStoreError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
