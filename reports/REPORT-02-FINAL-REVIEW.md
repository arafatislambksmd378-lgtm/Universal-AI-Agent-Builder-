# BATCH 02 — Final Review

Branch: `arena/2e48576e-universal-ai-agent-builder` · PR #1 (OPEN, not merged) · Base: `main` (6fc7fe5)
Date: 2026-11-13 · Reviewer directive: owner review of BATCH 02 before any BATCH 03 authorization.

> Verdict up front: **READY FOR OWNER MERGE** (owner must press the button — the branch was not and
> will not be merged by the executor). All CI jobs are green on Python 3.14 against a real
> `postgres:16` service, migrations apply/revert/re-apply cleanly, Hermes is byte-untouched, the
> Google AI Studio frontend contract is complete and enforced by a drift-checked OpenAPI artifact,
> and every locally-testable claim below was actually executed. Remaining gaps (Docker execution,
> raw CI log capture) are stated explicitly in §13, not hidden.

---

## 1. PR #1 review

Method: file-by-file read of the full PR diff (90 files after the review commits; ~8406 added
lines before fixes), focused on security and correctness-critical paths: migrations, models,
repositories, services, API layer, security modules, config, CI, contracts, acquisition manifest.

**No accidental changes to the original Hermes source.** `work/`, `acquisition/original/`,
`acquisition/zip/` are git-ignored; the PR contains no files from those trees (the only
`acquisition/` entry is the tracked provenance JSON). Hermes working tree has 0 modifications;
`work/hermes-agent` is untouched. The PR even records `fd3174e…` consistently
(`acquisition/ACQUISITION-METADATA.json` and `docs/upstream.md`, CI-enforced by `upstream-reference`).

**No third-party artifacts committed.** `platform/.venv`, caches, pgdata — none present
(`.gitignore` covers them; CI runner starts clean).

**No secrets.** Repo-wide scan: only documented dev placeholders (`dev-only-insecure-jwt-secret-change-me`,
`uab-ci-only-…`, test-only strings). `.env` never committed; `.env.example` is placeholder-only;
error envelopes never echo driver internals; `redacted_database_url()` exists for diagnostics.

**Explicit findings (all fixed during this review — see §12):**

| # | Finding | Severity | Disposition |
|---|---|---|---|
| R1 | `agents:lifecycle` (activate/pause/archive/restore) was granted to `member`, violating ADR-0005 and the project's "no unauthorized execution" rule | High | RBAC changed to admin; test added (member→403, admin→200) |
| R2 | JWTs documented as pinned to issuer `uab-control-plane`, but `iss` was neither issued nor verified | Medium | `iss` issued + enforced; forged-issuer test added |
| R3 | Lifecycle audit events emitted `agent.activate` vs documented vocabulary `agent.activated…` | Medium | code aligned to docs; `agent.restored` added |
| R4 | CI install step used invalid `uv pip install --group dev`; lint+test jobs failed on both runs | Blocker | workflow rewritten (`uv sync --locked --group dev --python 3.14`); now green |
| R5 | `pgserver` cannot install on CPython 3.14 (wheels only to cp312), would have blocked the 3.14 CI leg | Blocker (latent) | moved to `local` group; CI uses `postgres:16` service; conftest accepts external PG |
| R6 | `alembic` `script_location` resolved relative to cwd → tests failed outside `platform/` | Medium | conftest/test set it absolutely |
| R7 | `verify_password` raised on malformed hashes | Medium | returns False; test added |
| R8 | `get_db()` closed sessions without commit/rollback semantics | Medium | commit-on-success, rollback-on-exception |
| R9 | No CORS path for the browser frontend (would have forced a proxy hack later) | Low (feature gap) | opt-in `UAB_CORS_ORIGINS` allowlist, default off; credentialed |
| R10 | Contract said `agent.activated`/`agent.restored`; `PATCH/DELETE /workspaces/{id}` rows missing from endpoint table | Low | docs aligned; changelog added |

**Architectural problems found:** none requiring rework. Considered-and-accepted tradeoffs (documented,
not accidental complexity): handlers call `session.commit()` explicitly (double-commit safe);
`GET /workspaces` returns an unwrapped array; static code-defined RBAC (auditable in diff);
audit read is admin-only even for workspace owners' convenience views; `GET /settings` is any-user
for feature flags (documented to hold non-secrets only).

**Overall PR verdict:** sound foundation; 10 issues found, all fixed and re-verified. Do not merge
until you (owner) are satisfied with §13/§14.

---

## 2. Actual CI status (as of e1e33da)

Workflow `.github/workflows/ci.yml`. History on this branch:

| Run | Event | Result |
|---|---|---|
| 43420264028 / 43420280132 (c8229da) | push / PR | **failure** — `Install platform` step (`uv pip install --group dev` is not a valid flag) |
| 44453360073 / 44453365233 (100ae83) | push / PR | **success** — all 4 jobs |
| 44453782974 / 44453789668 (3a78417) | push / PR | **success** — all 4 jobs |
| 44454249884 / 44454256520 (e1e33da) | push / PR | **success** — all 4 jobs |

Current jobs (all `success` on e1e33da): `platform-lint` (ruff lint + format check on **3.14**),
`platform-test` (3.14 + postgres:16-alpine service: locked sync → 3.14 assert → `alembic upgrade`
→ downgrade/upgrade check → full pytest), `openapi-drift` (regenerate + `git diff --exit-code`),
`upstream-reference` (Hermes pin + no vendored upstream code).

Caveats: (a) Node 20 deprecation warnings on `actions/checkout@v4`/`setup-uv@v6` (annotations only);
(b) raw job logs could not be archived from this sandbox (proxy EOF on the log endpoints) — job and
step **conclusions are API-verified**, not scraped from text logs; the `platform-test` steps through
"Run test suite" are all `success`.

---

## 3. Python 3.14 verification

**Status: verified in CI; not reproducible in the local sandbox (3.11.2 only).**

Evidence (CI run 44454249884, `platform-test` job, all steps `success`):
1. `uv python install 3.14` — interpreter obtained from python-build-standalone.
2. `uv sync --locked --group dev --python 3.14` — locked install succeeded on 3.14
   (pgserver correctly absent from `dev`).
3. `uv run python -c "import sys; assert sys.version_info[:2]==(3,14)"` — explicit assert.
4. `alembic upgrade head`, then `downgrade base && upgrade head` — reversible migrations on service PG.
5. `uv run pytest tests/ -q` — exit 0 on 3.14 (suite includes DB + migration up/down/up tests;
   `UAB_TEST_DATABASE_URL` points at the service, so nothing was skipped for lack of a database).

Local 3.11.2 loop re-verified after every change (81/81 passed, ruff clean). **3.11 results are not
3.14 evidence**; the CI job is the sole 3.14 authority and it is green. `uv.lock` covers
`requires-python >=3.11,<3.15`.

---

## 4. Dependency management / lockfile

`platform/uv.lock` **is committed** (uv 0.13.9 resolution, 50 packages). No dependency versions were
bumped by hand; floors in `pyproject.toml` were resolved to mutually compatible releases:
fastapi 0.165.0, starlette 1.10.0, sqlalchemy 2.0.58, pydantic 2.14.3, pydantic-settings 2.16.3,
pyjwt 2.15.1, argon2-cffi 25.1.0, httpx 0.28.1, uvicorn 0.54.0, alembic 1.20.1, pytest 9.2.0,
pytest-asyncio 1.5.0, ruff 0.17.5, psycopg 3.3.9.

Verified: `uv sync --locked --group dev` (fresh env) → install OK → 79/79 (at that commit); suite
then grew to 81 (security review additions) — locked env re-verified, all green. CI installs with
`--locked` everywhere, so the lock cannot silently drift (`openapi-drift` and `--locked` both fail
on inconsistency).

**Dependency conflicts:** none encountered. **Structural decision:** `pgserver` was removed from
`dev` (moved to `local` group) because it ships wheels ≤ cp312 — otherwise a 3.14 locked install is
impossible. Local developers on ≤3.12 use `uv sync --group dev --group local`; CI needs no embedded PG.

---

## 5. PostgreSQL verification

**Executed (local, embedded PG 16.2 via pgserver):**
- `alembic upgrade head` on a fresh instance → both revisions applied
  (`09f16b9dfa10` → `51d4c7e1a9b2`).
- `downgrade base` → all tables dropped; `upgrade head` → clean; repeated round-trip OK.
- Full suite (81 tests) against embedded PG — includes `test_db_migrations.py` (up/down/up on a
  private instance) and all transactional/API paths.
- External-PG mode rehearsal: suite run with `UAB_TEST_DATABASE_URL` pointed at a separate embedded
  server → 71/71 (pre-avatar commit) — the exact code path the CI postgres:16 service exercises,
  including scratch-database creation/drop in the migration test.

**Executed (CI, real postgres:16-alpine service):** `alembic upgrade head`, downgrade/upgrade check,
full suite on 3.14 — job green.

**Not executed locally:** anything over TCP/TLS or with multiple roles; embedded PG is unix-socket,
single-user, throwaway — dev/test only, never production.

---

## 6. Docker verification

**Docker is unavailable in the development sandbox.** Status of the Docker deliverables:
- `docker-compose.dev.yml` (postgres:16-alpine, 127.0.0.1-only port, healthcheck
  `pg_isready -U uab -d uab`, named volume `uab-pgdata`, throwaway `uab`/`uab` creds) —
  **statically reviewed only. It has never been run.**
- Production image / supervised runtime — not in BATCH 02 (BATCH 16).
- CI does not build the compose file; CI verifies the same schema/tests against a postgres:16
  service instead.

**Therefore: configuration review ✅, execution verification ❌ — do not read this report as
"Docker deployment tested".** First run on a Docker host: `docker compose -f docker-compose.dev.yml
up -d && cd platform && uv run alembic upgrade head` (after `uv sync --locked --group dev`).

---

## 7. Security review (focused)

**JWT.** HS256 pinned by settings; `sub/iss/iat/exp/jti/typ` required; **issuer now pinned and
verified** (R2); access TTL 900 s / refresh 30 d defaults; `typ` enforcement blocks access↔refresh
confusion; algorithm confusion prevented (algorithms whitelist from settings); expiry enforced
(`exp` required). **Refresh tokens are not revocable and do not rotate** — a stolen refresh token is
valid until expiry; short access TTL is the only mitigation today. Deferred to BATCH 12 (jti denylist
or refresh-token table + rotation + reuse detection).

**Password hashing.** argon2id via argon2-cffi (library defaults, 19 MiB/2 iter class params);
garbage/corrupt hashes rejected without exceptions (R7); `needs_rehash()` available; no plaintext,
no reversible storage; passwords never logged (registration/login bodies are not logged).

**Bootstrap.** `uab-bootstrap` is the only superadmin mint; refuses to run when a superadmin exists
without `--force`; min length 12; HTTP API can never set `is_superadmin`. Caveats documented:
`--password` visible in shell history/process list (env var `UAB_BOOTSTRAP_PASSWORD` preferred);
bootstrap emits no audit row (runs outside HTTP) — noted, accepted for operator tooling.

**RBAC.** Static, fail-closed matrix (`viewer<member<admin<owner` + superadmin-only settings PUT);
unknown permissions deny; owner-only grants/revokes of `owner`; last-owner demotion/removal blocked
(409); lifecycle now admin-gated (R1); activation impossible from `archived`; every mutating service
emits an audit row in the same transaction (incl. `workspace.created` from registration).

**Workspace isolation.** All queries filter by `workspace_id`; foreign objects return 404 (no
existence oracle); membership required for any workspace-scoped route; cross-tenant agent/members
access covered by tests. Hard DB-level isolation (Postgres RLS) **not implemented** — BATCH 12.

**Input validation.** Pydantic everywhere; slug/capability regex; avatar ref consistency
(`avatar_type` ⇒ reference required, 422 otherwise); lifecycle enum-checked; 422 envelope with
`details[].loc`; agent config schema bounded (temperature ≤2, budget ≥0, max_tokens ≤1e6);
`app_settings.key` pattern-locked; unknown JSON fields rejected on create/update? (pydantic default:
ignored — see limitations §13).

**Audit integrity.** Append-only table; no update/delete routes; written transactionally with the
mutation; read requires admin; workspace deletion keeps rows (SET NULL). No tamper-evidence hashing
(e.g. chained HMAC) yet — accepted, BATCH 12/16 hardening.

**Secret handling.** No hardcoded credentials; `.env` ignored; `.env.example` placeholders;
`validate_for_production()` refuses dev JWT secret / dev DB URL / paid-providers-enabled in
production; JSON logs carry only level/logger/message/correlation_id/status; driver errors mapped to
generic codes; OpenAPI contains no secrets (verified in drift check artifact).

**Paid providers.** `UAB_ALLOW_PAID_PROVIDERS=false` default; registry rejects paid resolution by
name *and* by cost-order default; `assert_call_allowed()` defense-in-depth gate; a paid provider is
never used as implicit fallback. Ollama (local) and the deterministic mock are the only exercised
paths; no test requires network or keys.

**Deferred security work (explicitly NOT implemented):** rate limiting & brute-force throttling
(BATCH 12), refresh-token revocation/rotation (BATCH 12), Postgres RLS (BATCH 12+), per-workspace
API keys for runtime→control-plane (BATCH 03+), SSO/OIDC (BATCH 12+), signed audit chain (BATCH 12/16),
secrets manager integration (BATCH 16), CORS * (never; allowlist only).

---

## 8. Frontend contract alignment (Google AI Studio)

`docs/contracts/frontend-integration.md` rewritten to cover the owner's vision end-to-end:

- **A. Overall UI/UX** — §1 records the visual direction (near-white backgrounds, purple primary
  accent, gradient/shadow system, rounded cards, compact nav, responsive, functional-over-decorative)
  as frontend design-system input; backend stores none of it (correct ownership split).
- **B. Agent avatar & identity system** — §5/§6: full `Agent` schema with `avatar_id`, `avatar_url`,
  `avatar_type` (`preset|upload|url|generated`), `avatar_style`, `avatar_metadata` (opaque JSON;
  suggested palette/mood/seed keys, frontend-defined), `capabilities[]` (identity chips, distinct
  from execution `tool_allowlist`). Preset library model (frontend-shipped 2D character art keyed by
  `avatar_id`), custom upload/URL avatars, dedicated main-assistant mascot slot (suggested
  `preset-mascot-main`). Backend never calls an image-generation provider. **Provider-independent,
  as required.**
- **C. Agent management** — §4: create/view/edit/pause/resume/archive/delete + individual profile
  fields (`name`, `role`, `description`, `status`, `capabilities`, `config` incl. provider/model,
  `avatar_*`), team membership **reserved** (`team`/`organization` keys present, always null today,
  populated in BATCH 04+). "Display agent activity" via new
  `GET /workspaces/{id}/agents/{agent_id}/activity` (admin) — implemented, tested, paginated.
- **D. Live activity & monitoring** — §8: formal event contract over **SSE** (`GET …/events`,
  reserved event types `agent.status`, `agent.task.started|progress|completed|failed`,
  `approval.required`, `a2a.message`; `seq` ordering, `Last-Event-ID` replay, keep-alive, polling
  fallback). **Explicitly documented as NOT IMPLEMENTED**; interim polling path (audit feed +
  agent activity endpoint + `updated_at` signal) is implemented and tested. WebSocket reserved for
  bidirectional needs only.
- **E. Future extensibility** — §9: teams/team leaders/orgs (BATCH 04–06, reserved keys), Visual
  Agent Builder / Workflow Builder (BATCH 07/08), Knowledge Base (BATCH 09), Tools & Skills (BATCH 07),
  API Management (BATCH 13), Live Activity (§8), Approval Management (BATCH 10) — all additive-v1
  with explicit reserved keys and versioning rules. Nothing prematurely built.
- **F. Contract completeness** — endpoint reference with permissions and request/response examples
  (§4), TS schemas (§5), avatar schema (§5/§6), workspace schema, auth flow (§2), error envelope +
  per-code UI guidance (§3), pagination (§10), lifecycle semantics (§7), activity event schema (§8),
  ownership & change control (§12), change log (§13).

`contracts/openapi.json` regenerated from the app (16 paths, sorted, deterministic) and the CI
**openapi-drift** job (`git diff --exit-code`) is green on the latest commits.

---

## 9. Avatar metadata support (backend)

Implemented and tested (commit 100ae83):

- **Migration** `51d4c7e1a9b2` (additive): `agents.avatar_id VARCHAR(120)`, `avatar_url
  VARCHAR(1000)`, `avatar_type VARCHAR(20)` with CHECK ∈ (`preset`,`upload`,`url`,`generated`),
  `avatar_style VARCHAR(120)`, `avatar_metadata JSONB`, `capabilities JSONB NOT NULL DEFAULT '[]'`.
  `avatar_ref` retained as deprecated-compat. Round-trip verified (up/down/up) on PG 16.2.
- **ORM** columns mirror migration (incl. check constraint).
- **API**: `AgentCreate`/`AgentUpdate` accept all avatar fields; capability tags validated
  (`^[a-z0-9][a-z0-9_.-]{0,39}$`, ≤40, normalized+deduped); `avatar_type` requires a reference
  (`avatar_id` for preset, `avatar_url` otherwise) else 422; `AgentResponse` echoes everything plus
  reserved null `team`/`organization`.
- **Tests**: create-with-avatar round-trip (incl. capability normalization), missing-reference 422,
  unknown `avatar_type` 422, capability regex/count 422, update avatar+capabilities, activity
  endpoint scoping + permissioning, audit `target_*` filter.

The frontend needs no backend change to start: preset IDs are conventions, artwork ships with the
frontend; `avatar_metadata` is free-form.

---

## 10. Live activity API readiness

- **Documented contract:** SSE stream with envelope `{seq, type, occurred_at, workspace_id, data}`;
  reserved event types enumerated in §8 of the frontend contract with data sketches and source
  batches; replay via `Last-Event-ID`; auth via Bearer or query token (EventSource limitation).
- **Implemented today (interim):** workspace audit feed with `event_type`/`target_type`/`target_id`
  filters; agent-scoped `…/activity`; `updated_at` on every agent. All admin-gated where audit data
  is involved.
- **Not implemented (and not claimed):** the SSE endpoint itself (`GET …/events` returns 404 today),
  event bus/dispatcher, task lifecycle events (no task system exists until BATCH 03/08), approval
  events (BATCH 10). Building the frontend polling loop is safe now; building SSE client logic now
  would be speculative — the contract is stable but the endpoint is deliberately absent.

---

## 11. Issues discovered (complete list)

R1–R10 (see §1) plus:
11. `REPORT-02` (engineering foundation report) contained stale claims at hand-off (CI red, no
    `uv.lock`, "get_session_factory missing") — errata banner added; this document is authoritative.
12. Reserved `team`/`organization` were absent from `AgentResponse` — added as always-null keys.
13. `GET …/audit` lacked target filters, making agent activity widgets impossible without full scans —
    `target_type`/`target_id` added (admin-only as before).
14. Contract/docs claimed `agent.restored` while code had no such event — added.
15. `pyproject.toml` ruff line-length vs E501 drift — resolved by wrapping instead of raising limits.
16. Sandbox filesystem was re-cloned between review turns (local history `25d3315`/`c8229da` vanished);
    recovered losslessly via `git reset --soft FETCH_HEAD` to the pushed branch (working tree untouched);
    backup tar retained at `/home/user/backup-worktree-*.tar`. **Lesson recorded: the remote is the
    source of truth; all work is pushed.**
17. `alembic -c` CLI with relative `script_location` fails from repo root — documented; tests immune.
18. pgserver prints RuntimeDirWarning (harmless) and is socket-only — accepted, dev-only.
19. Handler-level `session.commit()` + auto-commit get_db double-commit (no-op) — acceptable, noted.
20. `__main__.py` of the package prints package info only (`python -m uab_platform` ≠ CLI; CLI is
    `uab-bootstrap`) — documented in docstring.

## 12. Fixes completed (mapped to commits)

| Fix | Commit |
|---|---|
| R4–R6, `uv.lock`, dev/local dependency split, external-PG conftest + scratch-DB migration test, avatar identity (migration 51d4c7e1a9b2), `GET …/activity`, audit target filters, 8 new tests (79 total) | `100ae83` |
| R1–R2, R9 (CORS), issuer pinning tests, admin-gating test (81 total) | `3a78417` |
| R3, R10, contract rewrite/changelog, `REPORT-02` errata, `.env.example`/README/development.md alignment | `e1e33da` |
| R7 (password verifier hardening), R8 (get_db commit/rollback semantics) | `c8229da` |
| Frontend contract (Sections A–F) + OpenAPI regen + docs alignment | `e1e33da` (docs), `100ae83`/`3a78417` (code/spec) |

Post-fix verification: 81/81 tests (local 3.11 + CI 3.14 service), ruff clean, `openapi-drift` green,
migration up/down/up ×2 (local embedded + CI downgrade/upgrade step), `uab-bootstrap` end-to-end on a
fresh embedded PG, boot smoke of uvicorn (`/health`, `/health/ready`, login→settings flow).

---

## 13. Remaining limitations (not blockers, but you must know them)

1. **Docker path unverified** — `docker-compose.dev.yml` written, statically reviewed, **never run**.
2. **Raw CI logs not archivable here** — CI status evidenced at job/step conclusion level via the
   GitHub API; a human should spot-check one green run in the browser.
3. **Python 3.14 evidence is CI-only** — local sandbox is 3.11.2; no 3.14 hardware/VM was used.
4. Refresh tokens: no revocation/rotation (BATCH 12). Rate limiting/brute-force throttle absent (BATCH 12).
5. Postgres RLS absent; tenancy enforced in application code only (BATCH 12+).
6. Members can edit **active** agents' config (but cannot change status/lifecycle or read audit);
   if you want config freeze on activation, that's a BATCH 03+ policy decision.
7. No email invites — members must have accounts already (invite flow: BATCH 12+).
8. SSE/events not implemented (documented contract only, see §10). Live activity UI must poll.
9. Embedded `pgserver`: unix-socket, single-user, PG 16.2, ≤ cp312 wheels — dev/test convenience.
10. `uv.lock` covers CPython 3.11–3.14 resolution; exotic platforms (arm64 CI fallback) untested.
11. Unknown JSON fields in request bodies are ignored by pydantic defaults (typo-tolerance), not rejected.
12. `app_settings` is platform-global (not workspace-scoped) by design.
13. Sandbox filesystem reset once during this review (recovered, §11.16) — keep everything pushed;
    consider Protected Branch on `main` + required CI checks before any real deployment.
14. Hermes runtime bridge does not exist yet — no agent executes anything; nothing here authorizes
    enabling runtime tool execution.

---

## 14. Exact commit references (branch `arena/2e48576e-universal-ai-agent-builder`)

- `6fc7fe5` — base `main` (branch point)
- `25d3315` — docs: acquisition manifest (pre-existing on branch)
- `c8229da` — BATCH 02 initial implementation (control plane, migrations, 71 tests, contracts, CI v1)
- `100ae83` — CI repair + `uv.lock` + dev/local split + avatar identity + agent activity endpoint + audit target filters (79 tests; HEAD before security pass)
- `3a78417` — security: JWT `iss` pinning, admin-gated lifecycle, opt-in CORS, R7/R8 hardening (81 tests)
- `e1e33da` — audit event vocabulary fix; frontend contract rewrite (A–F) + OpenAPI regen; docs alignment; REPORT-02 errata — **this HEAD**
- PR #1 (open): https://github.com/arafatislambksmd378-lgtm/Universal-AI-Agent-Builder-/pull/1
- Green CI runs (all jobs): `44453360073`, `44453365233` (100ae83) · `44453782974`, `44453789668` (3a78417) · `44454249884`, `44454256520` (e1e33da)
- Superseded/failed runs: `43420264028`, `43420280132` (c8229da, CI v1 install bug)

## 15. Final recommendation

**READY FOR OWNER MERGE.**

- CI green on Python 3.14 + postgres:16 (locked deps, migrations reversible, suite passes, OpenAPI
  drift checked, Hermes untouched, no secrets).
- The owner-visible gaps that remain (Docker execution, browser spot-check of CI logs, refresh
  revocation, rate limiting, RLS, SSE) are documented with owners/batches, none of them can be
  silently broken by merging.
- Merge conditions I suggest you impose: (1) require the `platform-lint`/`platform-test`/`openapi-drift`
  checks on `main` via branch protection; (2) merge via **merge commit** (keeps REPORT-02/REVIEW
  history visible); (3) do **not** tag/release from this branch; releases start post-BATCH 03.

## 16. STOP CONDITION

PR #1 is **not merged**. BATCH 03 has **not** been started. No further work beyond review fixes has
been pushed. Awaiting your explicit approval (and, if you want changes, a reopened review thread).
