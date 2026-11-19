"""Auth + user schemas."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(v: object) -> str:
    if not isinstance(v, str):
        raise ValueError("email must be a string")
    value = v.strip().lower()
    if not _EMAIL_RE.match(value):
        raise ValueError("invalid email address")
    if len(value) > 320:
        raise ValueError("email too long")
    return value


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=10, max_length=256)
    display_name: str = Field(default="", max_length=200)

    _email_ok = field_validator("email")(_normalize_email)


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=256)

    _email_ok = field_validator("email")(_normalize_email)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105 - token type label, not a credential
    expires_in: int


class WorkspaceMembershipInfo(BaseModel):
    workspace_id: uuid.UUID
    workspace_name: str
    workspace_slug: str
    role: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    is_active: bool
    created_at: datetime


class MeResponse(BaseModel):
    user: UserResponse
    memberships: list[WorkspaceMembershipInfo]
    permissions: dict[str, list[str]]
