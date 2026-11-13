# Security model — Universal AI Agent Builder control plane

Version: BATCH 02 (2026-11-13). Applies to `platform/`. Hermes runtime security is out of scope
here; see REPORT-01 §9.5 and the upstream security docs.

## 1. Authentication

- Passwords: argon2-id (`argon2-cffi`), random salt, tuned via library defaults. Verification is
  constant-time-ish (library-provided). **No** plaintext storage, **no** reversible encryption.
- Tokens: short-lived JWT **access** tokens (default 15 min) + long-lived **refresh** tokens
  (default 30 days), HS256 in dev, `UAB_JWT_SECRET` from env; `iss` = `uab-control-plane`.
  Token payload: `sub` (user id), `iat`, `exp`, `jti`, `typ` (`access`|`refresh`).
- Refresh tokens carry `jti`; revocation list is future work (BATCH 12 hardening) — mitigate with
  short access TTL.
- First-run bootstrap: when the users table is empty, the first registration becomes the owner of a
  personal workspace (this is deliberate bootstrap, not open registration). Additional registrations
  require `UAB_ALLOW_OPEN_REGISTRATION=true` or an invite/member flow (BATCH 12+).
- `uab-bootstrap` CLI creates/updates a superadmin and refuses to run twice without `--force`.

## 2. Authorization (RBAC)

Static role → permission matrix in `security/rbac.py` (code is config; change via PR, not admin UI):

| Role | Intent | Key permissions |
|---|---|---|
| `viewer` | read-only | `agents:read`, audit read denied |
| `member` | normal builder | + `agents:create`, `workspaces:update`, `audit` no |
| `admin` | workspace operator | + `agents:activate`, `agents:update`, `members:manage`, `audit:read`, `delete` |
| `owner` | workspace owner | everything in workspace |
| superadmin | platform operator | settings write, cross-workspace operator calls |

Enforcement points:

- Route dependencies: `require_permission("agents:activate")` etc. (403 on failure).
- Query construction: every repository list/get filters by `workspace_id`; foreign references
  return 404 (no cross-tenant existence oracle).
- Role hierarchy check prevents an admin from granting `owner`, or an owner from demoting the last
  owner (service layer guard).

## 3. Data isolation

- `workspace_id` FK + `ON DELETE CASCADE` on agents/configs/memberships; `audit_events.workspace_id`
  nullable + `ON DELETE SET NULL` (audit survives workspace deletion).
- Soft boundaries enforced in code; hard boundaries (row-level security) are a BATCH 12 candidate.
- The runtime (Hermes) keeps its own per-profile SQLite under `HERMES_HOME`; the control plane
  never reads or writes it.

## 4. Secrets

- All configuration via `UAB_*` env vars (`config.py`); `.env` is git-ignored; `.env.example`
  documents the surface with safe dev defaults only.
- No secret is ever logged: JSON logging does not dump settings; error handlers map driver errors
  to generic codes; `redacted_database_url()` masks the password for diagnostics.
- `validate_for_production()` refuses to boot in `production` with default/weak secrets, a non-
  Postgres/SQLite URL opt-out, or debug flags.
- JWT dev default is explicitly rejected for production (test enforces).

## 5. Audit logging

- Append-only `audit_events` table; every mutating control-plane action records actor, workspace,
  target, event type, small metadata, and correlation id where available.
- Reads of audit require `audit:read` (admin+).
- Audit is not writable via the API.

## 6. Rate limiting & abuse

- Not yet enforced in the control plane (BATCH 12). Hermes runtime has its own rate limits; public
  exposure of the control plane before BATCH 12 is not authorized.

## 7. Provider privacy

- Paid providers disabled by default (`UAB_ALLOW_PAID_PROVIDERS=false`); enabling requires an
  explicit env change and is intended as an ops decision, never a per-request client choice.
- Local providers (Ollama/LM Studio) and deterministic mock are the dev path; external/free-tier
  providers must be explicitly opted into.
- Private data must not leave the host for external providers without explicit authorization
  (product rule; enforced by the router's policy gate, not by prompt discipline).

## 8. Dependency & supply chain

- Direct dependencies pinned to `>=` floors with tested ceilings implied by CI lock (`uv.lock`).
- No paid or private registries. CI runs lint + tests + migration up/down/up + OpenAPI drift.
- Hermes runtime pinned by upstream commit (see `docs/upstream.md`, `acquisition/ACQUISITION-METADATA.json`).

## 9. Known gaps (tracked, not hidden)

1. JWT refresh revocation/allowlist — BATCH 12.
2. Per-workspace API keys (for runtime→control-plane calls) — BATCH 03 (bridge) with hashed storage.
3. Row-level security in Postgres — BATCH 12+.
4. Rate limiting, brute-force login throttling — BATCH 12.
5. SSO/OIDC — BATCH 12+ (deliberately; dev auth is local password only).
6. Secrets manager integration (Vault/KMS) — BATCH 16.
