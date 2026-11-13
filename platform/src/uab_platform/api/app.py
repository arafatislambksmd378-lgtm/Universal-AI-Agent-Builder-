"""FastAPI application factory for the control plane."""

from __future__ import annotations

from fastapi import FastAPI

from uab_platform import __version__
from uab_platform.api.errors import register_exception_handlers
from uab_platform.api.health import router as health_router
from uab_platform.api.middleware import CorrelationIdMiddleware
from uab_platform.api.v1.router import router as v1_router
from uab_platform.config import Settings, get_settings
from uab_platform.logging import configure_logging


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    settings.validate_for_production()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="Universal AI Agent Builder — Control Plane",
        version=__version__,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(CorrelationIdMiddleware, header_name=settings.correlation_id_header)
    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(v1_router)
    return app


app = create_app()
