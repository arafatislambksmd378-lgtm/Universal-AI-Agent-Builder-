"""Workspace + membership routes."""

from __future__ import annotations

import re
import secrets
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from uab_platform.api.deps import get_current_user, get_db, require_permission
from uab_platform.api.errors import Conflict, Forbidden, NotFound
from uab_platform.db.models import User
from uab_platform.repositories import users as users_repo
from uab_platform.repositories import workspaces as workspaces_repo
from uab_platform.schemas.workspaces import (
    MemberAdd,
    MemberResponse,
    MemberUpdate,
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from uab_platform.services import audit as audit_service

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)[:60].strip("-")
    return slug or "workspace"


def _workspace_or_404(session: Session, workspace_id: uuid.UUID):
    ws = workspaces_repo.get_workspace_by_id(session, workspace_id)
    if ws is None:
        raise NotFound("workspace not found")
    return ws


@router.post("", response_model=WorkspaceResponse, status_code=201)
def create_workspace(
    body: WorkspaceCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> WorkspaceResponse:
    slug = body.slug or f"{_slugify(body.name)}-{secrets.token_hex(2)}"
    if workspaces_repo.get_workspace_by_slug(session, slug) is not None:
        raise Conflict("workspace slug already exists")
    ws = workspaces_repo.create_workspace(session, slug=slug, name=body.name)
    workspaces_repo.add_member(session, workspace_id=ws.id, user_id=user.id, role="owner")
    audit_service.emit_audit(
        session,
        event_type="workspace.created",
        workspace_id=ws.id,
        actor_user_id=user.id,
        target_type="workspace",
        target_id=str(ws.id),
        metadata={"slug": ws.slug},
    )
    session.commit()
    session.refresh(ws)
    return WorkspaceResponse.model_validate(ws)


@router.get("", response_model=list[WorkspaceResponse])
def list_my_workspaces(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> list[WorkspaceResponse]:
    return [WorkspaceResponse.model_validate(ws) for ws in workspaces_repo.list_workspaces_for_user(session, user.id)]


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(
    workspace_id: uuid.UUID,
    membership=Depends(require_permission("workspace:read")),
    session: Session = Depends(get_db),
) -> WorkspaceResponse:
    return WorkspaceResponse.model_validate(_workspace_or_404(session, workspace_id))


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace(
    workspace_id: uuid.UUID,
    body: WorkspaceUpdate,
    membership=Depends(require_permission("workspace:update")),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> WorkspaceResponse:
    ws = _workspace_or_404(session, workspace_id)
    if body.name is not None:
        ws.name = body.name.strip()
    session.add(ws)
    audit_service.emit_audit(
        session,
        event_type="workspace.updated",
        workspace_id=ws.id,
        actor_user_id=user.id,
        target_type="workspace",
        target_id=str(ws.id),
    )
    session.commit()
    session.refresh(ws)
    return WorkspaceResponse.model_validate(ws)


@router.delete("/{workspace_id}", status_code=204)
def delete_workspace(
    workspace_id: uuid.UUID,
    membership=Depends(require_permission("workspace:delete")),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> None:
    ws = _workspace_or_404(session, workspace_id)
    audit_service.emit_audit(
        session,
        event_type="workspace.deleted",
        workspace_id=None,
        actor_user_id=user.id,
        target_type="workspace",
        target_id=str(ws.id),
        metadata={"slug": ws.slug},
    )
    session.delete(ws)
    session.commit()


@router.get("/{workspace_id}/members", response_model=list[MemberResponse])
def list_members(
    workspace_id: uuid.UUID,
    membership=Depends(require_permission("workspace:members:read")),
    session: Session = Depends(get_db),
) -> list[MemberResponse]:
    _workspace_or_404(session, workspace_id)
    rows = workspaces_repo.list_members(session, workspace_id)
    return [
        MemberResponse(
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=membership.role,
            created_at=membership.created_at,
        )
        for membership, user in rows
    ]


@router.post("/{workspace_id}/members", response_model=MemberResponse, status_code=201)
def add_member(
    workspace_id: uuid.UUID,
    body: MemberAdd,
    caller_membership=Depends(require_permission("workspace:members:manage")),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> MemberResponse:
    _workspace_or_404(session, workspace_id)
    if body.role == "owner" and caller_membership.role != "owner":
        raise Forbidden("only an owner can grant the owner role")
    target = users_repo.get_user_by_email(session, body.email)
    if target is None:
        raise NotFound("no user with this email exists")
    if workspaces_repo.get_membership(session, workspace_id=workspace_id, user_id=target.id) is not None:
        raise Conflict("user is already a member of this workspace")
    membership = workspaces_repo.add_member(session, workspace_id=workspace_id, user_id=target.id, role=body.role)
    audit_service.emit_audit(
        session,
        event_type="workspace.member_added",
        workspace_id=workspace_id,
        actor_user_id=user.id,
        target_type="user",
        target_id=str(target.id),
        metadata={"role": body.role},
    )
    session.commit()
    return MemberResponse(
        user_id=target.id,
        email=target.email,
        display_name=target.display_name,
        role=membership.role,
        created_at=membership.created_at,
    )


def _load_membership_or_404(session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID):
    membership = workspaces_repo.get_membership(session, workspace_id=workspace_id, user_id=user_id)
    if membership is None:
        raise NotFound("member not found in this workspace")
    return membership


@router.patch("/{workspace_id}/members/{user_id}", response_model=MemberResponse)
def update_member_role(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    body: MemberUpdate,
    caller_membership=Depends(require_permission("workspace:members:manage")),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> MemberResponse:
    _workspace_or_404(session, workspace_id)
    target_membership = _load_membership_or_404(session, workspace_id, user_id)

    if target_membership.role == "owner" or body.role == "owner":
        if caller_membership.role != "owner":
            raise Forbidden("only an owner can change the owner role")
    if target_membership.role == "owner" and body.role != "owner":
        if workspaces_repo.count_owners(session, workspace_id) <= 1:
            raise Conflict("cannot demote the last owner of the workspace")

    workspaces_repo.set_member_role(session, target_membership, body.role)
    audit_service.emit_audit(
        session,
        event_type="workspace.member_role_changed",
        workspace_id=workspace_id,
        actor_user_id=user.id,
        target_type="user",
        target_id=str(user_id),
        metadata={"role": body.role},
    )
    session.commit()
    target_user = users_repo.get_user_by_id(session, user_id)
    assert target_user is not None
    return MemberResponse(
        user_id=target_user.id,
        email=target_user.email,
        display_name=target_user.display_name,
        role=target_membership.role,
        created_at=target_membership.created_at,
    )


@router.delete("/{workspace_id}/members/{user_id}", status_code=204)
def remove_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    membership=Depends(require_permission("workspace:members:manage")),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> None:
    _workspace_or_404(session, workspace_id)
    target_membership = _load_membership_or_404(session, workspace_id, user_id)
    if target_membership.role == "owner" and workspaces_repo.count_owners(session, workspace_id) <= 1:
        raise Conflict("cannot remove the last owner of the workspace")
    workspaces_repo.remove_member(session, target_membership)
    audit_service.emit_audit(
        session,
        event_type="workspace.member_removed",
        workspace_id=workspace_id,
        actor_user_id=user.id,
        target_type="user",
        target_id=str(user_id),
    )
    session.commit()
