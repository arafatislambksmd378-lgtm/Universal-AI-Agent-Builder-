"""Audit event persistence — append-only."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from uab_platform.db.models import AuditEvent
from uab_platform.repositories.base import paginate


def emit(
    session: Session,
    *,
    event_type: str,
    workspace_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    correlation_id: str | None = None,
) -> AuditEvent:
    event = AuditEvent(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        event_type=event_type,
        target_type=target_type,
        target_id=target_id,
        event_metadata=metadata or {},
        correlation_id=correlation_id,
    )
    session.add(event)
    session.flush()
    return event


def list_for_workspace(
    session: Session,
    *,
    workspace_id: uuid.UUID,
    event_type: str | None,
    limit: int,
    offset: int,
) -> tuple[list[AuditEvent], int]:
    stmt = (
        select(AuditEvent)
        .where(AuditEvent.workspace_id == workspace_id)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
    )
    if event_type:
        stmt = stmt.where(AuditEvent.event_type == event_type)
    page = paginate(session, stmt, limit=limit, offset=offset)
    return page.items, page.total
