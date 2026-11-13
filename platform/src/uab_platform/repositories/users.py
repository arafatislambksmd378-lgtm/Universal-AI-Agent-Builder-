"""User persistence."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from uab_platform.db.models import User


def get_user_by_email(session: Session, email: str) -> User | None:
    return session.scalar(select(User).where(User.email == email.lower()))


def get_user_by_id(session: Session, user_id: uuid.UUID) -> User | None:
    return session.get(User, user_id)


def create_user(session: Session, *, email: str, password_hash: str, display_name: str) -> User:
    user = User(email=email.lower(), password_hash=password_hash, display_name=display_name.strip())
    session.add(user)
    session.flush()
    return user


def count_users(session: Session) -> int:
    return int(session.scalar(select(func.count()).select_from(User)) or 0)
