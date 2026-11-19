"""Agent registry persistence."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from uab_platform.db.models import Agent, AgentConfig
from uab_platform.repositories.base import paginate


def create_agent(session: Session, agent: Agent) -> Agent:
    session.add(agent)
    session.flush()
    return agent


def get_agent(session: Session, *, workspace_id: uuid.UUID, agent_id: uuid.UUID) -> Agent | None:
    stmt = (
        select(Agent)
        .options(selectinload(Agent.config))
        .where(Agent.id == agent_id, Agent.workspace_id == workspace_id)
    )
    return session.scalar(stmt)


def get_agent_by_slug(session: Session, *, workspace_id: uuid.UUID, slug: str) -> Agent | None:
    stmt = select(Agent).where(Agent.workspace_id == workspace_id, Agent.slug == slug)
    return session.scalar(stmt)


def list_agents(
    session: Session,
    *,
    workspace_id: uuid.UUID,
    status: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Agent], int]:
    stmt = select(Agent).options(selectinload(Agent.config)).where(Agent.workspace_id == workspace_id)
    if status:
        stmt = stmt.where(Agent.status == status)
    stmt = stmt.order_by(Agent.created_at.desc())
    page = paginate(session, stmt, limit=limit, offset=offset)
    return page.items, page.total


def delete_agent(session: Session, agent: Agent) -> None:
    session.delete(agent)
    session.flush()


def upsert_config(session: Session, agent_id: uuid.UUID, values: dict) -> AgentConfig:
    config = session.get(AgentConfig, agent_id)
    if config is None:
        config = AgentConfig(agent_id=agent_id, **values)
    else:
        for key, value in values.items():
            setattr(config, key, value)
    session.add(config)
    session.flush()
    return config
