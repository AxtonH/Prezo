from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, ConfigDict


class SessionStatus(str, Enum):
    active = "active"
    ended = "ended"


class QnaMode(str, Enum):
    audience = "audience"
    prompt = "prompt"


class QuestionStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    hidden = "hidden"


class PollStatus(str, Enum):
    closed = "closed"
    open = "open"


class QnaPromptStatus(str, Enum):
    closed = "closed"
    open = "open"


class SessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class Session(BaseModel):
    id: str
    code: str
    title: str | None
    status: SessionStatus
    qna_open: bool
    qna_mode: QnaMode = QnaMode.audience
    qna_prompt: str | None = None
    created_at: datetime
    join_url: str | None = None


class QuestionCreate(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    client_id: str | None = Field(default=None, max_length=64)
    prompt_id: str | None = Field(default=None, max_length=64)


class Question(BaseModel):
    id: str
    session_id: str
    prompt_id: str | None = None
    text: str
    status: QuestionStatus
    votes: int
    created_at: datetime


class QuestionVote(BaseModel):
    client_id: str | None = Field(default=None, max_length=64)


class PollCreate(BaseModel):
    question: str = Field(min_length=1, max_length=200)
    options: list[str] = Field(min_length=2, max_length=10)
    allow_multiple: bool = False


class PollOption(BaseModel):
    id: str
    label: str
    votes: int


class Poll(BaseModel):
    id: str
    session_id: str
    question: str
    options: list[PollOption]
    status: PollStatus
    allow_multiple: bool
    created_at: datetime


class PollVote(BaseModel):
    option_id: str
    client_id: str | None = Field(default=None, max_length=64)


class QnaPromptCreate(BaseModel):
    prompt: str = Field(min_length=1, max_length=200)


class QnaPrompt(BaseModel):
    id: str
    session_id: str
    prompt: str
    status: QnaPromptStatus
    created_at: datetime


class SessionSnapshot(BaseModel):
    session: Session
    questions: list[Question]
    polls: list[Poll]
    prompts: list[QnaPrompt]


class QnaConfigUpdate(BaseModel):
    mode: QnaMode
    prompt: str | None = Field(default=None, max_length=200)


class Event(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    payload: dict[str, Any]
    ts: datetime
