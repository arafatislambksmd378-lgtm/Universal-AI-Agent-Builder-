"""Static RBAC matrix for the control plane.

Workspace roles: owner > admin > member > viewer. Permission names follow
`resource:action`. This is intentionally code-defined (not a mutable DB table):
the matrix is reviewable in diffs, and custom roles are a deliberate later
decision — not a foundation requirement.
"""

from __future__ import annotations

_ROLE_RANK = {"viewer": 10, "member": 20, "admin": 30, "owner": 40}

# Permission -> minimum role rank required.
_PERMISSIONS: dict[str, int] = {
    # workspace
    "workspace:read": _ROLE_RANK["viewer"],
    "workspace:update": _ROLE_RANK["admin"],
    "workspace:delete": _ROLE_RANK["owner"],
    "workspace:members:read": _ROLE_RANK["viewer"],
    "workspace:members:manage": _ROLE_RANK["admin"],
    # agents
    "agents:read": _ROLE_RANK["viewer"],
    "agents:create": _ROLE_RANK["member"],
    "agents:update": _ROLE_RANK["member"],
    "agents:delete": _ROLE_RANK["admin"],
    "agents:lifecycle": _ROLE_RANK["member"],
    "agents:execute": _ROLE_RANK["member"],
    # audit & settings
    "audit:read": _ROLE_RANK["admin"],
    "settings:read": _ROLE_RANK["viewer"],
    "settings:update": _ROLE_RANK["admin"],
}

ALL_PERMISSIONS = frozenset(_PERMISSIONS)
ALL_ROLES = frozenset(_ROLE_RANK)


def role_rank(role: str) -> int:
    return _ROLE_RANK.get(role, -1)


def has_permission(role: str | None, permission: str) -> bool:
    if role is None:
        return False
    required = _PERMISSIONS.get(permission)
    if required is None:
        # Unknown permission names fail closed.
        return False
    return role_rank(role) >= required


def permissions_for(role: str) -> list[str]:
    return sorted(p for p in _PERMISSIONS if has_permission(role, p))
