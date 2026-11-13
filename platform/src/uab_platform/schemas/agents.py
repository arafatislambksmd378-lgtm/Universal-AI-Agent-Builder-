"""Agent registry schemas."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
_TEMPERATURE_HARD_CAP = 2.0


def _slug(v: object) -> str:
    if not isinstance(v, str):
        raise ValueError("slug must be a string")
    value = v.strip().lower()
    if not _SLUG_RE.match(value):
        raise ValueError("slug must match ^[a-z0-9][a-z0-9-]{1,62}$")
    return value


class AgentConfigIn(BaseModel):
    provider: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=200)
    temperature: float | None = Field(default=None, ge=0.0, le=_TEMPERATURE_HARD_CAP)
    max_tokens: int | None = Field(default=None, gt=0, le=1_000_000)
    tool_allowlist: list[str] = Field(default_factory=list)
    memory_policy: dict[str, Any] = Field(default_factory=dict)
    budget_cents: int | None = Field(default=None, ge=0)


class AgentConfigOut(AgentConfigIn):
    model_config = ConfigDict(from_attributes=True)

    updated_at: datetime | None = None


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = None
    role: str = Field(default="assistant", max_length=120)
    description: str = Field(default="", max_length=10_000)
    avatar_ref: str | None = Field(default=None, max_length=500)
    system_instructions: str = Field(default="", max_length=200_000)
    config: AgentConfigIn = Field(default_factory=AgentConfigIn)

    _slug_ok = field_validator("slug")(_slug)


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    role: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=10_000)
    avatar_ref: str | None = Field(default=None, max_length=500)
    system_instructions: str | None = Field(default=None, max_length=200_000)
    config: AgentConfigIn | None = None


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    slug: str
    name: str
    role: str
    description: str
    avatar_ref: str | None
    status: str
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    config: AgentConfigOut | None = None


LifecycleAction = Literal["activate", "pause", "archive", "restore"]

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    # target status after each action, keyed by action
    "activate": {"draft", "paused"},
    "pause": {"active"},
    "archive": {"draft", "active", "paused"},
    "restore": {"archived"},
}

_ACTION_TARGET = {"activate": "active", "pause": "paused", "archive": "archived", "restore": "draft"}


def target_status_for(action: LifecycleAction) -> str:
    return _ACTION_TARGET[action]


def allowed_from_statuses(action: LifecycleAction) -> set[str]:
    return set(_ALLOWED_TRANSITIONS[action])
