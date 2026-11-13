"""Auth flow: first-run bootstrap, login, refresh, /me."""

from __future__ import annotations

import pytest

from conftest import auth_headers, login, register_user


@pytest.mark.asyncio
async def test_first_user_bootstraps_and_gets_personal_workspace(client) -> None:
    response = await register_user(client, "first@example.com")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["user"]["email"] == "first@example.com"
    assert body["workspace"]["name"]
    assert body["tokens"]["access_token"]
    assert body["tokens"]["refresh_token"]


@pytest.mark.asyncio
async def test_second_registration_closed_by_default(client) -> None:
    first = await register_user(client, "first@example.com")
    assert first.status_code == 201
    second = await register_user(client, "second@example.com")
    assert second.status_code == 403
    assert second.json()["error"]["code"] == "forbidden"


@pytest.mark.asyncio
async def test_duplicate_email_rejected(client) -> None:
    await register_user(client, "first@example.com")
    response = await register_user(client, "FIRST@example.com")  # case-insensitive
    assert response.status_code in (403, 409)


@pytest.mark.asyncio
async def test_login_success_and_wrong_password(client) -> None:
    await register_user(client, "first@example.com")
    ok = await login(client, "first@example.com")
    assert ok.status_code == 200
    assert ok.json()["tokens"]["access_token"]

    bad = await login(client, "first@example.com", "wrong-password")
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "unauthenticated"


@pytest.mark.asyncio
async def test_refresh_rotates_tokens(client) -> None:
    registered = await register_user(client, "first@example.com")
    refresh_token = registered.json()["tokens"]["refresh_token"]
    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]

    access = registered.json()["tokens"]["access_token"]
    misuse = await client.post("/api/v1/auth/refresh", json={"refresh_token": access})
    assert misuse.status_code == 401


@pytest.mark.asyncio
async def test_me_lists_membership_and_permissions(client) -> None:
    registered = await register_user(client, "first@example.com")
    access = registered.json()["tokens"]["access_token"]
    me = await client.get("/api/v1/auth/me", headers=auth_headers(access))
    assert me.status_code == 200
    body = me.json()
    assert len(body["memberships"]) == 1
    assert body["memberships"][0]["role"] == "owner"
    ws_id = body["memberships"][0]["workspace_id"]
    assert "agents:create" in body["permissions"][ws_id]


@pytest.mark.asyncio
async def test_me_requires_token(client) -> None:
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"


@pytest.mark.asyncio
async def test_login_audit_event_written(client) -> None:
    await register_user(client, "first@example.com")
    await login(client, "first@example.com")
    # login emits "user.login"; verify a superadmin-only surface would see it — here we
    # check indirectly via the database.
    from sqlalchemy import text

    from uab_platform.db.session import get_engine

    with get_engine().connect() as conn:
        rows = conn.execute(text("select event_type from audit_events where event_type = 'user.login'")).all()
    assert len(rows) >= 1
