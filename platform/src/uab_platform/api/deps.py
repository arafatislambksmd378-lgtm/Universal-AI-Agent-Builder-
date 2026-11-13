"""Shared FastAPI dependencies: DB session, current user, workspace scope."""

from __future__ import annotations

import uuid
from collections.abc import Iterator

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from uab_platform.api.errors import Forbidden, NotFound, Unauthenticated
from uab_platform.config import Settings, get_settings
from uab_platform.db import session as db_session
from uab_platform.db.models import User, WorkspaceMembership
from uab_platform.repositories import users as users_repo
from uab_platform.repositories import workspaces as workspaces_repo
from uab_platform.security import rbac
from uab_platform.security.tokens import TokenError, verify_token


def get_db() -> Iterator[Session]:
    """Request-scoped session.

    Handlers may call ``session.commit()`` explicitly (harmless double-commit —
    a clean session issues nothing). Anything left uncommitted is committed on a
    successful request and rolled back on any exception.
    """
    session = db_session.get_session_factory()()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    else:
        session.commit()
    finally:
        session.close()


def get_current_user(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthenticated("missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = verify_token(settings, token, "access")
    except TokenError as exc:
        raise Unauthenticated(str(exc)) from exc
    try:
        user_id = uuid.UUID(claims.subject)
    except ValueError as exc:
        raise Unauthenticated("token subject is not a user id") from exc
    user = users_repo.get_user_by_id(session, user_id)
    if user is None or not user.is_active:
        raise Unauthenticated("user no longer exists or is deactivated")
    return user


def get_membership(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> WorkspaceMembership:
    membership = workspaces_repo.get_membership(session, workspace_id=workspace_id, user_id=user.id)
    if membership is None:
        # Existence of the workspace is not leaked to non-members.
        raise NotFound("workspace not found")
    return membership


def require_permission(permission: str):
    """Dependency factory: 403 unless the workspace membership grants `permission`."""

    def _guard(membership: WorkspaceMembership = Depends(get_membership)) -> WorkspaceMembership:
        if not rbac.has_permission(membership.role, permission):
            raise Forbidden(f"role {membership.role!r} lacks permission {permission!r}")
        return membership

    return _guard


def get_superadmin(user: User = Depends(get_current_user)) -> User:
    if not user.is_superadmin:
        raise Forbidden("platform administrator required")
    return user
