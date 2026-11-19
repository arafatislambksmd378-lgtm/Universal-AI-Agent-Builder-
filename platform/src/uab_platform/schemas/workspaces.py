"""Workspace + membership schemas."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")


def _slug(v: object) -> str:
    if not isinstance(v, str):
        raise ValueError("slug must be a string")
    value = v.strip().lower()
    if not _SLUG_RE.match(value):
        raise ValueError("slug must match ^[a-z0-9][a-z0-9-]{1,62}$")
    return value


WorkspaceRoleValue = Literal["owner", "admin", "member", "viewer"]


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = None

    _slug_ok = field_validator("slug")(_slug)


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    created_at: datetime
    updated_at: datetime


class MemberAdd(BaseModel):
    email: str
    role: WorkspaceRoleValue = "member"

    _email_ok = field_validator("email")(lambda v: v.strip().lower() if isinstance(v, str) else v)


class MemberUpdate(BaseModel):
    role: WorkspaceRoleValue


class MemberResponse(BaseModel):
    user_id: uuid.UUID
    email: str
    display_name: str
    role: str
    created_at: datetime
