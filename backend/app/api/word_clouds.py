from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from ..deps import get_manager, get_store
from ..models import (
    Event,
    WordCloud,
    WordCloudCreate,
    WordCloudStatus,
    WordCloudVote,
)
from ..realtime import ConnectionManager
from ..store import ConflictError, InMemoryStore, NotFoundError

router = APIRouter(prefix="/sessions/{session_id}/word-clouds", tags=["word_clouds"])


def make_event(event_type: str, payload: dict) -> Event:
    return Event(type=event_type, payload=payload, ts=datetime.now(timezone.utc))


@router.post("", response_model=WordCloud, status_code=status.HTTP_201_CREATED)
async def create_word_cloud(
    session_id: str,
    payload: WordCloudCreate,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> WordCloud:
    try:
        cloud = await store.create_word_cloud(session_id, payload.prompt, payload.words)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    event = make_event("word_cloud_created", {"word_cloud": cloud.model_dump(mode="json")})
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return cloud


@router.post("/{word_cloud_id}/open", response_model=WordCloud)
async def open_word_cloud(
    session_id: str,
    word_cloud_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> WordCloud:
    try:
        cloud, closed_clouds = await store.set_word_cloud_status(
            session_id, word_cloud_id, WordCloudStatus.open
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    for closed_cloud in closed_clouds:
        closed_event = make_event(
            "word_cloud_closed", {"word_cloud": closed_cloud.model_dump(mode="json")}
        )
        await store.record_event(session_id, closed_event)
        await manager.broadcast(session_id, closed_event)

    event = make_event("word_cloud_opened", {"word_cloud": cloud.model_dump(mode="json")})
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return cloud


@router.post("/{word_cloud_id}/close", response_model=WordCloud)
async def close_word_cloud(
    session_id: str,
    word_cloud_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> WordCloud:
    try:
        cloud, _ = await store.set_word_cloud_status(
            session_id, word_cloud_id, WordCloudStatus.closed
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    event = make_event("word_cloud_closed", {"word_cloud": cloud.model_dump(mode="json")})
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return cloud


@router.post("/{word_cloud_id}/vote", response_model=WordCloud)
async def vote_word_cloud(
    session_id: str,
    word_cloud_id: str,
    payload: WordCloudVote,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> WordCloud:
    try:
        cloud = await store.vote_word_cloud(
            session_id, word_cloud_id, payload.word_id, payload.client_id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    event = make_event(
        "word_cloud_vote_updated", {"word_cloud": cloud.model_dump(mode="json")}
    )
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return cloud
