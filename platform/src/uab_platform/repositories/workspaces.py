"""Workspace + membership persistence."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from uab_platform.db.models import User, Workspace, WorkspaceMembership


def create_workspace(session: Session, *, slug: str, name: str) -> Workspace:
    ws = Workspace(slug=slug, name=name.strip())
    session.add(ws)
    session.flush()
    return ws


def get_workspace_by_id(session: Session, workspace_id: uuid.UUID) -> Workspace | None:
    return session.get(Workspace, workspace_id)


def get_workspace_by_slug(session: Session, slug: str) -> Workspace | None:
    return session.scalar(select(Workspace).where(Workspace.slug == slug))


def list_workspaces_for_user(session: Session, user_id: uuid.UUID) -> list[Workspace]:
    stmt = (
        select(Workspace)
        .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
        .where(WorkspaceMembership.user_id == user_id)
        .order_by(Workspace.created_at.asc())
    )
    return list(session.scalars(stmt).all())


def get_membership(session: Session, *, workspace_id: uuid.UUID, user_id: uuid.UUID) -> WorkspaceMembership | None:
    stmt = select(WorkspaceMembership).where(
        WorkspaceMembership.workspace_id == workspace_id,
        WorkspaceMembership.user_id == user_id,
    )
    return session.scalar(stmt)


def add_member(session: Session, *, workspace_id: uuid.UUID, user_id: uuid.UUID, role: str) -> WorkspaceMembership:
    membership = WorkspaceMembership(workspace_id=workspace_id, user_id=user_id, role=role)
    session.add(membership)
    session.flush()
    return membership


def set_member_role(session: Session, membership: WorkspaceMembership, role: str) -> WorkspaceMembership:
    membership.role = role
    session.add(membership)
    session.flush()
    return membership


def remove_member(session: Session, membership: WorkspaceMembership) -> None:
    session.delete(membership)
    session.flush()


def list_members(session: Session, workspace_id: uuid.UUID) -> list[tuple[WorkspaceMembership, User]]:
    stmt = (
        select(WorkspaceMembership, User)
        .join(User, User.id == WorkspaceMembership.user_id)
        .where(WorkspaceMembership.workspace_id == workspace_id)
        .order_by(WorkspaceMembership.created_at.asc())
    )
    return [(row[0], row[1]) for row in session.execute(stmt).all()]


def count_owners(session: Session, workspace_id: uuid.UUID) -> int:
    stmt = select(WorkspaceMembership).where(
        WorkspaceMembership.workspace_id == workspace_id,
        WorkspaceMembership.role == "owner",
    )
    return len(session.scalars(stmt).all())
