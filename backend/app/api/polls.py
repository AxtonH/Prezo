from __future__ import annotations

from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import AuthUser, get_current_user, get_library_user
from ..deps import get_manager, get_store
from ..models import Poll, PollCreate, PollStatus, PollUpdate, PollVote, SessionActivity
from ..realtime import ConnectionManager
from ..store import ConflictError, InMemoryStore, NotFoundError

router = APIRouter(prefix="/sessions/{session_id}/polls", tags=["polls"])
logger = logging.getLogger("prezo.polls")


def make_activity(activity_type: str, payload: dict) -> SessionActivity:
    return SessionActivity(
        type=activity_type, payload=payload, ts=datetime.now(timezone.utc)
    )


@router.post("", response_model=Poll, status_code=status.HTTP_201_CREATED)
async def create_poll(
    session_id: str,
    payload: PollCreate,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Poll:
    try:
        poll = await store.create_poll(
            session_id, payload.question, payload.options, payload.allow_multiple, user.id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    activity = make_activity("poll_created", {"poll": poll.model_dump(mode="json")})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return poll


@router.post("/{poll_id}/open", response_model=Poll)
async def open_poll(
    session_id: str,
    poll_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Poll:
    try:
        poll = await store.set_poll_status(session_id, poll_id, PollStatus.open, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    activity = make_activity("poll_opened", {"poll": poll.model_dump(mode="json")})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return poll


@router.post("/{poll_id}/close", response_model=Poll)
async def close_poll(
    session_id: str,
    poll_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Poll:
    try:
        poll = await store.set_poll_status(session_id, poll_id, PollStatus.closed, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    activity = make_activity("poll_closed", {"poll": poll.model_dump(mode="json")})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return poll


@router.delete("/{poll_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_poll(
    session_id: str,
    poll_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> None:
    try:
        await store.delete_poll(session_id, poll_id, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    activity = make_activity("poll_deleted", {"poll_id": poll_id})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)


@router.patch("/{poll_id}", response_model=Poll)
async def update_poll(
    session_id: str,
    poll_id: str,
    payload: PollUpdate,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_library_user),
) -> Poll:
    try:
        poll = await store.update_poll(
            session_id,
            poll_id,
            user.id,
            question=payload.question,
            option_labels=payload.options,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    activity = make_activity("poll_updated", {"poll": poll.model_dump(mode="json")})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return poll


@router.post("/{poll_id}/vote", response_model=Poll)
async def vote_poll(
    session_id: str,
    poll_id: str,
    payload: PollVote,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> Poll:
    logger.info(
        "poll_vote session=%s poll=%s option=%s client=%s",
        session_id,
        poll_id,
        payload.option_id,
        payload.client_id,
    )
    try:
        poll = await store.vote_poll(
            session_id, poll_id, payload.option_id, payload.client_id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    activity = make_activity("poll_vote_updated", {"poll": poll.model_dump(mode="json")})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return poll
