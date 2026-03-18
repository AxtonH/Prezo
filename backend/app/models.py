from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, ConfigDict, model_validator


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
    allow_host_join: bool = False
    is_original_host: bool | None = None
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


class SavedTheme(BaseModel):
    id: str
    name: str
    theme: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SavedThemeUpsert(BaseModel):
    theme: dict[str, Any]


class ArtifactPackageFile(BaseModel):
    path: str = Field(min_length=1, max_length=256)
    content: str = ""
    language: str | None = Field(default=None, max_length=32)


class ArtifactPackage(BaseModel):
    format: str = Field(default="prezo-artifact-package@1", max_length=64)
    entry: str = Field(default="index.html", min_length=1, max_length=256)
    files: list[ArtifactPackageFile] = Field(min_length=1)


class SavedArtifact(BaseModel):
    id: str
    name: str
    html: str
    artifact_package: ArtifactPackage | None = None
    last_prompt: str | None = None
    last_answers: dict[str, Any] = Field(default_factory=dict)
    theme_snapshot: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class SavedArtifactUpsert(BaseModel):
    html: str = Field(default="")
    artifact_package: ArtifactPackage | None = None
    last_prompt: str | None = Field(default=None, max_length=4000)
    last_answers: dict[str, Any] = Field(default_factory=dict)
    theme_snapshot: dict[str, Any] | None = None

    @model_validator(mode="after")
    def ensure_html_or_package(self) -> SavedArtifactUpsert:
        html = self.html.strip()
        if html:
            self.html = html
        if not html and not self.artifact_package:
            raise ValueError("Artifact HTML or artifact package is required")
        return self


class SavedArtifactVersion(BaseModel):
    id: str
    artifact_id: str
    name: str
    version: int
    html: str
    artifact_package: ArtifactPackage | None = None
    last_prompt: str | None = None
    last_answers: dict[str, Any] = Field(default_factory=dict)
    theme_snapshot: dict[str, Any] | None = None
    source: str | None = None
    created_at: datetime


class LibrarySyncToken(BaseModel):
    token: str
    expires_at: datetime


class QnaConfigUpdate(BaseModel):
    mode: QnaMode
    prompt: str | None = Field(default=None, max_length=200)


class HostJoinRequest(BaseModel):
    code: str = Field(min_length=1, max_length=32)


class HostAccessUpdate(BaseModel):
    allow_host_join: bool


class Event(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    payload: dict[str, Any]
    ts: datetime
