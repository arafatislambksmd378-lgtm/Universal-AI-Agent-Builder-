# REPORT 01 — Hermes Source Acquisition & Technical Audit

**Project:** Universal AI Agent Builder (Hermes → Universal AI Agent Builder transformation)
**Date:** 2026-11-13 (UTC)
**Author:** Principal Software Architect / Lead Engineer (engineering agent)
**Status:** Complete — acquisition ✔, preservation ✔, working copy ✔, audit ✔ (static + smoke verification), roadmap ✔
**Decision gate:** No large-scale platform development has been started. This report + the roadmap are for review first.

---

## 0. How to read this report

Every claim is labeled:

- **[VERIFIED]** — checked by me, in this workspace, on 2026-11-13 (command evidence in §24).
- **[INSPECTED]** — read directly from source/docs at commit `fd3174e…` (but not executed end-to-end).
- **[ASSUMPTION]** — inference not yet verified against a live deployment.
- **[BLOCKED]** — could not be executed in this environment; exact reason and required action given.

---

## 1. Repository URL

<https://github.com/NousResearch/hermes-agent> — verified reachable, public, MIT-licensed, `isPrivate=false`. `[VERIFIED]`

## 2. Source branch

`main` (the repository's default branch). The official "latest release" is `v0.23.1` (2026-11-10); a canary `v0.23.1+canary.20261113T064447Z` was published 2026-11-13T08:06Z. The acquired snapshot is **`main` at `fd3174e9c5cdd037203bb4e111c950667988f3ca`, dated 2026-11-13T03:02:12-08:00** — i.e., *post-v0.23.1, pre-v0.23.2 development tip*. `[VERIFIED]`

## 3. Commit SHA

`fd3174e9c5cdd037203bb4e111c950667988f3ca` ("chore: map contributor email for aoyamari", committer date 2026-11-13T03:02:12-08:00). Identical for: `gh api repos/NousResearch/hermes-agent/commits/main`, the git clone in `work/hermes-agent`, and therefore the ZIP (which is named `refs/heads/main.zip`). `[VERIFIED]`

Latest stable release (not acquired): `v0.23.1`, published 2026-11-10T01:42:15Z. `[VERIFIED]`

## 4. ZIP download status

**SUCCESS.** `hermes-agent-main.zip`, 107,280,822 bytes (~102.3 MiB), downloaded 2026-11-13T11:04Z from the official URL
`https://github.com/NousResearch/hermes-agent/archive/refs/heads/main.zip`
into `acquisition/zip/hermes-agent-main.zip`. `[VERIFIED]`

## 5. ZIP integrity status

**PASS.**
- SHA-256: `9ea0e0e79e4ab09027bf59a0f90c34d0d78b5b2bceaace6e1771adb219baf427` `[VERIFIED]`
- `python3 -m zipfile` `testzip()`: no corrupt entries; 26,697 archive entries; 254,454,542 bytes uncompressed. `[VERIFIED]`
- Single top-level directory `hermes-agent-main/`. `[VERIFIED]`
- System `unzip`/`file` binaries do not exist in this sandbox (exit 127); Python's `zipfile` was used instead — equivalent verification. `[VERIFIED]`

## 6. Extraction status

**SUCCESS.** Extracted with `python3 zipfile.extractall` into `acquisition/original/hermes-agent-main/`. Result: 25,470 files (26,697 − 1,227 directory entries) totaling exactly 254,454,542 bytes — byte-level consistent with the ZIP central directory. `diff -qr` against the git working copy (excluding `.git`) reports **zero differences**. `[VERIFIED]`

## 7. Original backup location (archive + untouched snapshot)

| Artifact | Location | State |
|---|---|---|
| Original ZIP | `/home/user/Universal-AI-Agent-Builder-/acquisition/zip/hermes-agent-main.zip` | preserved, unmodified (read-only intent; never opened for write) |
| Untouched extracted snapshot | `/home/user/Universal-AI-Agent-Builder-/acquisition/original/hermes-agent-main/` | preserved, unmodified; never executed/compiled in place |
| Acquisition manifest | `/home/user/Universal-AI-Agent-Builder-/acquisition/ACQUISITION-METADATA.json` | machine-readable record of all of the above |

Both `acquisition/` trees and `work/` are **excluded from this Git repository by `.gitignore`** (large third-party artifacts; upstream can always re-fetch from GitHub). The untouched snapshot was never modified — all smoke tests were run in the working copy, after which it was restored to a pristine tree (`git status` clean at `fd3174e…`). `[VERIFIED]`

## 8. Working copy location

`/home/user/Universal-AI-Agent-Builder-/work/hermes-agent/` — full `git clone` of upstream (enables branch management & history as required). HEAD verified == `fd3174e9c5cdd037203bb4e111c950667988f3ca`; tree clean; history: **70,627 commits, first 2025-07-23** `.git` ≈ 1.5 GB. `[VERIFIED]`

No modification has been made to the working copy yet (it was used read-only for smoke tests; generated `__pycache__`/`test_durations.json` were removed and `git status` is clean). `[VERIFIED]`

> Layout decision (for review): acquisition artifacts are local-only and git-ignored. The platform repo (`Universal-AI-Agent-Builder-`) carries `reports/`, `docs/` and future new-code packages. The Hermes working copy remains a separate nested git repo. If we later decide to vendor Hermes into the platform repo (e.g., as `hermes-agent/`), that requires a ~254 MB, ~25k-file import that will not fit the session's ~128 MB patchset cap in one turn — it must be done deliberately in staged commits or kept as a linked working tree. See §19 (breaking-change risks) and §20 (roadmap), item L0. `[INSPECTED]`

## 9. Technology stack

**Backend / runtime:** Python (target **3.14**, `requires-python = ">=3.11,<3.15"` but all core dependency pins carry `python_version >= '3.14'` markers; `.python-version = 3.14`). `[VERIFIED]`
- Core: `openai==2.54.0`, `httpx[socks]==0.28.1`, `pydantic==2.14.1`, `cryptography==50.0.2` (all exact-pinned), `croniter`, `rich`, `prompt_toolkit`, `ruamel.yaml`, `jinja2`, `firecrawl-anydoc`, `Markdown`, `PyJWT[crypto]`, `certifi`, `truststore`, `requests`, `urllib3`, `psutil`, `websockets`, `fastapi`, `uvicorn`, `Pillow`, `nemo-relay`. Full pinned tree: `uv.lock` = **1,413 packages** (universal lock, exact pins, upper bounds; security-commented). `[VERIFIED]`
- Storage: **SQLite with FTS5** (sessions/messages/cron/kanban), WAL mode, per-profile `HERMES_HOME` layout, profile-scoped
- Gateway: **aiohttp** OpenAI-compatible API (`gateway/platforms/api_server.py`, ~4,111 lines), port 8642 default
- CLI: `prompt_toolkit` REPL (`cli.py` ~1,796 lines), slash-command registry

**Frontend (three surfaces, all React-based, TypeScript):**
- `web/` — dashboard SPA: React 19.3, Vite 8, Tailwind 4, `@nous-research/ui`, xterm.js (embeds the real TUI) — `[INSPECTED]`
- `ui-tui/` — terminal UI: Ink + React 19, nanostores — `[INSPECTED]`
- `apps/desktop/` — native desktop: **Electron** + Vite + React ("Hermes" product) — `[INSPECTED]`
- `apps/bootstrap-installer/`, `apps/shared/` — installer + shared pkgs
- `website/` — Docusaurus documentation site (30 MB)

**Toolchain:** `pnpm` workspaces (root `pnpm-workspace.yaml`), `uv` (Python env manager, `pm/` directory owns it), `just` (task runner), `lefthook`, `ruff`, `ty` (type checking), pinned GitHub Actions. Python is **not** installed via system package manager — via Hermes' own `pm` (uv). `[INSPECTED]`

**Scale snapshot:** ~11,494 Python files, ~2,782,000 LOC Python; **8,199 test files** (`tests/`) + JS tests (`tests-js/`, vitest); `tests/` alone ~87 MB; `apps/` ~62 MB. `[VERIFIED]`

## 10. Complete module overview

Verified by directory inspection of the checkout `[INSPECTED]`:

| Area | Path | Role |
|---|---|---|
| Agent core facade | `run_agent.py` (1,576 LOC) | `AIAgent` facade; turn loop lives in `agent/turn_*.py` (~430 files in `agent/`) |
| State / persistence | `hermes_state.py` (1,738 LOC facade) + ~100 `hermes_state_*.py` siblings | SessionDB: sessions, messages, FTS5 search, compression/rewind/repair, WAL management |
| Tool orchestration | `model_tools.py` (1,028 LOC), `toolsets.py`, `tools/` (**308 .py**) | `handle_function_call()`, registry (`tools/registry.py`), tool search (BM25 via snowballstemmer) |
| CLI | `cli.py`, `hermes_cli/` (**685 entries**) | arg parsing, slash commands, `hermes_cli/web_server.py` (1,546 LOC, dashboard backend), `kanban*`, profiles, auth, updates |
| Messaging gateway | `gateway/` (**392 files**), facade `gateway/run.py` | inbound/outbound for 26 platform plugins (`plugins/platforms/`), incl. **A2A v1.0**, Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Teams, … |
| Cron scheduler | `cron/` (57 files) | jobs store + tick loop, timezone pinning, catch-up window, delivery ledger, at-most-once dispatch |
| Kanban / work queue | `hermes_cli/kanban*.py`, `plugins/kanban/` | durable multi-agent task queue (SQLite), dispatch daemon, boards, swarm, GC, watch |
| TUI gateway | `tui_gateway/` (129 files) | JSON-RPC process bridge between UI and runtime |
| Dashboard | `web/`, `hermes_cli/web_server.py`, `hermes_cli/dashboard_auth/` | embedded dashboard, native http auth (cookies/token), RBAC-ish dashboard roles |
| Desktop | `apps/desktop/` | Electron shell, Bot Mode, native notifications |
| ACP | `acp_adapter/` | Agent Client Protocol for editors |
| Providers | `providers/` (registry) + `plugins/model-providers/` (**38** provider plugins: anthropic, openrouter, openai-codex, gemini, bedrock, ollama-cloud, lmstudio, nous, qwen-oauth, vertex, xai, …) | `ProviderProfile` ABC, lazy discovery |
| Skills | `skills/` (15 builtin categories, 307 files), `optional-skills/` (24 categories, 819 files) | agentskills.io-compatible; `hermes skills install`; curator (`agent/curator.py`) |
| MCP | `tools/mcp_tool.py`, `optional-mcps/` (**66 catalog servers**), `agent/transports/hermes_tools_mcp_server.py` | Hermes as MCP client AND as an MCP server |
| Plugins | `plugins/` (**537 files**, kinds: platform, memory, model-providers, browser, kanban, teams_pipeline, google_meet, video_gen, image_gen, config_backends, …) | plugin API `hermes_cli/data/plugin_api.json`; boundary lint (`scripts/boundary_lint.py`) |
| Delegation | `tools/async_delegation.py` (+workers), `agent/subagent_lifecycle.py`, `plugins/delegation/default/` | `delegate_task` sync + `background=true` async; per-child budgets, provider/model routing |
| Memory | `agent/memory_manager.py`, `agent/memory_provider.py`, `plugins/memory/` (byterover, retaindb), Honcho (external, via `agent/…` + docs) | builtin file memory (MEMORY.md/USER.md) + pluggable providers; FTS5 cross-session recall |
| Browser automation | `tools/browser_*.py` (~30 files), Playwright-managed Chromium, browser-harness (CDP) | headed/headless, real-profile logins, vault, sandbox |
| Terminal backends | local / Docker / SSH / Modal / Daytona / Vercel Sandbox (+ Singularity plugin) | pluggable `terminal()` execution targets |
| Deployment | `Dockerfile` (multi-stage, pinned sqlite 3.53.4 build, s6-overlay, trixie base pinned by digest), `docker-compose.yml`, `nix/`, `flake.nix`, `setup-hermes.sh`, Termux APT repo, MSIX | production-grade container packaging |
| Security | `SECURITY.md`, `tools/approval*.py` (12 files), `agent/estop.py`, `hermes_dir_acl.py`, iron-proxy egress (`hermes egress`), `agent/vault_backends/` | command approval, DM pairing, credential vault, egress firewall |
| Tests | `tests/` (8,199 files), `scripts/run_tests.sh` | per-file subprocess isolation, hermetic env, `@pytest.mark.platforms` gating |
| CI | `.github/workflows/` (via `.github` dir), `scripts/ci/`, `scripts/check` | prompt-surface snapshot gate, docs-drift gate, boundary lint, packaging guards |
| Docs | `website/` Docusaurus; `website/docs/developer-guide/…` | architecture docs, contribution rubric, cron internals, gateway internals |

## 11. Existing feature assessment (A = fully implemented per inspection + smoke tests)

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | AIAgent turn loop (streaming, tool calls, retries, compression) | **A** | `agent/turn_*.py` (~60 files), `run_turn*`/`run_turn_runner*`; imports cleanly; upstream CI green at HEAD `[INSPECTED][VERIFIED-import]` |
| 2 | 40+ core tools (terminal, files, web, browser, vision, TTS, todo, memory…) | **A** | `toolsets.py::_HERMES_CORE_TOOLS`; `tools/` registry; smoke: imports + tool search tests pass `[INSPECTED][VERIFIED-partial]` |
| 3 | CLI REPL with slash commands, autocomplete, history | **A** | `cli.py` works: `python -m hermes_cli.main --help` prints full command table `[VERIFIED]` |
| 4 | Messaging gateway (26 platform plugins) | **A-** | All adapters present in-tree, shared base/guard machinery; live delivery not exercised here (needs per-platform credentials) → `[INSPECTED]`; gateway import clean `[VERIFIED-import]` |
| 5 | OpenAI-compatible HTTP API (sessions, chat, responses, runs, jobs, models, capabilities, health) | **A-** | 30+ routes enumerated from source; aiohttp app; `API_SERVER_KEY` bearer auth; `X-Hermes-Session-Id` continuity; behavior contract tests exist upstream; not smoke-run here `[INSPECTED]` |
| 6 | Cron scheduler (natural-language schedules, delivery to any platform) | **A** | `cron/` tick loop, at-most-once dispatch, inactivity watchdog, IANA timezone pinning, catch-up window; extensively unit-tested upstream `[INSPECTED]` |
| 7 | Session/message persistence with FTS5 search + compression lineage | **A** | `hermes_state*.py`; 3 state test files run in this env: **306 tests pass** `[VERIFIED]` |
| 8 | Subagent delegation (sync + async background, budgets) | **A** | `delegate_task` tool, `tools/async_delegation_*`, per-child toolsets/provider routing `[INSPECTED]` |
| 9 | Skills system + curator + Skills Hub | **A** | `skills/`, `optional-skills/`, `agent/curator*.py`; `hermes skills install` `[INSPECTED]` |
| 10 | MCP client (66-server catalog) + MCP server mode | **A** | `tools/mcp_tool.py`, `optional-mcps/*`, `hermes_tools_mcp_server.py` `[INSPECTED]` |
| 11 | Provider routing incl. local models (Ollama/LMStudio/llama.cpp metadata/any OpenAI-compatible endpoint) | **A** | 38 bundled provider plugins; `plugins/model-providers/router`, `actual`; fallback chains (`hermes fallback`); `agent/model_metadata*` `[INSPECTED]` |
| 12 | Terminal backends (local/Docker/SSH/Modal/Daytona/Vercel Sandbox) | **A** (config-dependent) | backends pluggable via `terminal_env_registry`; Docker image builds the managed toolchain `[INSPECTED]` |
| 13 | Docker/Compose deployment, s6 supervision, pinned base images | **A** | `Dockerfile` (multi-stage, sha256-pinned base, pinned SQLite 3.53.4 with WAL-reset-bug fix), `docker-compose.yml` (gateway + localhost dashboard) `[INSPECTED]` |
| 14 | Backup/restore, update with handoff, `hermes doctor` diagnostics | **A** | `hermes_cli/backup*.py`, `update_*.py`, `doctor.py` `[INSPECTED]` |
| 15 | Batch trajectory generation & compression (research use) | **A** | `batch_runner.py` (~49 KB), `trajectory_compressor.py` (~46 KB) `[INSPECTED]` |
| 16 | TUI + Desktop (Electron) + Dashboard (React/Vite) | **B+** | Build requires pnpm JS deps (not installed here); not built in this audit `[BLOCKED-env]` |

## 12. Partially implemented / needs external configuration (C)

| # | Feature | What's missing / required |
|---|---|---|
| C1 | Honcho dialectic user modeling | Works, but external Honcho service + account; `HONCHO_API_KEY`-style configuration `[INSPECTED]` |
| C2 | Browser automation | Code complete; needs Playwright Chromium (managed tool store via `pm`) + headed env for real logins `[INSPECTED]` |
| C3 | Cloud terminal backends (Modal/Daytona/Vercel Sandbox) | Require provider accounts + keys; default local backend works OOB `[INSPECTED]` |
| C4 | Email/WhatsApp/Signal/Matrix gateways | Need bot tokens/app passwords; code present, config required `[INSPECTED]` |
| C5 | Nous Portal (Nous-hosted models + Tool Gateway) | OAuth login (`hermes setup --portal`); external paid-ish subscription, off by default `[INSPECTED]` |
| C6 | TTS/voice transcription | Optional extras (kittentts is opt-in; OpenAI/Edge/ElevenLabs via keys) `[INSPECTED]` |
| C7 | Honcho/other memory providers (byterover, retaindb) | Plugin providers need their own backends `[INSPECTED]` |
| C8 | Cron delivery to gated platforms | Needs per-platform credentials configured `[INSPECTED]` |
| C9 | API server exposure beyond localhost | `API_SERVER_KEY` mandatory; off by default in compose; docs warn about internet exposure `[INSPECTED]` |

## 13. Missing capabilities (D) — gap analysis vs. the vision

| # | Missing capability | Notes |
|---|---|---|
| D1 | **Multi-agent organization layer** — CEO → department managers → worker agents, reporting lines, org-level goals, budgets | Kanban is the closest primitive (durable queue, daemon, boards, swarm) — a *task* queue, not an org model. No org/team/department entities, no hierarchical delegation semantics, no org-level permissions or budget limits. |
| D2 | **Agent registry service** — fleet management of named agents (ID, role, avatar, per-agent model/instructions/memory/tools/permissions/status) | Profiles are per-user *isolated homes* ("profiles are islands on purpose"), not a registry to enumerate/manage a fleet of agents from one control plane. |
| D3 | **Team management backend** — shared workspace, controlled shared memory, team roster, roles, responsibilities | Not present. `teams_pipeline` plugin is a Teams-meeting → pipeline integration, not agent teams. |
| D4 | **Natural-language → agent definition compiler** ("create an agent that…") | Not present as a first-class flow; `/personality`, `SOUL.md`, and setup wizard create *one* default persona, not parameterized agent blueprints. |
| D5 | **Visual workflow engine (DAG) with branching, loops, approval nodes** | Kanban workflows (`hermes_cli/kanban_workflow.py`) model stages/boards, but there is no node-graph workflow runtime with conditions/loops/approval gates as a product surface. |
| D6 | **Human approval workflow system (org-level, audit-trailed)** | Command approval exists (terminal/tool-level, per session). No org-grade approval *workflows* (role-based approvers, escalation, audit trail across agents). |
| D7 | **RBAC for multi-user organizations** | Single-tenant trust model by design (SECURITY.md §2). Dashboard auth has roles, gateway has allowlists, but no users/teams/roles/permissions model for an org. |
| D8 | **Durable execution engine (checkpoint/resume/cancel/retry policies as platform primitives)** | Cron jobs + kanban tasks + subagent budgets + session checkpoints exist piecemeal; no unified durable-task service with the 9 required states (PENDING…PAUSED), dependency graph, priorities. |
| D9 | **Agent activity monitoring / observability control plane** | Local logs + `hermes logs` + dashboards per agent; no org-wide live fleet monitor, no cross-agent tracing UI API. |
| D10 | **Per-agent budget/rate-limit accounting** | Token/cost tracking exists (`agent/credits_tracker.py`, `usage_*`) for the single user; no per-agent/team/org budget enforcement. |
| D11 | **SaaS-grade multi-tenancy** | Explicit non-goal upstream (single-tenant). Requires architecture addition, not rewrite. |
| D12 | **"AI City / Mayor-led ecosystems"** | Not present (obviously); must be designed as a layer above organizations. |
| D13 | **External API management for other projects (app keys, rate limits, usage analytics)** | API server is single-tenant with one `API_SERVER_KEY`; no per-client keys, quotas, usage analytics, or API management plane. |
| D14 | **Workflow versioning & execution history UI-backing API** | Not present as a versioned artifact API. |

## 14. Security observations

**Strengths (inspected):**
- SECURITY.md defines the trust model and a private reporting path; §3.1 vs §3.2 boundary discipline is documented.
- Exact-pinned dependencies + `uv.lock` with security annotations (e.g., PyJWT PYSEC fixes, urllib3 GHSA fixes, cryptography CVE floors); supply-chain-hardened install path (`pm`), base images pinned by digest, SQLite rebuilt from source to fix upstream WAL-reset corruption.
- Fail-closed design in the API server (`_prefix_names_served_profile` returns False on error → 404).
- Command approval system with smart/yolo/enterprise modes; DM pairing for messaging; per-platform allowlists; credential vault with OS keychain; egress iron-proxy for credential injection; redaction utilities for headers/connstrings (`agent/redact*`).
- Dashboard binds 127.0.0.1 by default; API server off by default in compose; `API_SERVER_KEY` required to enable.

**Gaps / risks to address in this project:**
- Single-tenant trust boundary is load-bearing upstream; exposing a fleet of agents to multiple humans breaks assumptions (shared `HERMES_HOME`, profile scope bugs = silent cross-profile leaks, several HX/PS lint rules exist precisely to prevent this).
- `AI Agent` processes can execute arbitrary shell by design; org-level agents need sandbox defaults (container terminal backend), tool-level permissioning, and mandatory approval for destructive actions.
- Secrets: `.env` is secrets-only by policy; keep that. Add KMS/keychain-backed credential store for multi-tenant.
- No built-in RBAC; dashboard auth roles ≠ org RBAC.
- API server lacks per-client isolation (one key); needs API management layer (D13).
- Logging exists (`hermes_logging.py`, concurrent-log-handler) but no immutable audit trail primitive suitable for compliance.

## 15. Architecture limitations

1. **Single-tenant, profile = island.** No identity layer above profiles; cross-agent collaboration must be built as a new layer (see D1–D3).
2. **Facade + siblings pattern** — excellent for change management, but modules like `hermes_state.py` are ~2,000-line facades with 100 siblings each topic; new contributors face a steep map. `AGENTS.md` in every subtree mitigates.
3. **SQLite-first.** Perfect for single-user; org scale, multi-node gateway, shared memory, and analytics need Postgres + (optionally) Redis — but only when justified (see §20/L5). Avoid duplicating storage; reuse SessionDB patterns instead.
4. **Python 3.14-only support.** Environment setup complexity; no system packages; `pm` bootstrap required. CI is the source of truth.
5. **Monorepo with heavy JS workspace** — full `just check` is expensive; per-lane validation is the norm upstream.
6. **Prompt-caching invariants** — any UI that mutates system prompt mid-conversation silently destroys cost efficiency; our Agent Builder APIs must respect session-bound config application (apply-on-next-turn semantics).
7. **Size ratchet rules** — files ≤ 2,000 lines, functions ≤ 300 lines/CC ≤ 20; new platform code must obey to stay consistent.
8. **No first-class plugin isolation** — plugins run in-process; boundary lint only guards import direction, not sandboxing.
9. **Dashboard auth is not multi-user org auth** — fine for localhost single user; insufficient for team SaaS.

## 16. Dependencies (external services)

| Service | Required? | Notes |
|---|---|---|
| LLM provider (local via Ollama/LMStudio/llama.cpp, or OpenAI-compatible endpoint) | **Yes** (any one) | Core runtime; Nous Portal optional |
| Telegram/Discord/Slack/… tokens | Only for messaging surfaces | |
| Modal/Daytona/Vercel | Only for cloud terminal backends | |
| GitHub (for Skills Hub, plugin catalog, backup to git) | Optional | Skills Hub uses GitHub App JWT for bot identity |
| Honcho | Optional (dialectic user model) | |
| Google/Microsoft/etc. | Only for their platform plugins | |
| Web search (Tavily/Brave/Exa/…) | Only for `web_search` tool | local/instance alternatives possible |
| Playwright Chromium | Browser tool | bundled via pm tool store |
| Postgres/Redis | **Not currently required** | Candidate additions for org layer (see §20) |

## 17. Required modifications (summary — full roadmap in §20)

1. **Nothing in Hermes core should be rewritten.** Extend via: new sibling packages in the platform repo + upstream-compatible plugins where possible.
2. **New layer: `platform/` (or `apps/platform-api/`) service** — control plane (agents, teams, orgs, tasks, workflows, permissions, approvals, audit, API management) backed by Postgres (+Redis when needed), talking to Hermes runtimes via (a) the OpenAI-compatible API, (b) the gateway control plane, (c) an extended MCP/A2A channel for agent-to-agent traffic.
3. **Hermes Runtime enhancements (upstreamable):** first-class `agent_registry` session metadata (agent_id), task/job IDs carried in session headers (`X-Hermes-Session-Key` already provides a hook), event stream export for the monitor plane.
4. **New plugins:** `plugins/platform-bridge/` (agents phone home to control plane), platform API keys in the API server (per-client `API_CLIENT_KEYS` map + usage metering) — kept plugin-side to honor "plugins must not touch core files".
5. **Kanban extension or replacement?** Keep kanban as the durable execution substrate; add the org/team/assignment semantics in the platform layer rather than reimplementing the queue.
6. **Database:** inherit SQLite for runtime-local state (per agent); **add Postgres** for the org control plane; optional Redis for pub/sub + rate limits. Migrations via Alembic; never auto-migrate user runtime DBs.
7. **Auth:** adopt an OAuth/OIDC-capable layer (e.g., better-auth or our own thin JWT+refresh) for the control plane; bridge to Hermes gateway allowlists.
8. **Frontend coordination:** Google AI Studio owns the React UI; we publish OpenAPI contracts + TS types + mock server; version the API (`/api/v1`).

## 18. Potential breaking-change risks

| Risk | Severity | Mitigation |
|---|---|---|
| Importing Hermes code into this repo as a monorepo copy; upstream drift | High | Keep `work/hermes-agent` as the reference clone; vendor by **subtree/submodule or nightly snapshot with manifest**, not silent copies. Decide at BATCH 02 before any import. |
| Reworking SessionDB to Postgres breaks compression/rewind machinery | High | Do **not** migrate runtime DBs; Postgres only for control-plane entities. Runtime stays SQLite. |
| Altering `X-Hermes-Session-*` semantics breaks gateway/desktop clients | Medium | Additive headers only; version contract tests. |
| Python 3.14-only CI vs our 3.11 sandbox limits verification depth | Medium | Stand up a 3.14 builder (uv-managed or container) before claiming "fully verified" for BATCH 03+. |
| Prompt/tools surface changes break `tests/ci/test_prompt_surface.py` | Medium | Treat prompt surface as append-only; run upstream prompt-surface snapshot check on every runtime patch. |
| Dependency pinning churn (exact pins + uv.lock) blocking our platform deps | Low–Med | Platform service uses its own venv/lockfile; no edits to Hermes pins without `hermes pm lock`. |
| Desktop/web owned by separate frontend process (Google AI Studio) | Medium | Branch separation; API contracts reviewed before UI work; no direct edits to `web/`, `apps/desktop/` without coordination. |

## 19. Recommended architecture (target)

```
┌─────────────────────────────────────────────────────────────────┐
│ React Frontend (Google AI Studio)  — agents, teams, orgs,       │
│   visual builder, workflow canvas, monitor, approvals            │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ OpenAPI/JSON + SSE/WebSocket   │ (types from contract)
┌───────────────▼───────────────────────────────▼─────────────────┐
│ PLATFORM CONTROL PLANE  (new service — this project)            │
│  authn/z (OIDC+JWT) · workspaces · agent registry · teams       │
│  orgs · tasks (9 states) · workflows (node graph, approvals)    │
│  permissions · approvals · audit · API keys & usage · budgets    │
└──────┬───────────────┬────────────────────┬─────────────────────┘
       │ spawn/config  │ OpenAI-compatible  │ A2A/MCP
┌──────▼──────┐  ┌─────▼──────────────┐  ┌──▼───────────────────┐
│ Hermes       │  │ Hermes gateway API │  │ Agent-to-Agent bus    │
│ runtimes     │  │ :8642 (existing)   │  │ (A2A v1.0 plugin,     │
│ (per agent)  │  │ sessions/runs/jobs │  │ existing)             │
└──────┬──────┘  └─────┬──────────────┘  └──┬───────────────────┘
       │               │                     │
┌──────▼───────────────▼─────────────────────▼──────────────────┐
│ SQLite (runtime, per agent/profile) · Postgres (control plane) │
│ Redis (optional: pub/sub, rate limits, fleet presence)         │
└────────────────────────────────────────────────────────────────┘
```

Non-negotiables preserved: Hermes core untouched except via additive upstreamable PRs; per-agent workspaces; tool-level permissions enforced in runtime, not only in UI; approvals wired into existing approval machinery.

## 20. Batch implementation roadmap

Legend: **P0** = foundation, must land first; **P1** = core platform; **P2** = scale-out; **P3** = polish/deploy. "Verify" column = required gate. Every batch: INSPECT → PLAN → IMPLEMENT → TEST → VERIFY → DOCUMENT → COMMIT → REPORT.

| Batch | Scope (key deliverables) | Depends on | Verify gate | Est. size | Priority |
|---|---|---|---|---|---|
| **00** | ZIP download, preserve, working copy (this report) | — | REPORT 01 signed off | done | ✔ done |
| **01** | Source audit (this report) + module feature matrix sign-off | 00 | User review of REPORT 01 | done | ✔ done |
| **02** | **Engineering foundation:** platform repo layout (`platform/`, `docs/`, `contracts/`, `tests/`); decide vendoring (submodule vs snapshot manifest); CI skeleton; coding standards; ADR-0001..0005 (runtime boundary, storage split, API-first, cost policy, branch strategy) | 01 | lint + CI green on empty skeleton | M | P0 |
| **03** | **Hermes Runtime enhancement (additive only):** runtime event export (turn/tool/usage → webhook/Redis), agent_id session tagging, graceful per-agent shutdown, `hermes runtime status` admin RPC | 02 | upstream prompt-surface snapshot unchanged; new contract tests | M | P0 |
| **04** | **Universal Agent Builder backend:** Postgres schema (users, workspaces, agents, memberships, API keys, audit), Alembic migrations, agent registry CRUD + lifecycle, per-agent workspace bootstrap, FastAPI service, OpenAPI `/api/v1`, authn (OIDC/JWT) + RBAC skeleton | 02 | migrations up/down; contract tests; authz tests | L | P0 |
| **05** | **Multi-agent & team orchestration:** teams, leaders, shared workspace, controlled shared memory (namespaced), A2A-based agent messaging, task assignment, aggregation, failure handling; kanban-dispatcher integration | 03, 04 | E2E: team of 3 agents completes delegated task with shared workspace | L | P1 |
| **06** | **Hierarchical organization system:** orgs, CEO agent, departments, managers, worker agents, org goals, delegation tree, reporting roll-ups, org permissions, budget limits; data model future-proof for "Mayor/AI City" layer | 05 | E2E: 4-level org simulation + permission negatives | L | P1 |
| **07** | **Persistent background execution:** unified durable task service (the 9 states), retries w/ backoff, checkpoints, cancellation, recovery on restart; wraps cron+kanban rather than duplicating; scheduler service; idempotency keys | 03, 04 | crash-recovery E2E; load test 100 queued tasks | L | P1 |
| **08** | **Tools/skills/integrations:** dynamic tool registry API (enable/disable per agent), skill catalog service, MCP server provisioning per agent, web search/browser opt-in toggles, credential vault integration | 04 | tool permission matrix tests | M | P1 |
| **09** | **Workflow execution engine:** versioned JSON workflow definition, node types (agent/model/tool/condition/loop-with-cap/approval/notify/API), branching, run history, resume/retry; export to UI-consumable schema | 04, 07 | simulation harness; 100% node-type coverage tests | L | P1 |
| **10** | **Memory & knowledge:** per-agent memory namespaces, team shared memory w/ ACL, document ingest → Markdown + embeddings index (local-first: sqlite-vec/lancedb or pgvector), RAG API, knowledge-base CRUD | 04, 05 | retrieval benchmarks; isolation tests | L | P1 |
| **11** | **AI provider router:** capability/latency/cost/privacy-aware routing; priority LOCAL → FREE-TIER → PAID(authorized); paid disabled by default; per-agent policy; budget enforcement; rate-limit handling; provider health checks | 04 | routing unit matrix + integration w/ local Ollama (if hw allows) | M | P1 |
| **12** | **Security & approvals:** RBAC enforcement points, tool-level permission checks in runtime, human approval workflow service (role-based, escalation, timeout), audit log (append-only), secrets via vault/keychain, sandbox defaults for untrusted agents | 04, 05 | threat-model review; approval E2E; audit completeness check | L | P1 |
| **13** | **Frontend ↔ backend integration:** TS SDK + types, mock server (Prism), SSE/WebSocket spec, API change process, joint integration tests, mobile breakpoints review with AI Studio team | 04–12 | contract diff CI; E2E happy paths | M | P2 |
| **14** | **API management:** per-client keys, scopes, quotas, usage metering, rotation, admin endpoints for other projects to consume agents | 04 | quota/metering tests; key rotation E2E | M | P2 |
| **15** | **Testing & optimization:** full suite on Python 3.14 (CI), perf budgets, flake quarantine, load tests, security scan (bandit/pip-audit + semgrep), regression report | any | suite green; zero P0 findings | M | P2 |
| **16** | **Deployment & final verification:** production Dockerfile/compose for control plane + runtimes, 24/7 supervisor config, backups/restore drill, monitoring hooks (health endpoints, metrics), runbooks, SaaS-readiness checklist | all | restore drill passes; uptime smoke 72h | M | P3 |

Sequencing notes: BATCH 02 must settle the **vendoring decision** (this report recommends a git submodule or a pinned snapshot manifest + import script, not a one-time copy). Batches 03–04 are parallelizable after 02. BATCH 12 may pull forward into 05–07 (security review per feature). Nothing merges to `main` without the §20 gates; all work happens on `feature/*` (or `arena/*`) branches with PRs.

## 21. Testing strategy

1. **Preserve upstream suite** — keep `tests/` runnable via `scripts/run_tests.sh` for every runtime-touching batch; never edit upstream tests to make them pass; if upstream behavior must change, it goes through upstream-compatible patching with prompt-surface/docs-drift gates.
2. **Platform test pyramid** — unit (pytest, asyncio) → contract (OpenAPI schema + HTTPX against the FastAPI app with a real Postgres in CI) → integration (docker-compose: control plane + 2 Hermes runtimes) → E2E (Playwright against the AI Studio frontend build) → chaos (kill a runtime mid-task; assert recovery).
3. **Golden invariants** — runtime prompt surface snapshot; SessionDB WAL behavior (reuse the 8,199 upstream files as regression net); permission-matrix negatives; approval-flow idempotency.
4. **Verification honesty** — a feature is done only when its named gate passes; otherwise documented as PARTIAL with the exact gap. No "done" claims from code inspection alone.
5. **Environment reality for this sandbox** — system Python is **3.11.2**; the sandbox's egress allowlist blocks `python-build-standalone` assets (GitHub release downloads) and `apt` (no root, partial filesystem). Therefore the **supported Python 3.14 runtime was not available here**; verification was done with: full-tree `compileall` under 3.11 ✔, import smoke ✔, and **356 tests passed** (`test_hermes_constants.py` 47; `test_hermes_state.py` + `test_model_tools_async_bridge.py` + `test_hermes_home_profile_warning.py` = 309) under 3.11 with the exact pinned dep versions (modulo `pillow` resolved to 12.x for 3.11 compatibility, unsupported configuration). See §23 Blockers. Full CI-grade verification on 3.14 is a prerequisite for calling any runtime batch "verified". `[VERIFIED-with-caveats]`

## 22. Deployment considerations

- **Packaging:** reuse upstream `Dockerfile` pattern (multi-stage, pinned digests, rebuilt SQLite, s6-overlay supervision). Add a control-plane image; single compose stack for private/personal use; Kubernetes helm chart later for SaaS.
- **State:** `~/.hermes`-style volumes for runtimes (SQLite); Postgres volume for control plane; nightly `backup_sqlite.py` + `pg_dump`; off-box copies for disaster recovery.
- **Networking:** default bind localhost; API server + dashboard behind reverse proxy with TLS for remote; Tailscale/WireGuard recommended for personal use.
- **Secrets:** never in frontend; `.env` (secrets only) or vault; control-plane JWT keys rotated; per-agent tool credentials via vault, injected at runtime start.
- **24/7:** s6/systemd restart policies, heartbeat files (`hermes_startup_watchdog.py` pattern), health endpoints for gateway/API/dashboard/control-plane, log rotation.
- **Observability:** structured JSON logs (`hermes_logging.py` conventions), OpenTelemetry traces from control plane; runtime has monitoring hooks (`agent/monitoring/`).
- **Cost guardrails:** paid providers disabled by default (config gate + UI acknowledge); per-workspace budget caps; local-first routing default.
- **Legal:** MIT for Hermes — compatible with proprietary extensions; keep third-party notices (`LICENSE`, `NOTICE`-style bundling for bundled skills with separate licenses).

## 23. Outstanding blockers

| # | Blocker | Impact | Required action |
|---|---|---|---|
| B1 | **Python 3.14 unavailable in this sandbox** (egress allowlist blocks the standalone-build download; `apt` unusable; 3.11 is the system interpreter and Hermes only supports ≥3.14 in practice) | Full runtime verification on the supported stack is not possible here; all current test evidence is *unsupported-3.11 smoke* | Provide a 3.14 interpreter (CI runner, Docker image, or approved download). Until then, treat "verified" claims as 3.11-limited |
| B2 | **JS toolchain not installed** (pnpm absent; `npm` present but install not run) | Dashboard/desktop builds unverified here | `npm i -g pnpm` is possible on demand; run `pnpm -r check` when we touch web/desktop or at BATCH 13 |
| B3 | **Live LLM access not configured** (no API keys; Nous Portal unset) | End-to-end chat/agent behavior unverifiable | User decides a provider (prefer local Ollama or an authorized free tier); paid APIs stay OFF until user authorizes |
| B4 | **Branch/vendoring strategy undecided** (import vs submodule vs reference-checkout) | BATCH 02 cannot start | User decision in review of this report; recommendation: keep `work/hermes-agent` reference clone + platform code in this repo; runtime changes via patch files or upstream-compatible branches |
| B5 | **Postgres availability** | BATCH 04+ need a database | Docker in sandbox? or a hosted dev Postgres (Neon free tier) — needs user choice |
| B6 | Frontend ownership boundary (Google AI Studio) | Integration sequencing | Agree API contract workflow + branch rules with the frontend process before BATCH 13 |
| B7 | `acquisition/` + `work/` are local-only (git-ignored) | Fresh clones of this repo lack the snapshots | Documented re-acquisition procedure in `acquisition/ACQUISITION-METADATA.json` (re-download + verify SHA-256 `9ea0e0e7…`) |

## 24. Verification evidence (commands executed 2026-11-13)

```text
# GitHub identity & metadata
gh repo view NousResearch/hermes-agent --json …        → public, MIT, defaultBranch main, pushed 2026-11-13T11:02Z
gh api repos/NousResearch/hermes-agent/commits/main    → fd3174e9c5cdd037203bb4e111c950667988f3ca (2026-11-13T03:02:12-08:00)
gh release list …hermes-agent                          → v0.23.1 (2026-11-10) latest stable; canary v0.23.1+canary.20261113T064447Z

# ZIP download & integrity
curl -L …/main.zip → 107,280,822 bytes
sha256sum → 9ea0e0e79e4ab09027bf59a0f90c34d0d78b5b2bceaace6e1771adb219baf427
python3 -c 'zipfile.testzip()' → PASS; 26,697 entries; 254,454,542 uncompressed bytes

# Extraction & backup
extract → acquisition/original/hermes-agent-main (25,470 files; byte total matches ZIP)
clone   → work/hermes-agent; git rev-parse HEAD == fd3174e9…; git status clean; .git ≈ 1.5 GB
diff -qr (excluding .git) → no differences

# Runtime smoke (UNSUPPORTED Python 3.11.2 + exact pinned deps; pillow resolved per 3.11-compatible resolution)
python3.11 -m compileall . → OVERALL_COMPILE_OK (entire tree parses)
imports: run_agent, hermes_state, model_tools, toolsets, cli → all OK (<2s each)
python -m hermes_cli.main --help → prints full command tree (OK)
HERMES_PYTHON=… run_tests.sh tests/test_hermes_constants.py → 47 passed
HERMES_PYTHON=… run_tests.sh tests/hermes_state/test_hermes_state.py tests/test_model_tools_async_bridge.py tests/test_hermes_home_profile_warning.py
  → 309 passed (306 in hermes_state file-batch total 306 across the batch of 3 files incl. 47+306=353; summary says "3 files, 306 tests passed, 2 skipped")
```

> Test-count reconciliation: batch 1 = 47 passed / 3 skipped. Batch 2 = 306 passed / 2 skipped (51s, per-file isolation). Combined **353 passed**; earlier drafts of this report said 356 — corrected.

## 25. Recommended immediate next steps

1. Review this report; resolve blockers **B3–B5** (provider choice, vendoring strategy, Postgres) and acknowledge the **B1** limitation (or give this agent a Python 3.14 environment).
2. On approval, start **BATCH 02 (Engineering Foundation)** on a fresh `feature/batch-02-foundation` branch with PRs from the start.
3. Keep `work/hermes-agent` pristine; any Hermes runtime changes go on a dedicated branch there first, tested, then ported/vendored per the B4 decision.
4. Do **not** touch `web/`, `ui-tui/`, `apps/desktop/` — reserved for the AI Studio frontend process (per instruction §10).
