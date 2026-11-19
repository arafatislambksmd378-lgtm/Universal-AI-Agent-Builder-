"""Audit log access control."""

from __future__ import annotations

import pytest

from conftest import auth_headers, register_user


@pytest.mark.asyncio
async def test_owner_can_read_audit_member_cannot(client) -> None:
    registered = await register_user(client, "owner@example.com")
    owner_token = registered.json()["tokens"]["access_token"]
    ws_id = registered.json()["workspace"]["id"]

    # create a member directly in DB and add them to the workspace as member
    import uuid

    from conftest import login
    from uab_platform.db.session import transaction
    from uab_platform.repositories import users as users_repo
    from uab_platform.repositories import workspaces as workspaces_repo
    from uab_platform.security.passwords import hash_password

    with transaction() as session:
        member = users_repo.create_user(
            session,
            email="member@example.com",
            password_hash=hash_password("member-pass-123"),
            display_name="Member",
        )
        workspaces_repo.add_member(session, workspace_id=uuid.UUID(ws_id), user_id=member.id, role="member")

    member_login = await login(client, "member@example.com", "member-pass-123")
    member_token = member_login.json()["tokens"]["access_token"]

    denied = await client.get(f"/api/v1/workspaces/{ws_id}/audit", headers=auth_headers(member_token))
    assert denied.status_code == 403

    allowed = await client.get(f"/api/v1/workspaces/{ws_id}/audit", headers=auth_headers(owner_token))
    assert allowed.status_code == 200
    body = allowed.json()
    assert body["total"] >= 1  # workspace.created event at minimum
    assert any(item["event_type"] == "workspace.created" for item in body["items"])
