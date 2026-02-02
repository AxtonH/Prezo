from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from ..deps import get_manager, get_store
from ..models import Event, Poll, PollCreate, PollStatus, PollVote
from ..realtime import ConnectionManager
from ..store import ConflictError, InMemoryStore, NotFoundError

router = APIRouter(prefix="/sessions/{session_id}/polls", tags=["polls"])


def make_event(event_type: str, payload: dict) -> Event:
    return Event(type=event_type, payload=payload, ts=datetime.now(timezone.utc))


@router.post("", response_model=Poll, status_code=status.HTTP_201_CREATED)
async def create_poll(
    session_id: str,
    payload: PollCreate,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> Poll:
    try:
        poll = await store.create_poll(
            session_id, payload.question, payload.options, payload.allow_multiple
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    event = make_event("poll_created", {"poll": poll.model_dump(mode="json")})
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return poll


@router.post("/{poll_id}/open", response_model=Poll)
async def open_poll(
    session_id: str,
    poll_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> Poll:
    try:
        poll = await store.set_poll_status(session_id, poll_id, PollStatus.open)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    event = make_event("poll_opened", {"poll": poll.model_dump(mode="json")})
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return poll


@router.post("/{poll_id}/close", response_model=Poll)
async def close_poll(
    session_id: str,
    poll_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> Poll:
    try:
        poll = await store.set_poll_status(session_id, poll_id, PollStatus.closed)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    event = make_event("poll_closed", {"poll": poll.model_dump(mode="json")})
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return poll


@router.post("/{poll_id}/vote", response_model=Poll)
async def vote_poll(
    session_id: str,
    poll_id: str,
    payload: PollVote,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> Poll:
    try:
        poll = await store.vote_poll(
            session_id, poll_id, payload.option_id, payload.client_id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    event = make_event("poll_vote_updated", {"poll": poll.model_dump(mode="json")})
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return poll
