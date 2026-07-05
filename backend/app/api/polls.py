from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import AuthUser, get_current_user, get_library_user
from ..deps import get_manager, get_store
from ..models import (
    Poll,
    PollCreate,
    PollMode,
    PollModeUpdate,
    PollPresenceReport,
    PollStatus,
    PollUpdate,
    PollVote,
    SessionActivity,
)
from ..realtime import ConnectionManager
from ..store import ConflictError, InMemoryStore, NotFoundError

router = APIRouter(prefix="/sessions/{session_id}/polls", tags=["polls"])
logger = logging.getLogger("prezo.polls")

# Last presence report per (session_id, poll_id): (on_air, monotonic ts).
# Runtime-only state — a backend restart just means auto polls close on the
# next report/sweep and reopen on the next on-air keepalive (~5s).
_PRESENCE_TTL_SECONDS = 15.0
_presence: dict[tuple[str, str], tuple[bool, float]] = {}


def make_activity(activity_type: str, payload: dict) -> SessionActivity:
    return SessionActivity(
        type=activity_type, payload=payload, ts=datetime.now(timezone.utc)
    )


def _presence_is_on_air(session_id: str, poll_id: str) -> bool:
    entry = _presence.get((session_id, poll_id))
    if entry is None:
        return False
    on_air, reported_at = entry
    return on_air and (time.monotonic() - reported_at) <= _PRESENCE_TTL_SECONDS


async def _transition_poll_status(
    session_id: str,
    poll: Poll,
    desired: PollStatus,
    store: InMemoryStore,
    manager: ConnectionManager,
    user: AuthUser,
) -> Poll:
    """Set the poll's status if it differs and broadcast the same
    poll_opened/poll_closed activities the manual endpoints emit, so the
    audience and host UIs react identically to auto transitions."""
    if poll.status == desired:
        return poll
    poll = await store.set_poll_status(session_id, poll.id, desired, user.id)
    activity_type = "poll_opened" if desired == PollStatus.open else "poll_closed"
    activity = make_activity(activity_type, {"poll": poll.model_dump(mode="json")})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return poll


async def _get_session_polls(store: InMemoryStore, session_id: str) -> list[Poll]:
    snapshot = await store.snapshot(session_id)
    return snapshot.polls


async def _sweep_stale_auto_polls(
    session_id: str,
    exclude_poll_id: str,
    store: InMemoryStore,
    manager: ConnectionManager,
    user: AuthUser,
) -> None:
    """Close auto-mode polls that are open but whose conductor has gone
    silent (webview killed, deck closed mid-show). Runs piggybacked on
    every presence report for the session, so multi-embed decks self-heal
    without a background task."""
    try:
        polls = await _get_session_polls(store, session_id)
    except NotFoundError:
        return
    now = time.monotonic()
    for poll in polls:
        if poll.id == exclude_poll_id:
            continue
        if poll.mode != PollMode.auto or poll.status != PollStatus.open:
            continue
        entry = _presence.get((session_id, poll.id))
        if entry is not None and (now - entry[1]) <= _PRESENCE_TTL_SECONDS and entry[0]:
            continue
        try:
            await _transition_poll_status(
                session_id, poll, PollStatus.closed, store, manager, user
            )
        except NotFoundError:
            continue


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


# Manual open/close are PINS: they also set the poll's mode, so a poll a
# host explicitly opened stays open (and closed stays closed) regardless of
# where the slideshow is, until the host switches the poll back to auto.
@router.post("/{poll_id}/open", response_model=Poll)
async def open_poll(
    session_id: str,
    poll_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Poll:
    return await _apply_poll_mode(
        session_id, poll_id, PollMode.open, store, manager, user
    )


@router.post("/{poll_id}/close", response_model=Poll)
async def close_poll(
    session_id: str,
    poll_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Poll:
    return await _apply_poll_mode(
        session_id, poll_id, PollMode.closed, store, manager, user
    )


async def _apply_poll_mode(
    session_id: str,
    poll_id: str,
    mode: PollMode,
    store: InMemoryStore,
    manager: ConnectionManager,
    user: AuthUser,
) -> Poll:
    try:
        poll = await store.set_poll_mode(session_id, poll_id, mode, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if mode == PollMode.open:
        desired = PollStatus.open
    elif mode == PollMode.closed:
        desired = PollStatus.closed
    else:
        # Back to auto: effective status is whatever the slideshow says right
        # now — open only if a conductor reported this poll on-air recently.
        desired = (
            PollStatus.open
            if _presence_is_on_air(session_id, poll_id)
            else PollStatus.closed
        )
    try:
        poll = await _transition_poll_status(
            session_id, poll, desired, store, manager, user
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    # poll_updated carries the new mode so host UIs stay in sync even when
    # the status did not change.
    activity = make_activity("poll_updated", {"poll": poll.model_dump(mode="json")})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return poll


@router.post("/{poll_id}/mode", response_model=Poll)
async def set_poll_mode(
    session_id: str,
    poll_id: str,
    payload: PollModeUpdate,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Poll:
    return await _apply_poll_mode(
        session_id, poll_id, payload.mode, store, manager, user
    )


@router.post("/{poll_id}/presence", response_model=Poll)
async def report_poll_presence(
    session_id: str,
    poll_id: str,
    payload: PollPresenceReport,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_library_user),
) -> Poll:
    """Called by the on-slide embed (library-sync token) while its deck is
    open: on_air=true when the slideshow is displaying the embed's slide.
    Only auto-mode polls change status; pinned polls just record presence
    so switching back to auto lands on the right state."""
    now = time.monotonic()
    if len(_presence) > 5000:
        cutoff = now - 20 * _PRESENCE_TTL_SECONDS
        for key in [k for k, v in _presence.items() if v[1] < cutoff]:
            _presence.pop(key, None)
    _presence[(session_id, poll_id)] = (payload.on_air, now)

    try:
        polls = await _get_session_polls(store, session_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    poll = next((p for p in polls if p.id == poll_id), None)
    if poll is None:
        raise HTTPException(status_code=404, detail="poll not found")

    if poll.mode == PollMode.auto:
        desired = PollStatus.open if payload.on_air else PollStatus.closed
        try:
            poll = await _transition_poll_status(
                session_id, poll, desired, store, manager, user
            )
        except NotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    await _sweep_stale_auto_polls(session_id, poll_id, store, manager, user)
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
    asyncio.create_task(store.record_activity(session_id, activity))
    asyncio.create_task(manager.broadcast(session_id, activity))
    return poll


@router.post("/{poll_id}/vote/remove", response_model=Poll)
async def remove_poll_vote(
    session_id: str,
    poll_id: str,
    payload: PollVote,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> Poll:
    """Toggle-off counterpart to POST .../vote. Removes a single
    (poll, option, client) vote and broadcasts the updated poll. Idempotent:
    removing a non-existent vote returns the unchanged poll without error.
    """
    logger.info(
        "poll_vote_remove session=%s poll=%s option=%s client=%s",
        session_id,
        poll_id,
        payload.option_id,
        payload.client_id,
    )
    try:
        poll = await store.remove_poll_vote(
            session_id, poll_id, payload.option_id, payload.client_id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    activity = make_activity(
        "poll_vote_updated", {"poll": poll.model_dump(mode="json")}
    )
    asyncio.create_task(store.record_activity(session_id, activity))
    asyncio.create_task(manager.broadcast(session_id, activity))
    return poll
