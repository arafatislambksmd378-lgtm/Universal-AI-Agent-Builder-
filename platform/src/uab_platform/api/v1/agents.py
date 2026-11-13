"""Agent registry routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from uab_platform.api.deps import get_current_user, get_db, require_permission
from uab_platform.api.errors import Conflict, NotFound, ValidationAppError
from uab_platform.db.models import User
from uab_platform.repositories import agents as agents_repo
from uab_platform.schemas.agents import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    LifecycleAction,
)
from uab_platform.schemas.common import Page
from uab_platform.services import agents as agent_service
from uab_platform.services.agents import AgentNotFound, AgentSlugConflict, AgentTransitionError

router = APIRouter(prefix="/workspaces/{workspace_id}/agents", tags=["agents"])


def _agent_or_404(session: Session, *, workspace_id: uuid.UUID, agent_id: uuid.UUID):
    try:
        return agent_service.get_agent_or_404(session, workspace_id=workspace_id, agent_id=agent_id)
    except AgentNotFound as exc:
        raise NotFound(str(exc)) from exc


def _to_response(agent) -> AgentResponse:
    return AgentResponse.model_validate(agent)


@router.post("", response_model=AgentResponse, status_code=201)
def create_agent(
    workspace_id: uuid.UUID,
    body: AgentCreate,
    membership=Depends(require_permission("agents:create")),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> AgentResponse:
    try:
        agent = agent_service.create_agent(
            session,
            workspace_id=workspace_id,
            created_by=user.id,
            name=body.name,
            slug=body.slug,
            role=body.role,
            description=body.description,
            avatar_ref=body.avatar_ref,
            system_instructions=body.system_instructions,
            config=body.config,
        )
    except AgentSlugConflict as exc:
        raise Conflict(str(exc)) from exc
    session.commit()
    session.refresh(agent)
    return _to_response(agent)


@router.get("", response_model=Page[AgentResponse])
def list_agents(
    workspace_id: uuid.UUID,
    status: str | None = Query(default=None, pattern="^(draft|active|paused|archived)$"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    membership=Depends(require_permission("agents:read")),
    session: Session = Depends(get_db),
) -> Page[AgentResponse]:
    items, total = agents_repo.list_agents(
        session, workspace_id=workspace_id, status=status, limit=limit, offset=offset
    )
    return Page[AgentResponse](items=[_to_response(a) for a in items], total=total, limit=limit, offset=offset)


@router.get("/{agent_id}", response_model=AgentResponse)
def get_agent(
    workspace_id: uuid.UUID,
    agent_id: uuid.UUID,
    membership=Depends(require_permission("agents:read")),
    session: Session = Depends(get_db),
) -> AgentResponse:
    return _to_response(_agent_or_404(session, workspace_id=workspace_id, agent_id=agent_id))


@router.patch("/{agent_id}", response_model=AgentResponse)
def update_agent(
    workspace_id: uuid.UUID,
    agent_id: uuid.UUID,
    body: AgentUpdate,
    membership=Depends(require_permission("agents:update")),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> AgentResponse:
    agent = _agent_or_404(session, workspace_id=workspace_id, agent_id=agent_id)
    changes = body.model_dump(exclude_unset=True, exclude={"config"})
    agent_service.update_agent(session, agent=agent, actor_user_id=user.id, changes=changes, config=body.config)
    session.commit()
    session.refresh(agent)
    return _to_response(agent)


@router.delete("/{agent_id}", status_code=204)
def delete_agent(
    workspace_id: uuid.UUID,
    agent_id: uuid.UUID,
    membership=Depends(require_permission("agents:delete")),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> None:
    agent = _agent_or_404(session, workspace_id=workspace_id, agent_id=agent_id)
    agent_service.delete_agent(session, agent=agent, actor_user_id=user.id)
    session.commit()


class LifecycleRequest(BaseModel):
    action: LifecycleAction


@router.post("/{agent_id}/lifecycle", response_model=AgentResponse)
def lifecycle(
    workspace_id: uuid.UUID,
    agent_id: uuid.UUID,
    body: LifecycleRequest,
    membership=Depends(require_permission("agents:lifecycle")),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> AgentResponse:
    agent = _agent_or_404(session, workspace_id=workspace_id, agent_id=agent_id)
    try:
        agent_service.transition(session, agent=agent, action=body.action, actor_user_id=user.id)
    except AgentTransitionError as exc:
        raise ValidationAppError(
            str(exc),
            details={"action": exc.action, "current_status": exc.current_status},
            code="invalid_transition",
        ) from exc
    session.commit()
    session.refresh(agent)
    return _to_response(agent)
