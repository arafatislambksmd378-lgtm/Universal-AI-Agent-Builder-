# ADR-0001: Control plane / agent runtime boundary

- **Status:** Accepted (BATCH 02)
- **Date:** 2026-11-13
- **Context:** Universal AI Agent Builder wraps Hermes Agent (Nous Research) into a multi-agent
  platform. Hermes is a production-grade, single-tenant personal agent with a ~2.8M-LOC runtime.

## Decision

There are **two** deliverables with a strict boundary:

1. **Control plane** (`platform/`, this repo) — users, workspaces, RBAC, agent registry, settings,
   audit, provider-independent model interface, workflows/tasks later. It speaks HTTP/MCP/A2A to
   runtimes and owns the organization's *intent* (who may do what, to which agent, with which
   budget).
2. **Hermes runtime** (upstream, `work/hermes-agent/`) — executes agent turns, tools, memory,
   sessions. It remains the primary execution engine. We extend it only via additive,
   upstream-compatible patches behind the pressure gate (prompt surface snapshot + upstream tests).

Integration surfaces, in order of preference:

- **MCP tools** — the control plane and runtimes both speak MCP; cleanest for agent ↔ control plane.
- **A2A (v1.0)** — agent-to-agent protocol already shipped as a Hermes plugin; control plane
  orchestrates via the same protocol when needed.
- **OpenAI-compatible HTTP API** — for session/run management against a gateway instance.
- **Shared database? Never** between control plane (Postgres) and runtimes (SQLite).

## Consequences

- No import-time coupling: the control plane can be built, tested, deployed and scaled without
  importing Hermes — which also keeps Git history, licenses and 3.14 toolchain constraints separate.
- A runtime can be swapped/major-version-bumped without touching the control plane API.
- Anything that *must* live in the runtime (e.g. event export) is done as an upstream-style patch
  set in `work/hermes-agent/`, documented in `docs/upstream.md`.
- Cost: some runtime facts are duplicated as API contracts (e.g. agent status) — acceptable; the
  API contract is the source of truth for the frontend.

## Rejected alternatives

- **Fork Hermes wholesale into this repo** — loses upstream sync, bloats history, violates
  "preserve upstream as independently identifiable reference" (approved B4 strategy).
- **Embed control-plane logic as Hermes plugins only** — plugins cannot carry Postgres, multi-user
  RBAC, or org semantics without growing a parallel service inside the runtime process; rejected.
- **Rewrite the runtime in Node/TypeScript** — explicitly out of scope (frontend is a separate
  concern; Hermes core stays Python).
