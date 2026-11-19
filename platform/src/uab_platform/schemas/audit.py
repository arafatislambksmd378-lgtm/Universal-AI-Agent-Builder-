"""Audit event schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: uuid.UUID | None
    actor_user_id: uuid.UUID | None
    event_type: str
    target_type: str | None
    target_id: str | None
    event_metadata: dict[str, Any]
    correlation_id: str | None
    created_at: datetime
