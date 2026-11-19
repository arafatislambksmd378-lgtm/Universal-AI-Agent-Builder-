"""Global application settings persistence (JSONB values)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from uab_platform.db.models import AppSetting


def get_setting(session: Session, key: str) -> AppSetting | None:
    return session.get(AppSetting, key)


def list_settings(session: Session) -> list[AppSetting]:
    return list(session.scalars(select(AppSetting).order_by(AppSetting.key.asc())).all())


def upsert_setting(session: Session, *, key: str, value: Any, updated_by: uuid.UUID | None) -> AppSetting:
    setting = session.get(AppSetting, key)
    if setting is None:
        setting = AppSetting(key=key, value=value, updated_by=updated_by)
    else:
        setting.value = value
        setting.updated_by = updated_by
    session.add(setting)
    session.flush()
    return setting
