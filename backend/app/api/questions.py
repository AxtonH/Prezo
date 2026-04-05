from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import AuthUser, get_current_user
from ..deps import get_manager, get_store
from ..models import Question, QuestionCreate, QuestionStatus, QuestionVote, SessionActivity
from ..realtime import ConnectionManager
from ..store import ConflictError, InMemoryStore, NotFoundError

router = APIRouter(prefix="/sessions/{session_id}/questions", tags=["questions"])


def make_activity(activity_type: str, payload: dict) -> SessionActivity:
    return SessionActivity(
        type=activity_type, payload=payload, ts=datetime.now(timezone.utc)
    )


@router.post("", response_model=Question, status_code=status.HTTP_201_CREATED)
async def create_question(
    session_id: str,
    payload: QuestionCreate,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> Question:
    try:
        question = await store.create_question(
            session_id, payload.text, payload.prompt_id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    activity = make_activity(
        "question_submitted", {"question": question.model_dump(mode="json")}
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return question


@router.post("/{question_id}/approve", response_model=Question)
async def approve_question(
    session_id: str,
    question_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Question:
    try:
        question = await store.set_question_status(
            session_id, question_id, QuestionStatus.approved, user.id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    activity = make_activity(
        "question_approved", {"question": question.model_dump(mode="json")}
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return question


@router.post("/{question_id}/hide", response_model=Question)
async def hide_question(
    session_id: str,
    question_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> Question:
    try:
        question = await store.set_question_status(
            session_id, question_id, QuestionStatus.hidden, user.id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    activity = make_activity(
        "question_hidden", {"question": question.model_dump(mode="json")}
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return question


@router.post("/{question_id}/vote", response_model=Question)
async def vote_question(
    session_id: str,
    question_id: str,
    payload: QuestionVote,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
) -> Question:
    try:
        question = await store.vote_question(session_id, question_id, payload.client_id)
    except (NotFoundError, ConflictError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    activity = make_activity(
        "question_vote_updated", {"question": question.model_dump(mode="json")}
    )
    await store.record_activity(session_id, activity)
    await manager.broadcast(session_id, activity)
    return question
