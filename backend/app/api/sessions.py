from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel

from ..auth import AuthUser, get_current_user, get_library_user, get_optional_user
from ..cache_headers import apply_short_cache_headers, compute_etag, is_etag_match
from ..config import settings
from ..deps import get_manager, get_store
from ..models import (
    BatchSessionStatsRequest,
    SessionActivity,
    HostAccessUpdate,
    HostDashboardStats,
    HostJoinRequest,
    SessionSessionStats,
    QnaConfigUpdate,
    QnaMode,
    Session,
    SessionCreate,
    SessionSnapshot,
    SessionStatus,
)
from ..realtime import ConnectionManager
from ..store import (
    ConflictError,
    InMemoryStore,
    NotFoundError,
    PermissionDeniedError,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


class AudienceQuestionsDeletedResponse(BaseModel):
    question_ids: list[str]


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


@router.post("/host-join", response_model=Session)
async def join_session_as_host(
    payload: HostJoinRequest,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> Session:
    try:
        session = await store.join_session_as_host(payload.code.strip().upper(), user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return with_join_url(session)


@router.post("/{session_id}/host-access", response_model=Session)
async def update_host_access(
    session_id: str,
    payload: HostAccessUpdate,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Session:
    try:
        session = await store.set_host_join_access(
            session_id, payload.allow_host_join, user.id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    session = with_join_url(session)
    activity = SessionActivity(
        type="host_access_updated",
        payload={"session": session.model_dump(mode="json")},
        ts=datetime.now(timezone.utc),
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return session


@router.get("", response_model=list[Session])
async def list_sessions(
    status: SessionStatus | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=100),
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_library_user),
) -> list[Session]:
    sessions = await store.list_sessions(user.id, status=status, limit=limit)
    return [with_join_url(session) for session in sessions]


@router.get("/dashboard-stats", response_model=HostDashboardStats)
async def get_host_dashboard_stats(
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> HostDashboardStats:
    return await store.host_dashboard_stats(user.id)


@router.get("/{session_id}/session-stats", response_model=SessionSessionStats)
async def get_session_session_stats(
    session_id: str,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> SessionSessionStats:
    try:
        return await store.session_session_stats(session_id, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/batch-stats", response_model=dict[str, SessionSessionStats])
async def batch_session_stats(
    body: BatchSessionStatsRequest,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> dict[str, SessionSessionStats]:
    return await store.batch_session_stats(body.session_ids, user.id)


@router.get("/{session_id}", response_model=Session)
async def get_session(
    session_id: str, store: InMemoryStore = Depends(get_store)
) -> Session:
    try:
        session = await store.get_session(session_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return with_join_url(session)


@router.delete("/{session_id}", response_model=Session)
async def delete_session(
    session_id: str,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser = Depends(get_current_user),
) -> Session:
    try:
        session = await store.delete_session(session_id, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
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


@router.get("/snapshots", response_model=dict[str, SessionSnapshot])
async def get_snapshots_batch(
    request: Request,
    response: Response,
    ids: str = Query(
        ...,
        description="Comma-separated session ids; missing sessions are omitted, not error.",
    ),
    store: InMemoryStore = Depends(get_store),
):
    """Return share-safe snapshots for multiple sessions in one round trip.

    Used by the host-taskpane prefetcher to warm the embed cache for every
    Prezo embed in the open deck. Snapshots are computed without a
    ``viewer_user_id`` so the cached payload is share-safe — viewer-specific
    overlays (currently only ``Session.is_original_host``) flow in over the
    embed's own WebSocket once it connects.

    Sessions the caller doesn't have access to or that don't exist are
    silently omitted from the response map; the rest still resolve. This
    keeps a single bad id from poisoning a whole prefetch batch.

    The response gets the same ETag + Cache-Control treatment as the single
    snapshot endpoint, with the hash computed over the full ordered map.
    """
    requested_ids = [chunk.strip() for chunk in ids.split(",") if chunk.strip()]
    # Cap on count keeps a malicious caller from prefetching the whole
    # universe in one request. 50 covers any realistic deck.
    if len(requested_ids) > 50:
        raise HTTPException(status_code=400, detail="too many ids (max 50)")
    if not requested_ids:
        return {}

    # Dedupe while preserving order: callers may legitimately list the same
    # session twice (e.g., two embeds with the same binding) and we don't
    # want to do duplicate work or break the etag determinism.
    seen: set[str] = set()
    ordered_ids = []
    for sid in requested_ids:
        if sid not in seen:
            seen.add(sid)
            ordered_ids.append(sid)

    snapshots: dict[str, SessionSnapshot] = {}
    for session_id in ordered_ids:
        try:
            snapshot = await store.snapshot(session_id, viewer_user_id=None)
        except NotFoundError:
            continue
        snapshots[session_id] = snapshot.model_copy(
            update={"session": with_join_url(snapshot.session)}
        )

    etag = compute_etag(snapshots)
    if is_etag_match(request, etag):
        return Response(status_code=304, headers={"ETag": etag})

    apply_short_cache_headers(response, etag=etag)
    return snapshots


@router.get("/{session_id}/snapshot", response_model=SessionSnapshot)
async def get_snapshot(
    session_id: str,
    request: Request,
    response: Response,
    store: InMemoryStore = Depends(get_store),
    user: AuthUser | None = Depends(get_optional_user),
):
    """Return the session snapshot, with ETag-based conditional revalidation.

    Snapshots are read on every embed boot, every disconnected-WebSocket
    polling tick, and every prefetch from the host taskpane. Most of those
    requests resolve to identical bodies, so we hash the rendered payload and
    serve a 304 Not Modified when the client already has the same version.
    See ``app.cache_headers`` for the policy details.
    """
    try:
        viewer_id = user.id if user else None
        snapshot = await store.snapshot(session_id, viewer_user_id=viewer_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    snapshot = snapshot.model_copy(update={"session": with_join_url(snapshot.session)})

    etag = compute_etag(snapshot)
    if is_etag_match(request, etag):
        # 304s carry the validator so the next round trip can match again.
        return Response(status_code=304, headers={"ETag": etag})

    apply_short_cache_headers(response, etag=etag)
    return snapshot


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
    activity = SessionActivity(
        type="qna_opened",
        payload={"session": session.model_dump(mode="json")},
        ts=datetime.now(timezone.utc),
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
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
    activity = SessionActivity(
        type="qna_closed",
        payload={"session": session.model_dump(mode="json")},
        ts=datetime.now(timezone.utc),
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return session


@router.delete(
    "/{session_id}/qna/audience-questions",
    response_model=AudienceQuestionsDeletedResponse,
)
async def delete_audience_questions(
    session_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> AudienceQuestionsDeletedResponse:
    try:
        question_ids = await store.delete_audience_questions(session_id, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    activity = SessionActivity(
        type="audience_questions_deleted",
        payload={"question_ids": question_ids},
        ts=datetime.now(timezone.utc),
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return AudienceQuestionsDeletedResponse(question_ids=question_ids)


@router.post("/{session_id}/qna/config", response_model=Session)
async def set_qna_config(
    session_id: str,
    payload: QnaConfigUpdate,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Session:
    prompt = payload.prompt.strip() if payload.prompt else None
    if payload.mode == QnaMode.prompt and not prompt:
        raise HTTPException(
            status_code=400, detail="Prompt text is required for prompt mode"
        )
    if payload.mode != QnaMode.prompt:
        prompt = None
    try:
        session = await store.set_qna_config(session_id, payload.mode, prompt, user.id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    session = with_join_url(session)
    activity = SessionActivity(
        type="qna_config_updated",
        payload={"session": session.model_dump(mode="json")},
        ts=datetime.now(timezone.utc),
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return session
