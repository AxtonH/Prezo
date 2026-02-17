from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import AuthUser, get_current_user
from ..deps import get_manager, get_store
from ..models import Event, QnaPrompt, QnaPromptCreate, QnaPromptStatus
from ..realtime import ConnectionManager
from ..store import InMemoryStore, NotFoundError

router = APIRouter(prefix="/sessions/{session_id}/qna-prompts", tags=["qna-prompts"])


def make_event(event_type: str, payload: dict) -> Event:
    return Event(type=event_type, payload=payload, ts=datetime.now(timezone.utc))


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

    event = make_event(
        "qna_prompt_created", {"prompt": prompt.model_dump(mode="json")}
    )
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return prompt


@router.post("/{prompt_id}/open", response_model=QnaPrompt)
async def open_prompt(
    session_id: str,
    prompt_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> QnaPrompt:
    try:
        prompt = await store.set_qna_prompt_status(
            session_id, prompt_id, QnaPromptStatus.open, user.id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    event = make_event(
        "qna_prompt_opened", {"prompt": prompt.model_dump(mode="json")}
    )
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return prompt


@router.post("/{prompt_id}/close", response_model=QnaPrompt)
async def close_prompt(
    session_id: str,
    prompt_id: str,
    store: InMemoryStore = Depends(get_store),
    manager: ConnectionManager = Depends(get_manager),
    user: AuthUser = Depends(get_current_user),
) -> QnaPrompt:
    try:
        prompt = await store.set_qna_prompt_status(
            session_id, prompt_id, QnaPromptStatus.closed, user.id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    event = make_event(
        "qna_prompt_closed", {"prompt": prompt.model_dump(mode="json")}
    )
    await store.record_event(session_id, event)
    await manager.broadcast(session_id, event)
    return prompt
