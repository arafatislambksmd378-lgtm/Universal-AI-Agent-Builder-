"""Workspace + membership endpoints, RBAC enforcement, tenant isolation."""

from __future__ import annotations

import uuid

import pytest

from conftest import auth_headers, login, register_user


async def _bootstrap_two_users(client):
    first = await register_user(client, "owner@example.com")
    owner_token = first.json()["tokens"]["access_token"]
    owner_ws = first.json()["workspace"]["id"]
    assert owner_ws
    # second user cannot register while open registration is closed, so
    # create them directly in the database for RBAC tests.
    from uab_platform.db.session import transaction
    from uab_platform.repositories import users as users_repo
    from uab_platform.security.passwords import hash_password

    uid = uuid.uuid4()
    with transaction() as session:
        user = users_repo.create_user(
            session,
            email="member@example.com",
            password_hash=hash_password("member-pass-123"),
            display_name="Member User",
        )
        uid = user.id
    member_login = await login(client, "member@example.com", "member-pass-123")
    member_token = member_login.json()["tokens"]["access_token"]
    return owner_token, owner_ws, member_token, str(uid)


@pytest.mark.asyncio
async def test_create_and_list_workspace(client) -> None:
    registered = await register_user(client, "owner@example.com")
    token = registered.json()["tokens"]["access_token"]

    created = await client.post("/api/v1/workspaces", json={"name": "Second Project"}, headers=auth_headers(token))
    assert created.status_code == 201

    listed = await client.get("/api/v1/workspaces", headers=auth_headers(token))
    assert listed.status_code == 200
    assert len(listed.json()) == 2  # personal workspace + Second Project


@pytest.mark.asyncio
async def test_non_member_cannot_see_workspace(client) -> None:
    _, owner_ws, member_token, _ = await _bootstrap_two_users(client)
    response = await client.get(f"/api/v1/workspaces/{owner_ws}", headers=auth_headers(member_token))
    assert response.status_code == 404  # existence not leaked


@pytest.mark.asyncio
async def test_member_role_lifecycle(client) -> None:
    owner_token, owner_ws, member_token, member_user_id = await _bootstrap_two_users(client)

    # add as member
    added = await client.post(
        f"/api/v1/workspaces/{owner_ws}/members",
        json={"email": "member@example.com", "role": "member"},
        headers=auth_headers(owner_token),
    )
    assert added.status_code == 201, added.text

    # now visible to member
    seen = await client.get(f"/api/v1/workspaces/{owner_ws}", headers=auth_headers(member_token))
    assert seen.status_code == 200

    # demote to viewer: viewer cannot create agents
    demoted = await client.patch(
        f"/api/v1/workspaces/{owner_ws}/members/{member_user_id}",
        json={"role": "viewer"},
        headers=auth_headers(owner_token),
    )
    assert demoted.status_code == 200
    assert demoted.json()["role"] == "viewer"

    created = await client.post(
        f"/api/v1/workspaces/{owner_ws}/agents",
        json={"name": "Test Agent"},
        headers=auth_headers(member_token),
    )
    assert created.status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_grant_owner_role(client) -> None:
    owner_token, owner_ws, member_token, _member_user_id = await _bootstrap_two_users(client)

    # make member an admin
    await client.post(
        f"/api/v1/workspaces/{owner_ws}/members",
        json={"email": "member@example.com", "role": "admin"},
        headers=auth_headers(owner_token),
    )
    # create a third user and try to grant owner as admin
    third_email = "third@example.com"
    from uab_platform.db.session import transaction
    from uab_platform.repositories import users as users_repo
    from uab_platform.security.passwords import hash_password

    with transaction() as session:
        users_repo.create_user(
            session, email=third_email, password_hash=hash_password("third-pass-1234"), display_name="Third"
        )

    response = await client.post(
        f"/api/v1/workspaces/{owner_ws}/members",
        json={"email": third_email, "role": "owner"},
        headers=auth_headers(member_token),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_last_owner_cannot_be_demoted(client) -> None:
    owner_token, owner_ws, _, _ = await _bootstrap_two_users(client)
    me = await client.get("/api/v1/auth/me", headers=auth_headers(owner_token))
    owner_id = me.json()["user"]["id"]
    demote = await client.patch(
        f"/api/v1/workspaces/{owner_ws}/members/{owner_id}",
        json={"role": "admin"},
        headers=auth_headers(owner_token),
    )
    assert demote.status_code == 409


@pytest.mark.asyncio
async def test_cross_workspace_agent_isolation(client) -> None:
    owner_token, _, member_token, _ = await _bootstrap_two_users(client)

    # member creates their own personal workspace? They have none yet; create one.
    created = await client.post("/api/v1/workspaces", json={"name": "Member WS"}, headers=auth_headers(member_token))
    assert created.status_code == 201
    member_ws = created.json()["id"]

    agent = await client.post(
        f"/api/v1/workspaces/{member_ws}/agents",
        json={"name": "Isolated Agent"},
        headers=auth_headers(member_token),
    )
    assert agent.status_code == 201
    agent_id = agent.json()["id"]

    # owner (of a different workspace) cannot see member's agent
    blocked = await client.get(f"/api/v1/workspaces/{member_ws}/agents/{agent_id}", headers=auth_headers(owner_token))
    assert blocked.status_code == 404
