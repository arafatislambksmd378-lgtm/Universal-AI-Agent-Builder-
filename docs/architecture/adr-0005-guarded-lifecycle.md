# ADR-0005: Guarded lifecycle for agents (no unauthorized execution)

- **Status:** Accepted (BATCH 02)
- **Date:** 2026-11-13
- **Context:** Creating an agent record must never imply it can run. Execution rights, paid
  providers, and configuration changes are exactly the actions that must be auditable.

## Decision

- Agent lifecycle state machine is explicit: `draft → active → paused → active … → archived`,
  `draft → archived`, archive is reversible; invalid transitions return `409 invalid_transition`.
- Agents are **created in `draft` only**. Activation is an explicit, separate, permission-checked
  call (`agents:activate`). Viewer/member roles cannot activate.
- Configuration updates go through schema validation (`AgentConfigIn`) with a bounded tool
  allowlist and an optional per-agent provider pin; invalid configs are rejected before storage.
- Every mutating action emits an `audit_events` row (`agent.created`, `agent.updated`,
  `agent.activated`, `agent.paused`, `agent.archived`, `agent.deleted`,
  `workspace.member_added/removed/role_changed`, `workspace.created`, `settings.updated`)
  with actor, workspace, target, and small structured metadata.
- List endpoints and writes are workspace-scoped; cross-workspace references return 404.
- No agent executes anything in BATCH 02. Execution arrives with the runtime bridge (BATCH 03+)
  behind the same permission model and a human-approval layer for sensitive tools.

## Consequences

- The database is never in a state where "created implies running" — the frontend must show an
  explicit Activate affordance, guarded by role.
- Audit trail is complete enough for compliance questions later (who activated what, when).
- Paused agents remain addressable (config visible) but are excluded from any future dispatch.

## Rejected alternatives

- **Free-form status string** — drifts, no transition audit; rejected.
- **Auto-activate on create** — foot-gun; explicitly rejected by product requirements.
- **Audit only deletions/activations** — too coarse for org compliance; all mutations logged.
