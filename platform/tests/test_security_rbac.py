"""RBAC matrix behavior."""

from __future__ import annotations

from uab_platform.security.rbac import has_permission, permissions_for, role_rank


def test_role_ordering() -> None:
    assert role_rank("owner") > role_rank("admin") > role_rank("member") > role_rank("viewer")
    assert role_rank("bogus") == -1


def test_viewer_can_read_but_not_write() -> None:
    assert has_permission("viewer", "workspace:read")
    assert has_permission("viewer", "agents:read")
    assert not has_permission("viewer", "agents:create")
    assert not has_permission("viewer", "audit:read")
    assert not has_permission("viewer", "settings:update")


def test_member_can_manage_agents_but_not_audit() -> None:
    assert has_permission("member", "agents:create")
    assert has_permission("member", "agents:update")
    assert has_permission("member", "agents:lifecycle")
    assert not has_permission("member", "agents:delete")
    assert not has_permission("member", "audit:read")


def test_admin_can_read_audit_and_delete_agents() -> None:
    assert has_permission("admin", "audit:read")
    assert has_permission("admin", "agents:delete")
    assert has_permission("admin", "settings:update")
    assert not has_permission("admin", "workspace:delete")


def test_owner_has_everything() -> None:
    for permission in [
        "workspace:read",
        "workspace:update",
        "workspace:delete",
        "workspace:members:manage",
        "agents:read",
        "agents:create",
        "agents:delete",
        "audit:read",
        "settings:update",
    ]:
        assert has_permission("owner", permission)


def test_unknown_permission_fails_closed() -> None:
    assert not has_permission("owner", "made:up")
    assert not has_permission(None, "agents:read")


def test_permissions_for_monotonic_with_rank() -> None:
    assert (
        set(permissions_for("viewer"))
        <= set(permissions_for("member"))
        <= set(permissions_for("admin"))
        <= set(permissions_for("owner"))
    )
