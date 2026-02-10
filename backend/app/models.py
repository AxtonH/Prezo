from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, ConfigDict


class SessionStatus(str, Enum):
    active = "active"
    ended = "ended"


class QuestionStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    hidden = "hidden"


class PollStatus(str, Enum):
    closed = "closed"
    open = "open"


class WordCloudStatus(str, Enum):
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
    created_at: datetime
    join_url: str | None = None


class QuestionCreate(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    client_id: str | None = Field(default=None, max_length=64)


class Question(BaseModel):
    id: str
    session_id: str
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


class WordCloudCreate(BaseModel):
    prompt: str | None = Field(default=None, max_length=120)
    words: list[str] = Field(min_length=2, max_length=5)


class WordCloudWord(BaseModel):
    id: str
    label: str
    votes: int


class WordCloud(BaseModel):
    id: str
    session_id: str
    prompt: str | None
    words: list[WordCloudWord]
    status: WordCloudStatus
    created_at: datetime


class WordCloudVote(BaseModel):
    word_id: str
    client_id: str | None = Field(default=None, max_length=64)


class SessionSnapshot(BaseModel):
    session: Session
    questions: list[Question]
    polls: list[Poll]
    word_clouds: list[WordCloud]


class Event(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    payload: dict[str, Any]
    ts: datetime
