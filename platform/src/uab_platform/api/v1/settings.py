"""Global application settings (operator scope).

Reads: any authenticated user (settings are non-secret by convention — never
store credentials here). Writes: platform superadmin only (seeded via
`uab-bootstrap`), which mirrors how infrastructure-level config is managed.
Secret settings belong in the deployment environment, not in this table.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from uab_platform.api.deps import get_current_user, get_db, get_superadmin
from uab_platform.db.models import User
from uab_platform.repositories import settings as settings_repo
from uab_platform.services import audit as audit_service

router = APIRouter(prefix="/settings", tags=["settings"])


class AppSettingItem(BaseModel):
    key: str
    value: Any
    updated_at: str


class AppSettingUpsert(BaseModel):
    key: str = Field(min_length=1, max_length=200, pattern=r"^[a-z0-9][a-z0-9._-]*$")
    value: Any


@router.get("", response_model=list[AppSettingItem])
def list_settings(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> list[AppSettingItem]:
    return [
        AppSettingItem(key=s.key, value=s.value, updated_at=s.updated_at.isoformat())
        for s in settings_repo.list_settings(session)
    ]


@router.put("", response_model=AppSettingItem)
def upsert_setting(
    body: AppSettingUpsert,
    admin: User = Depends(get_superadmin),
    session: Session = Depends(get_db),
) -> AppSettingItem:
    setting = settings_repo.upsert_setting(session, key=body.key, value=body.value, updated_by=admin.id)
    audit_service.emit_audit(
        session,
        event_type="settings.updated",
        actor_user_id=admin.id,
        target_type="app_setting",
        target_id=setting.key,
    )
    session.commit()
    session.refresh(setting)
    return AppSettingItem(key=setting.key, value=setting.value, updated_at=setting.updated_at.isoformat())
