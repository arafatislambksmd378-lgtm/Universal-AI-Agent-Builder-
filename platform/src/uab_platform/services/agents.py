"""Agent registry service — creation, update, lifecycle transitions + audit emission.

Lifecycle state machine:
    draft  --activate--> active
    paused --activate--> active
    active --pause-----> paused
    draft|active|paused --archive--> archived
    archived --restore--> draft
"""

from __future__ import annotations

import re
import uuid

from sqlalchemy.orm import Session

from uab_platform.db.models import Agent
from uab_platform.repositories import agents as agents_repo
from uab_platform.schemas.agents import (
    AgentConfigIn,
    LifecycleAction,
    allowed_from_statuses,
    target_status_for,
)
from uab_platform.services import audit as audit_service

_SLUG_INVALID = re.compile(r"[^a-z0-9-]+")
_SLUG_COLLAPSE = re.compile(r"-{2,}")


class AgentError(Exception):
    """Base for agent service errors."""


class AgentNotFound(AgentError):
    pass


class AgentSlugConflict(AgentError):
    pass


class AgentTransitionError(AgentError):
    def __init__(self, action: str, current_status: str) -> None:
        super().__init__(f"cannot {action} an agent in status {current_status!r}")
        self.action = action
        self.current_status = current_status


def slugify(name: str) -> str:
    slug = _SLUG_INVALID.sub("-", name.strip().lower()).strip("-")
    slug = _SLUG_COLLAPSE.sub("-", slug)[:60].strip("-")
    return slug or "agent"


def create_agent(
    session: Session,
    *,
    workspace_id: uuid.UUID,
    created_by: uuid.UUID | None,
    name: str,
    slug: str | None,
    role: str,
    description: str,
    avatar_ref: str | None,
    system_instructions: str,
    config: AgentConfigIn,
) -> Agent:
    final_slug = slug or slugify(name)
    if agents_repo.get_agent_by_slug(session, workspace_id=workspace_id, slug=final_slug) is not None:
        raise AgentSlugConflict(f"an agent with slug {final_slug!r} already exists in this workspace")
    agent = Agent(
        workspace_id=workspace_id,
        slug=final_slug,
        name=name.strip(),
        role=role.strip() or "assistant",
        description=description,
        avatar_ref=avatar_ref,
        system_instructions=system_instructions,
        created_by=created_by,
    )
    agents_repo.create_agent(session, agent)
    agents_repo.upsert_config(
        session,
        agent.id,
        config.model_dump(),
    )
    audit_service.emit_audit(
        session,
        event_type="agent.created",
        workspace_id=workspace_id,
        actor_user_id=created_by,
        target_type="agent",
        target_id=str(agent.id),
        metadata={"slug": agent.slug, "name": agent.name},
    )
    return agent


def get_agent_or_404(session: Session, *, workspace_id: uuid.UUID, agent_id: uuid.UUID) -> Agent:
    agent = agents_repo.get_agent(session, workspace_id=workspace_id, agent_id=agent_id)
    if agent is None:
        raise AgentNotFound("agent not found in this workspace")
    return agent


def update_agent(
    session: Session,
    *,
    agent: Agent,
    actor_user_id: uuid.UUID | None,
    changes: dict,
    config: AgentConfigIn | None,
) -> Agent:
    for key, value in changes.items():
        if key == "config":
            continue
        setattr(agent, key, value)
    session.add(agent)
    if config is not None:
        agents_repo.upsert_config(session, agent.id, config.model_dump())
    audit_service.emit_audit(
        session,
        event_type="agent.updated",
        workspace_id=agent.workspace_id,
        actor_user_id=actor_user_id,
        target_type="agent",
        target_id=str(agent.id),
        metadata={"changed": sorted(changes.keys()) + (["config"] if config is not None else [])},
    )
    return agent


def transition(
    session: Session,
    *,
    agent: Agent,
    action: LifecycleAction,
    actor_user_id: uuid.UUID | None,
) -> Agent:
    if agent.status not in allowed_from_statuses(action):
        raise AgentTransitionError(action, agent.status)
    agent.status = target_status_for(action)
    session.add(agent)
    audit_service.emit_audit(
        session,
        event_type=f"agent.{action}",
        workspace_id=agent.workspace_id,
        actor_user_id=actor_user_id,
        target_type="agent",
        target_id=str(agent.id),
        metadata={"status": agent.status},
    )
    return agent


def delete_agent(session: Session, *, agent: Agent, actor_user_id: uuid.UUID | None) -> None:
    audit_service.emit_audit(
        session,
        event_type="agent.deleted",
        workspace_id=agent.workspace_id,
        actor_user_id=actor_user_id,
        target_type="agent",
        target_id=str(agent.id),
        metadata={"slug": agent.slug},
    )
    agents_repo.delete_agent(session, agent)
