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
    PollPresenceAck,
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

# Last (mode, status) this process read or wrote per poll. Presence reports
# are latency-critical (they gate how fast the audience sees a poll open),
# and the Supabase-backed store pays several REST round trips per read —
# with the cache, keepalives touch no storage at all and transitions pay
# only the actual status write. Safe because every mutation of poll
# mode/status flows through this module in this process; entries are
# dropped when a write discovers the poll is gone.
_poll_cache: dict[tuple[str, str], tuple[PollMode, PollStatus]] = {}


def make_activity(activity_type: str, payload: dict) -> SessionActivity:
    return SessionActivity(
        type=activity_type, payload=payload, ts=datetime.now(timezone.utc)
    )


def _cache_poll(poll: Poll) -> None:
    _poll_cache[(poll.session_id, poll.id)] = (poll.mode, poll.status)


def _presence_is_on_air(session_id: str, poll_id: str) -> bool:
    entry = _presence.get((session_id, poll_id))
    if entry is None:
        return False
    on_air, reported_at = entry
    return on_air and (time.monotonic() - reported_at) <= _PRESENCE_TTL_SECONDS


async def _broadcast_status_activity(
    session_id: str,
    poll: Poll,
    store: InMemoryStore,
    manager: ConnectionManager,
) -> None:
    """Emit the same poll_opened/poll_closed activities the manual endpoints
    emit, so the audience and host UIs react identically to auto
    transitions."""
    activity_type = (
        "poll_opened" if poll.status == PollStatus.open else "poll_closed"
    )
    activity = make_activity(activity_type, {"poll": poll.model_dump(mode="json")})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)


async def _transition_poll_status(
    session_id: str,
    poll: Poll,
    desired: PollStatus,
    store: InMemoryStore,
    manager: ConnectionManager,
    user: AuthUser,
) -> Poll:
    if poll.status == desired:
        _cache_poll(poll)
        return poll
    poll = await store.set_poll_status(session_id, poll.id, desired, user.id)
    _cache_poll(poll)
    await _broadcast_status_activity(session_id, poll, store, manager)
    return poll


async def _get_session_polls(store: InMemoryStore, session_id: str) -> list[Poll]:
    snapshot = await store.snapshot(session_id)
    return snapshot.polls


async def _seed_poll_cache(store: InMemoryStore, session_id: str) -> None:
    """One snapshot read to (re)learn a session's polls — only needed the
    first time this process sees the session (e.g. after a restart)."""
    for poll in await _get_session_polls(store, session_id):
        _cache_poll(poll)


async def _sweep_stale_auto_polls(
    session_id: str,
    exclude_poll_id: str,
    store: InMemoryStore,
    manager: ConnectionManager,
    user: AuthUser,
) -> None:
    """Close auto-mode polls that are open but whose conductor has gone
    silent (webview killed, deck closed mid-show). Runs piggybacked on
    every presence report for the session; candidates come from the cache,
    so the common case (nothing stale) costs no storage reads."""
    now = time.monotonic()
    candidates = [
        poll_id
        for (sid, poll_id), (mode, status) in _poll_cache.items()
        if sid == session_id
        and poll_id != exclude_poll_id
        and mode == PollMode.auto
        and status == PollStatus.open
    ]
    for poll_id in candidates:
        entry = _presence.get((session_id, poll_id))
        if entry is not None and (now - entry[1]) <= _PRESENCE_TTL_SECONDS and entry[0]:
            continue
        try:
            poll = await store.set_poll_status(
                session_id, poll_id, PollStatus.closed, user.id
            )
        except NotFoundError:
            _poll_cache.pop((session_id, poll_id), None)
            continue
        _cache_poll(poll)
        await _broadcast_status_activity(session_id, poll, store, manager)


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
    _cache_poll(poll)
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


@router.post("/{poll_id}/presence", response_model=PollPresenceAck)
async def report_poll_presence(
    session_id: str,
    poll_id: str,
    payload: PollPresenceReport,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_library_user),
) -> PollPresenceAck:
    """Called by the on-slide embed (library-sync token) while its deck is
    open: on_air=true when the slideshow is displaying the embed's slide.
    Only auto-mode polls change status; pinned polls just record presence
    so switching back to auto lands on the right state.

    Latency-critical: audience open/close waits on this. The state cache
    makes no-op reports (keepalives, pinned polls) storage-free; only real
    transitions write."""
    now = time.monotonic()
    if len(_presence) > 5000:
        cutoff = now - 20 * _PRESENCE_TTL_SECONDS
        for key in [k for k, v in _presence.items() if v[1] < cutoff]:
            _presence.pop(key, None)
    _presence[(session_id, poll_id)] = (payload.on_air, now)

    cached = _poll_cache.get((session_id, poll_id))
    if cached is None:
        try:
            await _seed_poll_cache(store, session_id)
        except NotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        cached = _poll_cache.get((session_id, poll_id))
        if cached is None:
            raise HTTPException(status_code=404, detail="poll not found")
    mode, status = cached

    if mode == PollMode.auto:
        desired = PollStatus.open if payload.on_air else PollStatus.closed
        if status != desired:
            try:
                poll = await store.set_poll_status(
                    session_id, poll_id, desired, user.id
                )
            except NotFoundError as exc:
                _poll_cache.pop((session_id, poll_id), None)
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            _cache_poll(poll)
            await _broadcast_status_activity(session_id, poll, store, manager)
            mode, status = poll.mode, poll.status

    await _sweep_stale_auto_polls(session_id, poll_id, store, manager, user)
    return PollPresenceAck(mode=mode, status=status)


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
    _poll_cache.pop((session_id, poll_id), None)
    _presence.pop((session_id, poll_id), None)
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
