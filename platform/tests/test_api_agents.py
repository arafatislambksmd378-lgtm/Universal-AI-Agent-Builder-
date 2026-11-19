"""Agent registry CRUD, lifecycle, slug rules, tenant isolation."""

from __future__ import annotations

import pytest

from conftest import auth_headers, register_user


async def _owner_with_workspace(client):
    registered = await register_user(client, "owner@example.com")
    token = registered.json()["tokens"]["access_token"]
    ws_id = registered.json()["workspace"]["id"]
    return token, ws_id


@pytest.mark.asyncio
async def test_create_agent_defaults_to_draft_and_personal_config(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    response = await client.post(
        f"/api/v1/workspaces/{ws_id}/agents",
        json={"name": "Research Helper", "system_instructions": "Be concise."},
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    agent = response.json()
    assert agent["status"] == "draft"
    assert agent["slug"].startswith("research-helper")
    assert agent["config"]["tool_allowlist"] == []
    assert agent["config"]["budget_cents"] is None
    assert agent["created_by"]


@pytest.mark.asyncio
async def test_slug_unique_per_workspace(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    first = await client.post(
        f"/api/v1/workspaces/{ws_id}/agents",
        json={"name": "Helper", "slug": "helper"},
        headers=auth_headers(token),
    )
    assert first.status_code == 201
    second = await client.post(
        f"/api/v1/workspaces/{ws_id}/agents",
        json={"name": "Helper 2", "slug": "helper"},
        headers=auth_headers(token),
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_invalid_slug_rejected(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    response = await client.post(
        f"/api/v1/workspaces/{ws_id}/agents",
        json={"name": "Bad", "slug": "Not A Slug!"},
        headers=auth_headers(token),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_full_lifecycle_flow(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    agent = (
        await client.post(
            f"/api/v1/workspaces/{ws_id}/agents",
            json={"name": "Lifecycle Agent"},
            headers=auth_headers(token),
        )
    ).json()
    url = f"/api/v1/workspaces/{ws_id}/agents/{agent['id']}/lifecycle"

    # draft -> pause is invalid
    bad = await client.post(url, json={"action": "pause"}, headers=auth_headers(token))
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "invalid_transition"

    # draft -> activate
    activated = await client.post(url, json={"action": "activate"}, headers=auth_headers(token))
    assert activated.json()["status"] == "active"

    # active -> pause
    paused = await client.post(url, json={"action": "pause"}, headers=auth_headers(token))
    assert paused.json()["status"] == "paused"

    # paused -> activate
    activated2 = await client.post(url, json={"action": "activate"}, headers=auth_headers(token))
    assert activated2.json()["status"] == "active"

    # active -> archive
    archived = await client.post(url, json={"action": "archive"}, headers=auth_headers(token))
    assert archived.json()["status"] == "archived"

    # archived -> restore
    restored = await client.post(url, json={"action": "restore"}, headers=auth_headers(token))
    assert restored.json()["status"] == "draft"


@pytest.mark.asyncio
async def test_update_agent_and_config(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    agent = (
        await client.post(
            f"/api/v1/workspaces/{ws_id}/agents",
            json={"name": "Updatable"},
            headers=auth_headers(token),
        )
    ).json()

    updated = await client.patch(
        f"/api/v1/workspaces/{ws_id}/agents/{agent['id']}",
        json={
            "description": "now with a description",
            "config": {"provider": "ollama", "model": "llama3.2", "max_tokens": 512, "tool_allowlist": ["terminal"]},
        },
        headers=auth_headers(token),
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["description"] == "now with a description"
    assert body["config"]["provider"] == "ollama"
    assert body["config"]["tool_allowlist"] == ["terminal"]


@pytest.mark.asyncio
async def test_list_agents_pagination_and_status_filter(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    for idx in range(3):
        await client.post(
            f"/api/v1/workspaces/{ws_id}/agents", json={"name": f"Agent {idx}"}, headers=auth_headers(token)
        )

    page = await client.get(f"/api/v1/workspaces/{ws_id}/agents?limit=2&offset=0", headers=auth_headers(token))
    assert page.status_code == 200
    body = page.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2

    filtered = await client.get(f"/api/v1/workspaces/{ws_id}/agents?status=active", headers=auth_headers(token))
    assert filtered.json()["total"] == 0


@pytest.mark.asyncio
async def test_delete_agent(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    agent = (
        await client.post(
            f"/api/v1/workspaces/{ws_id}/agents",
            json={"name": "Disposable"},
            headers=auth_headers(token),
        )
    ).json()
    deleted = await client.delete(f"/api/v1/workspaces/{ws_id}/agents/{agent['id']}", headers=auth_headers(token))
    assert deleted.status_code == 204
    missing = await client.get(f"/api/v1/workspaces/{ws_id}/agents/{agent['id']}", headers=auth_headers(token))
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_agent_audit_events_recorded(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    await client.post(f"/api/v1/workspaces/{ws_id}/agents", json={"name": "Audited"}, headers=auth_headers(token))

    from sqlalchemy import text

    from uab_platform.db.session import get_engine

    with get_engine().connect() as conn:
        rows = conn.execute(
            text("select event_type from audit_events where workspace_id = :ws and event_type = 'agent.created'"),
            {"ws": ws_id},
        ).all()
    assert len(rows) == 1


async def test_create_agent_with_avatar_identity(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    response = await client.post(
        f"/api/v1/workspaces/{ws_id}/agents",
        json={
            "name": "Nova",
            "role": "research-analyst",
            "description": "Digs through docs and summarises.",
            "avatar_id": "preset-nova-01",
            "avatar_type": "preset",
            "avatar_style": "2d-cute",
            "avatar_metadata": {"palette": ["#7c3aed", "#c4b5fd"], "mood": "curious", "seed": 42},
            "capabilities": ["research", "summarization", "Research"],  # normalised: lower-cased, de-duplicated
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    agent = response.json()
    assert agent["avatar_id"] == "preset-nova-01"
    assert agent["avatar_type"] == "preset"
    assert agent["avatar_style"] == "2d-cute"
    assert agent["avatar_metadata"]["mood"] == "curious"
    assert agent["capabilities"] == ["research", "summarization"]
    # reserved org keys exist in the contract and are null until BATCH 04+
    assert agent["team"] is None
    assert agent["organization"] is None


async def test_avatar_type_requires_reference(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    response = await client.post(
        f"/api/v1/workspaces/{ws_id}/agents",
        json={"name": "Broken Avatar", "avatar_type": "preset"},
        headers=auth_headers(token),
    )
    assert response.status_code == 422


async def test_avatar_type_must_be_known(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    response = await client.post(
        f"/api/v1/workspaces/{ws_id}/agents",
        json={"name": "Unknown Avatar", "avatar_type": "hologram", "avatar_id": "x"},
        headers=auth_headers(token),
    )
    assert response.status_code == 422


async def test_capability_tags_validated(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    bad = await client.post(
        f"/api/v1/workspaces/{ws_id}/agents",
        json={"name": "BadCaps", "capabilities": ["Has Spaces"]},
        headers=auth_headers(token),
    )
    assert bad.status_code == 422
    too_many = await client.post(
        f"/api/v1/workspaces/{ws_id}/agents",
        json={"name": "TooManyCaps", "capabilities": [f"cap-{i}" for i in range(41)]},
        headers=auth_headers(token),
    )
    assert too_many.status_code == 422


async def test_update_avatar_and_capabilities(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    created = (
        await client.post(
            f"/api/v1/workspaces/{ws_id}/agents",
            json={"name": "ShapeShifter", "avatar_id": "preset-a", "avatar_type": "preset"},
            headers=auth_headers(token),
        )
    ).json()
    patched = await client.patch(
        f"/api/v1/workspaces/{ws_id}/agents/{created['id']}",
        json={
            "avatar_url": "https://cdn.example.com/avatars/shapeshifter.png",
            "avatar_type": "url",
            "avatar_metadata": {"origin": "upload-pipeline-v1"},
            "capabilities": ["triage"],
        },
        headers=auth_headers(token),
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["avatar_type"] == "url"
    assert body["avatar_url"] == "https://cdn.example.com/avatars/shapeshifter.png"
    assert body["avatar_metadata"]["origin"] == "upload-pipeline-v1"
    assert body["capabilities"] == ["triage"]


async def test_agent_activity_endpoint_scoped_and_permissioned(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    created = (
        await client.post(
            f"/api/v1/workspaces/{ws_id}/agents",
            json={"name": "Activity Probe"},
            headers=auth_headers(token),
        )
    ).json()
    activity = await client.get(
        f"/api/v1/workspaces/{ws_id}/agents/{created['id']}/activity", headers=auth_headers(token)
    )
    assert activity.status_code == 200, activity.text
    body = activity.json()
    assert body["total"] >= 1
    assert any(item["event_type"] == "agent.created" for item in body["items"])
    assert all(item["target_id"] == created["id"] for item in body["items"])


async def test_agent_activity_requires_audit_read(client) -> None:
    import uuid as _uuid

    from conftest import login
    from uab_platform.db.session import transaction
    from uab_platform.repositories import users as users_repo
    from uab_platform.repositories import workspaces as workspaces_repo
    from uab_platform.security.passwords import hash_password

    token, ws_id = await _owner_with_workspace(client)
    created = (
        await client.post(
            f"/api/v1/workspaces/{ws_id}/agents",
            json={"name": "Guarded Activity"},
            headers=auth_headers(token),
        )
    ).json()

    with transaction() as session:
        member = users_repo.create_user(
            session,
            email="activity-member@example.com",
            password_hash=hash_password("member-pass-123"),
            display_name="Member",
        )
        workspaces_repo.add_member(session, workspace_id=_uuid.UUID(ws_id), user_id=member.id, role="member")
    member_token = (await login(client, "activity-member@example.com", "member-pass-123")).json()["tokens"][
        "access_token"
    ]

    forbidden = await client.get(
        f"/api/v1/workspaces/{ws_id}/agents/{created['id']}/activity", headers=auth_headers(member_token)
    )
    assert forbidden.status_code == 403


async def test_audit_list_target_id_filter(client) -> None:
    token, ws_id = await _owner_with_workspace(client)
    agent = (
        await client.post(
            f"/api/v1/workspaces/{ws_id}/agents",
            json={"name": "Filtered"},
            headers=auth_headers(token),
        )
    ).json()
    filtered = await client.get(
        f"/api/v1/workspaces/{ws_id}/audit",
        params={"target_type": "agent", "target_id": agent["id"]},
        headers=auth_headers(token),
    )
    assert filtered.status_code == 200
    body = filtered.json()
    assert body["total"] >= 1
    assert all(item["target_id"] == agent["id"] for item in body["items"])
