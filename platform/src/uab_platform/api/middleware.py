"""Correlation ID + request logging middleware."""

from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from uab_platform.logging import correlation_id_ctx, new_correlation_id

logger = logging.getLogger("uab.request")


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, header_name: str = "X-Correlation-ID") -> None:
        super().__init__(app)
        self.header_name = header_name

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get(self.header_name)
        cid = incoming.strip()[:100] if incoming and incoming.strip() else new_correlation_id()
        token = correlation_id_ctx.set(cid)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            correlation_id_ctx.reset(token)
            raise
        response.headers[self.header_name] = cid
        duration_ms = int((time.perf_counter() - start) * 1000)
        # Logged before resetting the contextvar so the line carries the ID.
        logger.info("%s %s -> %s (%d ms)", request.method, request.url.path, response.status_code, duration_ms)
        correlation_id_ctx.reset(token)
        return response
