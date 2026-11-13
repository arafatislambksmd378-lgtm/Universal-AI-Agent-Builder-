# BATCH 02 — Engineering Foundation · Implementation Report

Date: 2026-11-13 · Branch: `arena/2e48576e-universal-ai-agent-builder` · Base: `main` (6fc7fe5)
Executor: Agent Mode (Arena.ai) · Verdict: **BATCH 02 COMPLETE (with documented limitations), stop for review. BATCH 03 not started.**

---

## Executive summary

BATCH 02 stands up the **control plane** of Universal AI Agent Builder as a separate, contract-first
service (`platform/`) alongside the pristine Hermes Agent runtime (`work/hermes-agent/`, upstream pin
`fd3174e9`, 0 local modifications). Everything in this batch was built test-first against a **real
PostgreSQL 16.2** (embedded, via `pgserver`) and a real HTTP stack (FastAPI + httpx). Test suite:
**71 passed** (last full run). Migrations apply/downgrade/re-apply cleanly. The frontend is not built
here — the Google AI Studio integration contract (`docs/contracts/frontend-integration.md`) is the
deliverable.

The honest limitations (not varnished):

1. **Python 3.14 is NOT proven in this sandbox.** Development and verification ran on Python 3.11.2.
   `ci.yml` defines the 3.14 verification path, but it has never executed (no Actions run yet, and
   this environment cannot install 3.14).
2. **Docker is unavailable here**, so the `docker-compose.dev.yml` path is written but unexecuted;
   the embedded-PG path is the one actually verified.
3. **CI has never run.** It is configured; nothing guarantees YAML correctness or 3.14 behavior until
   the first run.
4. **Hermes is wired only conceptually.** No runtime bridge exists yet (planned BATCH 03); nothing
   executes against the real Hermes in this batch.

---

## 1. Acceptance criteria — scorecard

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Repository structure documented; boundaries respected | ✅ Implemented & verified (docs) | `docs/upstream.md`, `platform/README.md`, ADRs 0001/0002 |
| 2 | Clear upstream vs custom boundaries | ✅ Verified | `upstream-reference` CI job; Hermes tree untouched (`git status` clean there; diff audit in REPORT-01); no upstream code in `platform/` |
| 3 | PostgreSQL database architecture implemented & documented | ✅ Documented; **partly verified** | ADR-0002; schema applied on embedded PG 16.2; migration up/down/up verified; docker-compose PG path **not executed** (no Docker) |
| 4 | Migrations available (Alembic, reversible) | ✅ Implemented & verified | `platform/alembic/versions/09f16b9dfa10_initial_control_plane_schema.py`; `tests/test_db_migrations.py` passes on private embedded instance |
| 5 | API conventions (versioning, envelope, pagination, errors, health) | ✅ Implemented & verified | `/api/v1`, `Page[T]`, error envelope, `/health`, `/health/ready`, correlation ids — covered by `test_health.py`, `test_api_*.py` |
| 6 | Authentication & authorization implemented/verified to the extent feasible | ✅ Implemented & verified | argon2, JWT pair, RBAC matrix; `test_api_auth.py`, `test_security_*.py`, `test_api_workspaces.py` (403/404 semantics) |
| 7 | Configuration & secrets management incl. `.env` + redaction | ✅ Implemented & verified | `config.py`, `.env.example`, `validate_for_production()`, test for dev-secret refusal; no creds in repo (CI grep recommended, see §7) |
| 8 | Provider-independent interfaces | ✅ Implemented & verified | `providers/base.py` (ChatProvider), registry, router, mock (tests pass), Ollama adapter (httpx MockTransport tests) |
| 9 | Mock-provider tests pass; paid integrations disabled | ✅ Verified | `test_providers_mock.py`, `test_providers_registry.py`; `UAB_ALLOW_PAID_PROVIDERS=false` default; router refuses paid selection by default |
| 10 | Python 3.14 reproducibility or documented blocker | ⚠️ **Blocker documented** — NOT verified | See §6; CI job defined, never executed; local loop ran on 3.11.2 |
| 11 | CI + automated testing foundations | ⚠️ **Configured, never executed** | `.github/workflows/ci.yml` (lint, 3.14 test with postgres:16 service, OpenAPI drift, upstream reference). Local lint+tests pass; CI itself untested |
| 12 | Hermes protected | ✅ Verified | `work/hermes-agent` + `acquisition/original` untouched this batch; no commits in that tree; branches: only `arena/2e48576e-*` |
| 13 | Google AI Studio integration requirements/documentation complete | ✅ Documented (docs-only, as scoped) | `docs/contracts/frontend-integration.md`; `contracts/openapi.json` generated (15 paths) |
| 14 | Changes reviewed & committed | ⏳ This report + commit pending — **stopping for review first** | No commit made yet (see §9) |
| 15 | REPORT-02 exists | ✅ This file | — |
| 16 | Scope discipline honored (BATCH 03 not started) | ✅ | No agent execution, no UI, no paid providers, no external DBs |

---

## 2. What was IMPLEMENTED AND VERIFIED

All verification below was executed 2026-11-13 on Linux x86_64, Python 3.11.2, embedded PostgreSQL
16.2 (`pgserver`). Commands and results are reproducible.

### 2.1 Database & migrations
- Alembic environment (`alembic/env.py`) reads `UAB_DATABASE_URL`; **no credentials committed**.
- Initial revision `09f16b9dfa10` creates 7 tables: `users` (incl. `is_superadmin`, argon2 password
  hash), `workspaces`, `workspace_memberships`, `agents`, `agent_configs`, `app_settings`,
  `audit_events` + 5 secondary indexes; all FK/cascade behavior explicit.
- Verified: `alembic upgrade head`, `downgrade base`, `upgrade head` round-trip on embedded PG
  (twice — standalone and via `tests/test_db_migrations.py` on a private instance).
- UUID PKs via `gen_random_uuid()`; `jsonb` for config/metadata; `TEXT+CHECK` for role/status.

### 2.2 Data access & transactions
- SQLAlchemy 2.0 style engine/session (`db/session.py`), `transaction()` helper with rollback on
  error, `database_health()` probe.
- Repository layer (`repositories/`) is the only DB-touching code; workspace-scoped queries by
  construction (404 semantics for foreign objects). Unit-integration tested via API suite.

### 2.3 API foundation
- `create_app()` factory; module-level `app` for uvicorn; `/api/docs`, `/api/openapi.json`,
  `/health`, `/health/ready` (503 when DB unreachable).
- `/api/v1` routers: `auth` (register/login/refresh/me), `workspaces` (CRUD, members, roles),
  `agents` (CRUD + lifecycle), `audit` (paginated, admin), `settings` (read any user / superadmin
  upsert + audit). Aggregate router wiring verified.
- Standard error envelope `{error:{code,message,details,correlation_id}}`; correlation-id middleware;
  catch-all 500 without leaking internals; 422 validation mapping; 404-over-403 cross-tenant policy.

### 2.4 AuthN/AuthZ
- argon2 password hashing (garbage hashes rejected without exceptions — fixed this batch).
- JWT access/refresh pair with `sub/iat/exp/jti/typ`; HS256; iss pinned; test coverage for expiry,
  wrong secret, type confusion.
- Static RBAC matrix; role hierarchy (`viewer<member<admin<owner`); admin cannot grant owner;
  last-owner demotion/removal blocked (409).
- Registration bootstrap: first user = workspace owner; afterwards closed by default.

### 2.5 Provider-independent AI interface
- `ChatProvider` protocol + `ProviderInfo` (kind, free-tier quota notes, private-data signal).
- Deterministic **mock provider** (temperature-honoring, no network) — full test coverage.
- **Ollama adapter** using httpx against `/api/generate` (configurable base URL); deterministic
  response ids (sha256 of normalized payload); unavailability raises provider-unavailable, tested
  via MockTransport; control plane does not require Ollama to boot/test.
- **Cost-policy router** order: LOCAL → FREE-TIER (if enabled) → PAID (only if
  `UAB_ALLOW_PAID_PROVIDERS=true`); unknown/unauthorized provider ⇒ explicit error, never silent
  paid fallback.

### 2.6 Audit & settings
- Append-only `audit_events`; every mutating path emits one (verified by
  `test_api_agents.py::…audit_events row check` and the audit API test).
- `app_settings` superadmin-upsert with `settings.updated` audit event; any authenticated user can
  read (banner/flags), only superadmins write.

### 2.7 Quality gates executed locally
- `ruff check src tests alembic` — clean (line-length 120, py312 target).
- `ruff format` applied; `pytest` — **71/71 passed** (unit + integration + API + migration tests,
  embedded PG, ASGI transport — no ports, no network, no paid APIs).
- OpenAPI contract export: `contracts/openapi.json` regenerated deterministically from `create_app()`
  (15 paths), sorted keys; CI drift check added.
- Boot smoke: uvicorn + real HTTP (`/health`, `/health/ready`, login → settings PUT/GET) verified.
- `uab-bootstrap` CLI verified end-to-end on a fresh embedded PG (creates superadmin; grants flag;
  second run without `--force` documented behavior).

### 2.8 Test inventory (71)
config, password hashing (incl. garbage input), JWT (issue/verify/expiry/type-confusion/wrong
secret), RBAC (matrix + hierarchy + permissions), mock provider, provider registry + policy router,
Ollama adapter (MockTransport), health endpoints, auth API, workspaces API (isolation, membership,
role guards incl. last-owner/owner-grant rules), agents API (CRUD + full lifecycle + audit row),
audit API (member 403 / owner 200), DB migration up/down/up.

---

## 3. IMPLEMENTED BUT NOT FULLY VERIFIED

| Item | Why not fully verified |
|---|---|
| Docker compose dev flow (`docker-compose.dev.yml`) | Docker daemon unavailable in this sandbox; file written from postgres:16-alpine conventions only. **Run `docker compose -f docker-compose.dev.yml up -d` on a Docker host and re-run `alembic upgrade head` before relying on it.** |
| `.github/workflows/ci.yml` | Never executed; YAML and 3.14 semantics (e.g. `uv python install 3.14`, `setup-uv` availability) unproven. Tier-1 risk: first CI run may fail on details, not concepts. |
| `uv.lock` | Not generated (`uv lock` needs PyPI access; this sandbox reaches PyPI only intermittently). Until it exists, CI installs floors from `pyproject.toml` — build reproducibility is weaker than intended. |
| Admin-grants-owner & last-owner edge cases under concurrency | Covered logically by service guards; not stress-tested for races (acceptable for BATCH 02). |
| Settings `PUT` audit row content | Exercised by smoke test (event emitted); field-level assertions limited. |
| `uab-bootstrap --force` re-run path | Path written; only fresh-create verified on the embedded instance. |
| Refresh-token revocation | Intentionally out of scope (documented gap, BATCH 12). No test pretends otherwise. |
| Ollama against a **real** server | Mocked only; never run against a live Ollama in this sandbox. |
| Health-readiness semantics under DB kill | 503 path unit-verified with monkeypatched probe only. |

---

## 4. DOCUMENTED BUT NOT IMPLEMENTED

- **Google AI Studio frontend** — contract only by design (`docs/contracts/frontend-integration.md`);
  no UI code, no Next.js scaffolding in this repo (ownership is explicitly the frontend repo).
- **Real-time events (SSE/WebSocket)** — contract documents intent and interim polling strategy;
  endpoints do not exist yet.
- **Runtime bridge to Hermes** (sessions, agent dispatch, event export) — BATCH 03+.
- **Row-level security, rate limiting, JWT revocation, SSO/OIDC, secrets manager** — documented as
  BATCH 12/16 hardening gaps, not built.
- **Organization model** (departments, teams, team leaders, CEO-led orgs, inter-agent delegation,
  A2A orchestration) — roadmap only (REPORT-01 BATCH 04–10); nothing simulated or stubbed here.
- **Redis / pub-sub / websockets infra** — deliberately absent; DB is the only state store now.
- **`.github` branch protections, secret scanning (gitleaks), SBOM, container scanning** — not run;
  CI does not yet include them.
- **Multi-worker/production server config** (gunicorn/uvicorn workers, TLS) — BATCH 16 with the
  supervised image.

---

## 5. NOT IMPLEMENTED (out of scope / deferred by directive)

- Agent execution of any kind, tool use, memory, tasks, workflows — BATCH 03+ by design.
- Frontend/mobile apps — out of scope; contract provided instead.
- Paid provider calls (OpenAI/Anthropic/Gemini paid) — requires explicit user authorization; router
  keeps them off.
- Neon or any external-hosted database — explicitly not used; uncommitted if ever authorized.
- Windows/macOS dev loops — untested; assumed compatible but not claimed.
- Hermes feature work, `hermes update`, runtime patches — none taken; `work/hermes-agent` pristine.

---

## 6. Python 3.14 — blocker record

- **Requirement:** project targets Python 3.14 (BATCH 02 approval, B2/C).
- **This sandbox:** `python3 --version` → 3.11.2; `uv python install 3.14` fails (python-build-
  standalone host is unreachable/filtered; apt unreachable too). No 3.14 in CI history because no
  CI run exists yet.
- **What is verified on 3.11.2:** install, ruff, all 71 tests, embedded PG, migrations, boot smoke.
  3.11 support is a *development convenience only*, not product positioning.
- **What CI defines for 3.14:** `.github/workflows/ci.yml` job `platform-test`: uv-installed 3.14 +
  `postgres:16-alpine` service + `alembic upgrade head`, downgrade/upgrade, full pytest; plus
  `platform-lint` and `openapi-drift` on 3.14. The first green 3.14 run is the moment this
  criterion flips to VERIFIED.
- **Pydantic/FastAPI/SQLAlchemy versions** all support 3.14, so no blocker is anticipated; but per
  policy this report does **not** claim 3.14 compatibility.
- **Action for owner:** open the repo on GitHub and require both CI jobs on `main`; treat any red
  3.14 run as a release blocker for BATCH 03.

---

## 7. Repository hygiene

- New top-level areas: `platform/`, `contracts/`, `.github/workflows/`, `docs/`, `scripts/`,
  `docker-compose.dev.yml`. Hermes trees (`acquisition/`, `work/`) remain git-ignored and untouched.
- No secrets committed: `.env` ignored; `.env.example` carries dev-only placeholders;
  `validate_for_production()` rejects the dev JWT secret; error handlers avoid echoing internals.
- `reports/REPORT-02-engineering-foundation.md` is this file; REPORT-01 preserved unchanged.
- Recommended next pushes: `.gitignore` already covers `acquisition/` & `work/`; consider adding
  `*.local` / `.venv*` (already present) and a CI secret-scan job later.

---

## 8. Defects fixed in this batch (BATCH 02 loop)

1. `api/v1/agents.py` inline `__import__("pydantic").BaseModel` hack → normal import (BaseModel was
   already importable; the hack defeated static analysis).
2. `api/deps.py` `get_db()` closed the request session without commit/rollback semantics. Now:
   commit on successful request, rollback on exception (handlers' explicit `session.commit()` calls
   remain harmless no-ops on a clean session). The interim note claiming `get_session_factory` was
   missing was stale — it exists in `db/session.py` and is used by both `get_db` and `transaction()`.
3. `api/v1/auth.py` emitted audit events *after* response creation; now transactional with the
   write (workspace.created emitted inside the registration transaction).
4. `verify_password` raised on malformed/garbage hashes → now returns False safely (test added).
5. Lifecycle/activation & membership guards: order-of-checks verified by tests (403 vs 404 vs 409).
6. `scripts/dev_db.py` `--`-separator bug that produced `/bin/sh: illegal option --`; now strips it
   and accepts absolute command paths.
7. Ruff findings: 109 → 0 (E501 wrapped at 120 cols, unused imports/noqa removed, S105/S106/S107
   noqa'd with justification, StrEnum deferred via explicit ignore with reason).
8. `pytest-asyncio` fixture-loop-scope warning → `asyncio_default_fixture_loop_scope = "function"`.
9. Audit read access: member role gets 403; covered by test (earlier behavior allowed any member).

### 8.1 Note on `api/deps.py`
The session-wide reminder flagged `get_db()` calling a possibly-missing helper. Final state at
commit: `db/session.py` exports `get_session_factory()` (used by `transaction()` and `get_db()`),
and `get_db()` yields an autocommitting/rollback-on-exception request session. Verified by the
entire API test suite (registration → audit rows persist; 71/71 tests green).

---

## 9. Review & commit status

- **No commit has been made yet.** Per directive "Changes reviewed & committed; stopping for review",
  the full diff is staged for review by the project owner first.
- Suggested commit sequence (single squash acceptable):
  1. `platform/` skeleton + migrations + tests
  2. docs/contracts/ADRs + CI + report
- After approval: `git add -A && git commit` then open PR `arena/2e48576e-universal-ai-agent-builder` → `main`.

---

## 10. What the owner should verify before approving BATCH 03

1. CI green on GitHub for this branch (esp. the 3.14 job).
2. `docker compose -f docker-compose.dev.yml up -d` + `alembic upgrade head` on a Docker host.
3. Fresh-clone bootstrap: `uv venv && uv pip install -e . --group dev && pytest` on 3.14.
4. Read the Google AI Studio contract against your frontend plan; amend **in a PR here** if the
   frontend needs a contract change (never frontend-side-only).
5. Confirm paid providers remain disabled (`UAB_ALLOW_PAID_PROVIDERS=false`) for any environment
   that has or will have network egress.
6. Confirm you accept the BATCH 03 scope: Hermes runtime bridge (definition + implementation of the
   runtime-facing API surface), *not* full org-tree execution yet.

## 11. Known residual risks

- CI unproven; lock file absent; 3.14 unproven; Docker dev path unproven — all stated above.
- Embedded `pgserver` ≠ production PG (no TLS, single user, unix socket). Fine for dev/tests only.
- `app_settings` is unscoped by workspace (platform-global by design) — revisit at BATCH 13 (SaaS).
- Static RBAC matrix changes require deploy; intended.
- JWT refresh tokens are not revocable until BATCH 12; mitigate with short TTLs on exposed deployments.

---

**Bottom line:** BATCH 02 delivers a tested, documented, Hermes-safe engineering foundation with an
honest boundary between verified and aspirational work. The two hard blockers (3.14 execution and
CI reality) are explicitly assigned to the owner's GitHub run rather than declared done.
