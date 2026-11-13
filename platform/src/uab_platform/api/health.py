"""Unversioned liveness/readiness endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from uab_platform import __version__
from uab_platform.db.session import database_health

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@router.get("/health/ready")
def health_ready() -> JSONResponse:
    db_ok = database_health()
    body = {
        "status": "ready" if db_ok else "not_ready",
        "checks": {"database": "ok" if db_ok else "unavailable"},
        "version": __version__,
    }
    return JSONResponse(status_code=200 if db_ok else 503, content=body)
