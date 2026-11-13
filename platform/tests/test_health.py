"""Health endpoints."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_health_is_ok(client) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body


@pytest.mark.asyncio
async def test_health_ready_checks_database(client) -> None:
    response = await client.get("/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"] == "ok"


@pytest.mark.asyncio
async def test_correlation_id_echoed(client) -> None:
    response = await client.get("/health", headers={"X-Correlation-ID": "test-correlation-123"})
    assert response.headers["X-Correlation-ID"] == "test-correlation-123"


@pytest.mark.asyncio
async def test_correlation_id_generated(client) -> None:
    response = await client.get("/health")
    assert response.headers["X-Correlation-ID"]


@pytest.mark.asyncio
async def test_unknown_route_uses_error_envelope(client) -> None:
    response = await client.get("/api/v1/definitely-not-a-route")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert "correlation_id" in body["error"]
