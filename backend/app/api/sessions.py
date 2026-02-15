from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import AuthUser, get_current_user
from ..config import settings
from ..deps import get_manager, get_store
from ..models import Event, Session, SessionCreate, SessionSnapshot
from ..realtime import ConnectionManager
from ..store import ConflictError, InMemoryStore, NotFoundError

router = APIRouter(prefix="/sessions", tags=["sessions"])


def with_join_url(session: Session) -> Session:
    if settings.public_base_url:
        join_url = f"{settings.public_base_url}/join/{session.code}"
        return session.model_copy(update={"join_url": join_url})
    return session


@router.post("", response_model=Session, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: SessionCreate,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> Session:
    try:
        session = await store.create_session(payload.title, user.id)
    except ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return with_join_url(session)


@router.get("/{session_id}", response_model=Session)
async def get_session(
    session_id: str, store: InMemoryStore = Depends(get_store)
) -> Session:
    try:
        session = await store.get_session(session_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return with_join_url(session)


@router.get("/code/{code}", response_model=Session)
async def get_session_by_code(
    code: str, store: InMemoryStore = Depends(get_store)
) -> Session:
    try:
        session = await store.get_session_by_code(code.upper())
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return with_join_url(session)


@router.get("/{session_id}/snapshot", response_model=SessionSnapshot)
async def get_snapshot(
    session_id: str, store: InMemoryStore = Depends(get_store)
) -> SessionSnapshot:
    try:
        snapshot = await store.snapshot(session_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    session = with_join_url(snapshot.session)
    return snapshot.model_copy(update={"session": session})


@router.post("/{session_id}/qna/open", response_model=Session)
async def open_qna(
    session_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Session:
    try:
        session = await store.set_qna_status(session_id, True, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    session = with_join_url(session)
    event = Event(
        type="qna_opened",
        payload={"session": session.model_dump(mode="json")},
        ts=datetime.now(timezone.utc),
    )
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return session


@router.post("/{session_id}/qna/close", response_model=Session)
async def close_qna(
    session_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Session:
    try:
        session = await store.set_qna_status(session_id, False, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    session = with_join_url(session)
    event = Event(
        type="qna_closed",
        payload={"session": session.model_dump(mode="json")},
        ts=datetime.now(timezone.utc),
    )
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return session
