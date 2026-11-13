# ADR-0002: Storage split — Postgres (control plane) / SQLite (runtime)

- **Status:** Accepted (BATCH 02)
- **Date:** 2026-11-13
- **Context:** Hermes persists sessions/messages in SQLite+FTS5 under a per-profile
  `HERMES_HOME`, with a WAL-hardened SessionDB and years of corruption/repair edge cases.
  The control plane needs relational integrity, transactional multi-table writes, and
  organization-scale queries (members, budgets, audit).

## Decision

- **Control plane: PostgreSQL** (dev: docker-compose service or embedded `pgserver`; target
  version 16). All schema changes via Alembic migrations under `platform/alembic/`.
- **Runtime: Hermes' SQLite stays untouched.** No migration of existing Hermes data; no shared
  database between the two systems.
- Control-plane tables carry `workspace_id` with `ON DELETE CASCADE` (isolation by construction),
  plus explicit indexes for the hot paths (`agents.workspace_id`, audit workspace/created).
- IDs are UUIDs (`gen_random_uuid()`, no extra extension required on PG ≥ 13). Role/status fields
  use `TEXT + CHECK` constraints instead of native enums to keep migrations additive.
- `jsonb` for structured configuration (model config, tool allowlists, audit metadata).

## Consequences

- Two storage systems is a deliberate, documented split — not an accident to "unify" later
  without an ADR.
- The control plane can be hosted (Docker/VM) independently of runtimes.
- Backup story differs (pg_dump for control plane; Hermes `backup_sqlite.py` for runtime homes).
- If/when scale-out is needed (SaaS), Postgres is the right foundation; Redis is introduced later
  and only for pub/sub + rate limits — proposed in BATCH 12+, not now.

## Rejected alternatives

- **Reuse Hermes' SQLite for the control plane** — single-writer limits, no real multi-node, wrong
  failure modes for concurrent control-plane writes; rejected.
- **Migrate Hermes data into Postgres** — unnecessary risk; runtime storage is battle-tested;
  violates "keep SQLite unless a specific, tested reason requires a change" (approved B5).
- **Introduce Neo4j for org graphs now** — orgs are a reporting tree; adjacency via columns is
  enough until depth/traversal becomes a measured problem; rejected for now.
