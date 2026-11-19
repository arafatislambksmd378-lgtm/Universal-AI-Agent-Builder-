"""Agent registry schemas."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
_TEMPERATURE_HARD_CAP = 2.0
_CAPABILITY_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,39}$")
_MAX_CAPABILITIES = 40
# Avatar types: 'preset' = platform-provided character library (frontend ships the artwork),
# 'upload' = user-uploaded image stored by the platform/frontend, 'url' = direct external image
# URL, 'generated' = reserved for future image-generation providers (not wired up yet).
AvatarType = Literal["preset", "upload", "url", "generated"]


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


def _capabilities(v: object) -> list[str]:
    if v is None:
        return []
    if not isinstance(v, list):
        raise ValueError("capabilities must be a list of strings")
    if len(v) > _MAX_CAPABILITIES:
        raise ValueError(f"at most {_MAX_CAPABILITIES} capabilities per agent")
    cleaned: list[str] = []
    for item in v:
        if not isinstance(item, str):
            raise ValueError("capabilities must be strings")
        tag = item.strip().lower()
        if not _CAPABILITY_RE.match(tag):
            raise ValueError("capability tags must match ^[a-z0-9][a-z0-9_.-]{0,39}$")
        cleaned.append(tag)
    # de-duplicate, preserving order
    return list(dict.fromkeys(cleaned))


class _AvatarIn(BaseModel):
    """Structured avatar identity supplied by clients (all optional)."""

    avatar_id: str | None = Field(default=None, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=1000)
    avatar_type: AvatarType | None = None
    avatar_style: str | None = Field(default=None, max_length=120)
    avatar_metadata: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _avatar_reference_present(self) -> _AvatarIn:
        if self.avatar_type is not None and not (self.avatar_id or self.avatar_url):
            raise ValueError("avatar_type requires avatar_id (preset) or avatar_url (upload/url/generated)")
        return self


class AgentCreate(_AvatarIn):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = None
    role: str = Field(default="assistant", max_length=120)
    description: str = Field(default="", max_length=10_000)
    avatar_ref: str | None = Field(default=None, max_length=500)  # legacy: prefer avatar_* fields
    system_instructions: str = Field(default="", max_length=200_000)
    capabilities: list[str] = Field(default_factory=list)
    config: AgentConfigIn = Field(default_factory=AgentConfigIn)

    _slug_ok = field_validator("slug")(_slug)
    _capabilities_ok = field_validator("capabilities", mode="before")(_capabilities)


class AgentUpdate(_AvatarIn):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    role: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=10_000)
    avatar_ref: str | None = Field(default=None, max_length=500)
    system_instructions: str | None = Field(default=None, max_length=200_000)
    capabilities: list[str] | None = None
    config: AgentConfigIn | None = None

    @field_validator("capabilities")
    @classmethod
    def _capabilities_ok_update(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _capabilities(v)


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    slug: str
    name: str
    role: str
    description: str
    avatar_ref: str | None  # legacy
    avatar_id: str | None = None
    avatar_url: str | None = None
    avatar_type: str | None = None
    avatar_style: str | None = None
    avatar_metadata: dict[str, Any] | None = None
    capabilities: list[str] = Field(default_factory=list)
    status: str
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    config: AgentConfigOut | None = None
    # --- Reserved for org model (BATCH 04+). Always null for now; the keys are part of the
    # --- contract so frontends can rely on them existing.
    team: str | None = None
    organization: str | None = None


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
