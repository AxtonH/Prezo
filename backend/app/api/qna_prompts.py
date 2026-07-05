from __future__ import annotations

from datetime import datetime, timezone
import time

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import AuthUser, get_current_user, get_library_user
from ..deps import get_manager, get_store
from ..models import (
    ControlMode,
    PollPresenceReport,
    QnaPrompt,
    QnaPromptCreate,
    QnaPromptModeUpdate,
    QnaPromptPresenceAck,
    QnaPromptStatus,
    SessionActivity,
)
from ..realtime import ConnectionManager
from ..store import InMemoryStore, NotFoundError

router = APIRouter(prefix="/sessions/{session_id}/qna-prompts", tags=["qna-prompts"])

# Presence + state tracking for slide-driven (auto) discussion prompts —
# same design as polls (see api/polls.py): registry of last reports, plus a
# per-prompt (mode, status) cache so keepalives are storage-free and
# transitions pay only the status write.
_PRESENCE_TTL_SECONDS = 15.0
_presence: dict[tuple[str, str], tuple[bool, float]] = {}
_prompt_cache: dict[tuple[str, str], tuple[ControlMode, QnaPromptStatus]] = {}


def make_activity(activity_type: str, payload: dict) -> SessionActivity:
    return SessionActivity(
        type=activity_type, payload=payload, ts=datetime.now(timezone.utc)
    )


def _cache_prompt(prompt: QnaPrompt) -> None:
    _prompt_cache[(prompt.session_id, prompt.id)] = (prompt.mode, prompt.status)


def _presence_is_on_air(session_id: str, prompt_id: str) -> bool:
    entry = _presence.get((session_id, prompt_id))
    if entry is None:
        return False
    on_air, reported_at = entry
    return on_air and (time.monotonic() - reported_at) <= _PRESENCE_TTL_SECONDS


async def _broadcast_status_activity(
    session_id: str,
    prompt: QnaPrompt,
    store: InMemoryStore,
    manager: ConnectionManager,
) -> None:
    activity_type = (
        "qna_prompt_opened"
        if prompt.status == QnaPromptStatus.open
        else "qna_prompt_closed"
    )
    activity = make_activity(activity_type, {"prompt": prompt.model_dump(mode="json")})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)


async def _seed_prompt_cache(store: InMemoryStore, session_id: str) -> None:
    snapshot = await store.snapshot(session_id)
    for prompt in snapshot.prompts:
        _cache_prompt(prompt)


async def _sweep_stale_auto_prompts(
    session_id: str,
    exclude_prompt_id: str,
    store: InMemoryStore,
    manager: ConnectionManager,
    user: AuthUser,
) -> None:
    now = time.monotonic()
    candidates = [
        prompt_id
        for (sid, prompt_id), (mode, prompt_status) in _prompt_cache.items()
        if sid == session_id
        and prompt_id != exclude_prompt_id
        and mode == ControlMode.auto
        and prompt_status == QnaPromptStatus.open
    ]
    for prompt_id in candidates:
        entry = _presence.get((session_id, prompt_id))
        if entry is not None and (now - entry[1]) <= _PRESENCE_TTL_SECONDS and entry[0]:
            continue
        try:
            prompt = await store.set_qna_prompt_status(
                session_id, prompt_id, QnaPromptStatus.closed, user.id
            )
        except NotFoundError:
            _prompt_cache.pop((session_id, prompt_id), None)
            continue
        _cache_prompt(prompt)
        await _broadcast_status_activity(session_id, prompt, store, manager)


@router.post("", response_model=QnaPrompt, status_code=status.HTTP_201_CREATED)
async def create_prompt(
    session_id: str,
    payload: QnaPromptCreate,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> QnaPrompt:
    try:
        prompt = await store.create_qna_prompt(session_id, payload.prompt, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    _cache_prompt(prompt)
    activity = make_activity(
        "qna_prompt_created", {"prompt": prompt.model_dump(mode="json")}
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return prompt


async def _apply_prompt_mode(
    session_id: str,
    prompt_id: str,
    mode: ControlMode,
    store: InMemoryStore,
    manager: ConnectionManager,
    user: AuthUser,
) -> QnaPrompt:
    try:
        prompt = await store.set_qna_prompt_mode(session_id, prompt_id, mode, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if mode == ControlMode.open:
        desired = QnaPromptStatus.open
    elif mode == ControlMode.closed:
        desired = QnaPromptStatus.closed
    else:
        desired = (
            QnaPromptStatus.open
            if _presence_is_on_air(session_id, prompt_id)
            else QnaPromptStatus.closed
        )
    if prompt.status != desired:
        try:
            prompt = await store.set_qna_prompt_status(
                session_id, prompt_id, desired, user.id
            )
        except NotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        _cache_prompt(prompt)
        await _broadcast_status_activity(session_id, prompt, store, manager)
    else:
        _cache_prompt(prompt)
    # Carries the new mode so host UIs stay in sync when status didn't move.
    activity = make_activity(
        "qna_prompt_updated", {"prompt": prompt.model_dump(mode="json")}
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return prompt


# Manual open/close are PINS, mirroring polls: an explicitly opened
# discussion stays open regardless of the slideshow until the host changes
# mode.
@router.post("/{prompt_id}/open", response_model=QnaPrompt)
async def open_prompt(
    session_id: str,
    prompt_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> QnaPrompt:
    return await _apply_prompt_mode(
        session_id, prompt_id, ControlMode.open, store, manager, user
    )


@router.post("/{prompt_id}/close", response_model=QnaPrompt)
async def close_prompt(
    session_id: str,
    prompt_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> QnaPrompt:
    return await _apply_prompt_mode(
        session_id, prompt_id, ControlMode.closed, store, manager, user
    )


@router.post("/{prompt_id}/mode", response_model=QnaPrompt)
async def set_prompt_mode(
    session_id: str,
    prompt_id: str,
    payload: QnaPromptModeUpdate,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> QnaPrompt:
    return await _apply_prompt_mode(
        session_id, prompt_id, payload.mode, store, manager, user
    )


@router.post("/{prompt_id}/presence", response_model=QnaPromptPresenceAck)
async def report_prompt_presence(
    session_id: str,
    prompt_id: str,
    payload: PollPresenceReport,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_library_user),
) -> QnaPromptPresenceAck:
    """Reported by the taskpane conductor while a widget slide bound to this
    prompt is (or stops being) presented. Auto-mode prompts open/close;
    pinned prompts only record presence."""
    now = time.monotonic()
    if len(_presence) > 5000:
        cutoff = now - 20 * _PRESENCE_TTL_SECONDS
        for key in [k for k, v in _presence.items() if v[1] < cutoff]:
            _presence.pop(key, None)
    _presence[(session_id, prompt_id)] = (payload.on_air, now)

    cached = _prompt_cache.get((session_id, prompt_id))
    if cached is None:
        try:
            await _seed_prompt_cache(store, session_id)
        except NotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        cached = _prompt_cache.get((session_id, prompt_id))
        if cached is None:
            raise HTTPException(status_code=404, detail="prompt not found")
    mode, prompt_status = cached

    if mode == ControlMode.auto:
        desired = (
            QnaPromptStatus.open if payload.on_air else QnaPromptStatus.closed
        )
        if prompt_status != desired:
            try:
                prompt = await store.set_qna_prompt_status(
                    session_id, prompt_id, desired, user.id
                )
            except NotFoundError as exc:
                _prompt_cache.pop((session_id, prompt_id), None)
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            _cache_prompt(prompt)
            await _broadcast_status_activity(session_id, prompt, store, manager)
            mode, prompt_status = prompt.mode, prompt.status

    await _sweep_stale_auto_prompts(session_id, prompt_id, store, manager, user)
    return QnaPromptPresenceAck(mode=mode, status=prompt_status)


@router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt(
    session_id: str,
    prompt_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> None:
    try:
        await store.delete_qna_prompt(session_id, prompt_id, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    _prompt_cache.pop((session_id, prompt_id), None)
    _presence.pop((session_id, prompt_id), None)
    activity = make_activity("qna_prompt_deleted", {"prompt_id": prompt_id})
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
