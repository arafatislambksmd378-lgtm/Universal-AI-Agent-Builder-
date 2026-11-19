"""/api/v1 router mount."""

from __future__ import annotations

from fastapi import APIRouter

from uab_platform.api.v1 import agents, audit, auth, settings, workspaces

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(workspaces.router)
router.include_router(agents.router)
router.include_router(audit.router)
router.include_router(settings.router)
