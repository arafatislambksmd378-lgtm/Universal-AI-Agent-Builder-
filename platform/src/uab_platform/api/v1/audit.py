"""Audit log read routes (append-only; writes happen inside services)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from uab_platform.api.deps import get_db, require_permission
from uab_platform.repositories import audit as audit_repo
from uab_platform.schemas.audit import AuditEventResponse
from uab_platform.schemas.common import Page

router = APIRouter(prefix="/workspaces/{workspace_id}/audit", tags=["audit"])


@router.get("", response_model=Page[AuditEventResponse])
def list_audit_events(
    workspace_id: uuid.UUID,
    event_type: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    membership=Depends(require_permission("audit:read")),
    session: Session = Depends(get_db),
) -> Page[AuditEventResponse]:
    items, total = audit_repo.list_for_workspace(
        session, workspace_id=workspace_id, event_type=event_type, limit=limit, offset=offset
    )
    return Page[AuditEventResponse](
        items=[AuditEventResponse.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )
