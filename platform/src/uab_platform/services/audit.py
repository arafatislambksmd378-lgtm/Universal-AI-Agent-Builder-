"""Audit service — thin wrapper so call sites don't juggle correlation IDs."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from uab_platform.logging import correlation_id_ctx
from uab_platform.repositories import audit as audit_repo


def emit_audit(
    session: Session,
    *,
    event_type: str,
    workspace_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    audit_repo.emit(
        session,
        event_type=event_type,
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        target_type=target_type,
        target_id=target_id,
        metadata=metadata,
        correlation_id=correlation_id_ctx.get("-"),
    )
