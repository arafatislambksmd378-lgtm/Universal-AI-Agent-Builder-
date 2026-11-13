"""Auth routes: first-run bootstrap registration, login, refresh, me."""

from __future__ import annotations

import secrets
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from uab_platform.api.deps import get_current_user, get_db
from uab_platform.api.errors import Conflict, Forbidden, Unauthenticated
from uab_platform.config import Settings, get_settings
from uab_platform.db.models import User
from uab_platform.repositories import users as users_repo
from uab_platform.repositories import workspaces as workspaces_repo
from uab_platform.schemas.auth import (
    LoginRequest,
    MeResponse,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserResponse,
    WorkspaceMembershipInfo,
)
from uab_platform.schemas.workspaces import WorkspaceResponse
from uab_platform.security.passwords import hash_password, verify_password
from uab_platform.security.rbac import permissions_for
from uab_platform.security.tokens import TokenError, issue_token, verify_token
from uab_platform.services import audit as audit_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _slugify_local_part(email: str) -> str:
    local = email.split("@", 1)[0].lower()
    cleaned = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in local).strip("-")
    cleaned = cleaned[:40].strip("-") or "workspace"
    return f"{cleaned}-{secrets.token_hex(3)}"


def _issue_pair(settings: Settings, user: User) -> TokenPair:
    access, _ = issue_token(settings, str(user.id), "access")
    refresh, _ = issue_token(settings, str(user.id), "refresh")
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=settings.access_token_ttl_seconds)


class RegisterResponse(BaseModel):
    user: UserResponse
    tokens: TokenPair
    workspace: WorkspaceResponse


class LoginResponse(BaseModel):
    user: UserResponse
    tokens: TokenPair


@router.post("/register", response_model=RegisterResponse, status_code=201)
def register(
    body: RegisterRequest,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RegisterResponse:
    existing = users_repo.get_user_by_email(session, body.email)
    if existing is not None:
        raise Conflict("a user with this email already exists")

    user_count = users_repo.count_users(session)
    is_first_user = user_count == 0
    if not is_first_user and not settings.allow_open_registration:
        raise Forbidden("registration is closed on this instance")

    user = users_repo.create_user(
        session,
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name or body.email.split("@", 1)[0],
    )
    workspace_name = f"{user.display_name}'s workspace" if user.display_name else "Personal workspace"
    workspace = workspaces_repo.create_workspace(session, slug=_slugify_local_part(user.email), name=workspace_name)
    workspaces_repo.add_member(session, workspace_id=workspace.id, user_id=user.id, role="owner")
    audit_service.emit_audit(
        session,
        event_type="workspace.created",
        workspace_id=workspace.id,
        actor_user_id=user.id,
        target_type="workspace",
        target_id=str(workspace.id),
        metadata={"slug": workspace.slug, "bootstrap": True},
    )
    audit_service.emit_audit(
        session,
        event_type="user.registered",
        workspace_id=workspace.id,
        actor_user_id=user.id,
        target_type="user",
        target_id=str(user.id),
        metadata={"bootstrap": is_first_user},
    )
    session.commit()
    session.refresh(user)
    session.refresh(workspace)
    return RegisterResponse(
        user=UserResponse.model_validate(user),
        tokens=_issue_pair(settings, user),
        workspace=WorkspaceResponse.model_validate(workspace),
    )


@router.post("/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LoginResponse:
    user = users_repo.get_user_by_email(session, body.email)
    if user is None or not verify_password(body.password, user.password_hash):
        raise Unauthenticated("invalid email or password")
    if not user.is_active:
        raise Unauthenticated("account is deactivated")
    audit_service.emit_audit(
        session,
        event_type="user.login",
        actor_user_id=user.id,
        target_type="user",
        target_id=str(user.id),
    )
    session.commit()
    return LoginResponse(user=UserResponse.model_validate(user), tokens=_issue_pair(settings, user))


@router.post("/refresh", response_model=TokenPair)
def refresh(
    body: RefreshRequest,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenPair:
    try:
        claims = verify_token(settings, body.refresh_token, "refresh")
        user_id = uuid.UUID(claims.subject)
    except (TokenError, ValueError) as exc:
        raise Unauthenticated(str(exc)) from exc
    user = users_repo.get_user_by_id(session, user_id)
    if user is None or not user.is_active:
        raise Unauthenticated("user no longer exists or is deactivated")
    return _issue_pair(settings, user)


@router.get("/me", response_model=MeResponse)
def me(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> MeResponse:
    memberships = workspaces_repo.list_workspaces_for_user(session, user.id)
    membership_infos: list[WorkspaceMembershipInfo] = []
    permissions: dict[str, list[str]] = {}
    for ws in memberships:
        membership = workspaces_repo.get_membership(session, workspace_id=ws.id, user_id=user.id)
        role = membership.role if membership else "viewer"
        membership_infos.append(
            WorkspaceMembershipInfo(workspace_id=ws.id, workspace_name=ws.name, workspace_slug=ws.slug, role=role)
        )
        permissions[str(ws.id)] = permissions_for(role)
    return MeResponse(user=UserResponse.model_validate(user), memberships=membership_infos, permissions=permissions)
