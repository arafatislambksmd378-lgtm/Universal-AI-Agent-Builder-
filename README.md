# AI Autonomous Shopify Store Manager

A cloud-hosted control room that runs specialised AI agents against a Shopify store, with
deterministic money maths, a three-tier permission model and a hard $5/month AI ceiling.

**Current state: Phase 01 (Foundation) complete and verified.** Shopify OAuth, Gemini reasoning and
autonomous automation are **not implemented yet** — the application says so on every screen rather
than pretending otherwise. See [docs/PRODUCTION_READINESS_REPORT.md](docs/PRODUCTION_READINESS_REPORT.md)
for the honest checklist.

| | |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind, mobile-first, installable manifest |
| Backend | Cloudflare Workers + Hono + TypeScript |
| Database | Cloudflare D1 (SQLite) with versioned SQL migrations |
| Local runtime | Node 22 + built-in SQLite via a D1-compatible adapter (no Docker, no laptop) |
| Auth | First-run owner bootstrap, PBKDF2-SHA256, server-side sessions, CSRF tokens |
| AI | Gemini planned (Phase 03); provider abstraction + budget guard already enforced |
| Tests | 126 passing (50 core, 65 API, 11 UI) · typecheck + production bundles verified |
| Budget | Hard $5.00/month ceiling seeded in the database, clamped in code |

## Try it locally (what the sandbox preview runs)

```bash
npm install
npm run dev:api        # Hono API on :8787 with a local SQLite D1 adapter
npm run dev            # Vite dev server on :5173, proxies /api to the API
```

Open the app, choose **Create the owner account**, and use the setup token printed by
`npm run dev:api`. The token exists so that a public deployment cannot be claimed by a stranger.

## Verify

```bash
npm run verify         # typecheck all workspaces, run all tests, build Worker + SPA
```

Individual commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run db:migrate:local`.

## Repository layout

```
apps/
  api/                 Cloudflare Worker (Hono)
    migrations/        D1 SQL migrations (0001_foundation.sql)
    src/
      routes/          HTTP endpoints
      services/        Application logic (auth, budget, dashboard, settings)
      db/              Typed D1 access (users, sessions, audit, settings)
      middleware/      Request context, auth, CSRF, rate limiting, security headers
      lib/             Crypto, errors, validation, logging
    dev/               Node dev server + SQLite D1 adapter (dev/test only)
    test/              65 API tests
  web/                 React control room
    src/pages/         Dashboard, Agents, Activity, Roadmap, Settings, Login, Setup
    src/components/    Shell, navigation, accessible UI primitives
    test/              11 UI tests
packages/
  core/                Shared domain logic + API DTOs
    src/money.ts       Deterministic unit economics (integer cents, basis points)
    src/permissions.ts 22-action registry, 3-level policy engine
    src/budget.ts      Hard-stop budget evaluation
    src/agents.ts      The ten agent definitions
    src/roadmap.ts     Machine-readable build status
docs/                  Architecture, Shopify, OAuth, AI, automation, security, budget, deploy, tests
```

## Documentation

| Document | Contents |
|---|---|
| [FEASIBILITY_AND_PLAN.md](docs/FEASIBILITY_AND_PLAN.md) | A–J assessment: feasibility, architecture, schema plan, OAuth plan, agent execution, deployment, $5 budget, Android workflow, phase checklist |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module boundaries, request lifecycle, data flow, design decisions |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Applied and planned tables, indexes, retention, tenancy |
| [SHOPIFY_INTEGRATION.md](docs/SHOPIFY_INTEGRATION.md) | GraphQL strategy, scopes, webhooks, sync, rate limits (Phase 02 plan) |
| [OAUTH_SETUP.md](docs/OAUTH_SETUP.md) | Exact OAuth install/callback design and the manual Partner steps |
| [AI_AGENT_SYSTEM.md](docs/AI_AGENT_SYSTEM.md) | Agent registry, permission engine, task lifecycle, Gemini integration plan |
| [AUTOMATION_WORKFLOWS.md](docs/AUTOMATION_WORKFLOWS.md) | Cron/queue design, idempotency, retries (Phase 07 plan) |
| [SECURITY_POLICY.md](docs/SECURITY_POLICY.md) | Implemented controls, threat model, known gaps |
| [BUDGET_AND_USAGE.md](docs/BUDGET_AND_USAGE.md) | Gemini free-tier reality, cost model, enforcement, what happens at the limit |
| [DEPLOYMENT_GUIDE_ANDROID.md](docs/DEPLOYMENT_GUIDE_ANDROID.md) | Phone-only deployment with Cloudflare + GitHub Actions |
| [TESTING_REPORT.md](docs/TESTING_REPORT.md) | Actual test runs, coverage by area, gaps |
| [PRODUCTION_READINESS_REPORT.md](docs/PRODUCTION_READINESS_REPORT.md) | Acceptance criteria, blockers, manual steps |

## What is deliberately *not* here yet

- No Shopify OAuth, token storage or GraphQL client — no store data is read or written.
- No Gemini calls — so AI spend is genuinely $0.00, not a mocked number.
- No automation, queues or approval centre — no agent can act on your store.
- No fabricated sales, products, suppliers or analytics. Empty states say "not available yet".

Phase 02 (Shopify) is next. It requires your Shopify Partner app credentials and a Cloudflare
account; both are documented as manual steps in [DEPLOYMENT_GUIDE_ANDROID.md](docs/DEPLOYMENT_GUIDE_ANDROID.md).
