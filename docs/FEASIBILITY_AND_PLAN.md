# Technical Feasibility Assessment and Build Plan

This is the deliverable required by PART 20 of the specification: sections A–J, written **after**
inspecting the repository (which contained a single 30-byte README) and after implementing Phase 01.

Status labels used throughout: **Implemented** (code + tests exist), **Planned** (designed, not
built), **Blocked** (needs something outside this repository).

---

## A. Technical feasibility assessment

### Verdict

| Area | Feasible? | Notes |
|---|---|---|
| Cloudflare Workers + D1 backend | Yes | Free plan allows 100k requests/day and a small D1 database; a single-owner dashboard uses a fraction of that. |
| React + Vite frontend on Cloudflare Pages | Yes | Static hosting on the free plan; 500 builds/month. |
| Shopify public app with OAuth + GraphQL Admin | Yes | Requires a Shopify Partner account and a development store for testing. App review is needed before public listing, not for installing on your own store. |
| Ten agent modules with typed I/O | Yes | Registry + permission engine implemented now; reasoning arrives with Gemini. |
| Fully autonomous AI operation on the free tier | **Partially — the binding constraint** | Community reports in late 2025/2026 put Gemini free Flash at roughly **20 requests/day** (Flash-Lite roughly 500). Any design that fans out one AI call per product per day will exhaust that in minutes. The plan therefore uses deterministic code for scheduled analysis and batches AI to a handful of requests per day. Verify your own project's limits in AI Studio before relying on published numbers. |
| $5/month infrastructure + AI | Yes | Workers/Pages/D1 free tiers cover Phase 01–08 traffic. $5 buys a large amount of Flash-Lite tokens (see [BUDGET_AND_USAGE.md](BUDGET_AND_USAGE.md)) *if* you ever authorise paid usage. |
| Android-only development | Yes | Everything in this repo is edited in the GitHub web editor and deployed by GitHub Actions → Cloudflare. No local toolchain is required to ship. Local `npm run dev` is a convenience, not a requirement. |
| Multi-store isolation | Yes | Schema is keyed by `store_id` from the start (tables that need it arrive with Phase 02); sessions and audit rows are already tenant-scoped. |

### Hard constraints discovered

1. **Gemini free quota is small and volatile.** It shrank by roughly 90% for Flash during the
   project's lifetime. The architecture must treat AI as a scarce resource: deterministic code for
   analysis, cached results, no per-request AI, and a daily request budget separate from the dollar
   budget.
2. **Workers have a tight CPU limit on the free plan** (10 ms). PBKDF2 at 100k iterations costs tens
   of milliseconds. This affects only sign-in/setup (rare), and the iteration count is configurable,
   but it is a real risk on the free plan — documented with a fallback in
   [SECURITY_POLICY.md](SECURITY_POLICY.md).
3. **Shopify requires HTTPS redirect URLs and verified webhook endpoints.** Deployment must happen
   before OAuth can be tested; there is no local-only path.
4. **Cloudflare Queues are not on the free plan.** Automation must therefore use Cron Triggers +
   D1 task tables + webhook-driven execution, with Queues as an optional upgrade.

---

## B. Final architecture

Modular monolith, three deployables, one shared domain package:

```
Browser (phone)  ──HTTPS──►  Cloudflare Pages (React SPA)
                                  │  /api/* (same-origin proxy or CORS to Worker)
                                  ▼
                          Cloudflare Worker (Hono)
             ┌────────────┬───────────────┬──────────────┬─────────────┐
             │  Identity  │  Shopify      │  Agent       │  Commerce   │
             │  sessions  │  OAuth + sync │  orchestrator│  modules    │
             │  CSRF/RBAC │  webhooks     │  (Phase 03)  │  (Phase 04+)│
             └────────────┴───────────────┴──────────────┴─────────────┘
                                  │  typed repositories
                                  ▼
                            Cloudflare D1 (SQLite)
                                  ▲
        Cron Triggers ────────────┘   (Phase 07 scheduled work)
        Shopify webhooks ─────────────┘
```

Deterministic logic (money, permissions, budget, validation, limits) lives in `packages/core` and is
shared by the Worker and the browser. It is pure TypeScript with no I/O, which is why it carries the
heaviest unit-test coverage and why the AI can never be the authority on a financial figure.

---

## C. Project directory structure

Implemented exactly as shown in [README.md](../README.md#repository-layout). Two rules keep it
maintainable:

- `apps/api/src/services/*` holds application logic; routes only parse, authorise and serialise.
- `apps/api/src/db/*` holds every SQL statement. No route contains raw SQL, which makes parameter
  binding auditable in one place.

---

## D. Database schema plan

Applied now (migration `0001_foundation.sql`):

| Table | Purpose |
|---|---|
| `users` | Owner/operator accounts, PBKDF2 material, lockout state |
| `sessions` | Hashed session tokens, CSRF secrets, expiry, revocation |
| `system_settings` | JSON key/value configuration (permission grants, thresholds) |
| `budget_limits` | Seeded $5.00 monthly / $0.50 daily AI ceilings, hard-stop flag |
| `usage_records` | Per-request AI metering (empty until Phase 03; dashboard sums it for real) |
| `audit_logs` | Append-only actor/action/outcome records |
| `rate_limit_buckets` | Durable fixed-window counters |
| `notifications` | Owner alerts, deduplicated by `dedupe_key` |

Planned, in phase order (full column list in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)):
`store_installations`, `connected_stores`, `shopify_webhook_events`, `products`, `product_variants`,
`collections`, `orders`, `order_line_items`, `inventory_levels`, `customers` (minimised),
`product_research`, `suppliers`, `agent_tasks`, `task_execution_logs`, `approval_requests`,
`marketing_campaigns`, `workflows`, `scheduled_tasks`, `analytics_snapshots`.

Design rules: ISO-8601 UTC timestamps as TEXT, integer minor units for money, `store_id` on every
tenant row with a composite index, foreign keys with explicit `ON DELETE` behaviour, and no customer
PII beyond what a support reply needs.

---

## E. Shopify OAuth and API implementation plan

Detailed in [SHOPIFY_INTEGRATION.md](SHOPIFY_INTEGRATION.md) and [OAUTH_SETUP.md](OAUTH_SETUP.md).
Summary:

1. Partner app (custom distribution while it is only for your store).
2. `/api/shopify/install?shop=…` → validate shop domain against `*.myshopify.com`, create a signed
   `state` (HMAC + 10-minute expiry + single use in D1), redirect to the authorise URL.
3. `/api/shopify/callback` → verify HMAC of the query, verify state, exchange code for an offline
   access token, encrypt it with AES-GCM (`encryptSecret`, already written and tested), store the
   shop record, register webhooks, then redirect to the app.
4. Every admin request carries `X-Shopify-Access-Token`; retries honour `Retry-After` and GraphQL
   cost-based throttling; API version pinned in `src/version.ts`.
5. Webhooks verified with the raw-body HMAC-SHA256 signature, deduplicated by `X-Shopify-Webhook-Id`
   in `shopify_webhook_events`, processed idempotently.
6. Uninstall (`app/uninstalled`) and the three mandatory GDPR webhooks purge tokens and customer data.

Nothing here is claimed as working yet: the endpoints do not exist, and the dashboard says so.

---

## F. AI agent execution architecture

Implemented: the ten agents, their least-privilege action sets, the 22-action registry and the
three-tier permission engine, all unit tested (including hostile-grant and expired-approval cases).

Planned execution loop (Phase 03):

```
owner_instruction → CEO planner (1 Gemini call, strict JSON schema)
   → task rows in D1 (one per delegated step, with agent, action, payload, idempotency key)
   → worker executes steps deterministically where possible
   → for steps needing judgement: 1 batched Gemini call per agent per run
   → validation (Zod) → permission check (server-side) → approval request if level 3
   → execution via typed tool with audit log
```

Guard rails already enforced by code: unknown action = deny, agent outside the allow-list = deny,
level 2 without an owner grant = deny, level 3 without a matching unexpired approval = require
approval, approval for a different action = deny, malformed timestamps = deny.

---

## G. Cloudflare deployment plan

| Component | Target | Cost |
|---|---|---|
| Web | Cloudflare Pages project `aism-web`, built in GitHub Actions | $0 |
| API | Worker `aism-api`, `workers.dev` subdomain, later custom domain | $0 |
| Database | D1 `aism-db`, migrations from `apps/api/migrations` | $0 |
| Automation | Cron Triggers (Phase 07) | $0 |
| CI/CD | GitHub Actions with `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets | $0 |

Same-origin is preferred: attach `app.yourdomain.com` (Pages) and `api.yourdomain.com` (Worker) so
the session cookie keeps `SameSite=Lax`. If you stay on `pages.dev` + `workers.dev`, set
`APP_ORIGIN` and `COOKIE_SAMESITE=none` (documented trade-off).

---

## H. Monthly $5 budget feasibility

| Item | Monthly cost |
|---|---|
| Workers free plan (100k req/day, 10 ms CPU) | $0 |
| Pages free plan (500 builds, unlimited static requests) | $0 |
| D1 free plan (5 GB storage, 5M rows read/day) | $0 |
| GitHub free plan (Actions minutes for a private repo: 2,000/month) | $0 |
| Gemini free tier (if quotas suffice) | $0 |
| **Current total** | **$0.00** |

If free quotas are exhausted, the system pauses AI work and notifies you; it never silently bills
you. If you later authorise paid Gemini usage, the guard clamps spend at $5.00/month: at published
Flash-Lite prices ($0.10/M input, $0.40/M output) that is roughly 12.5M input + 12.5M output tokens
of headroom. Exact prices change — the code stores the price constants in one place.

Not covered by the $5: Shopify subscription, domains, ad spend, product/supplier costs.

---

## I. Android-only development workflow

1. Edit code in the GitHub web editor (or ask an AI assistant to open a PR).
2. Push to a branch → `.github/workflows/ci.yml` runs typecheck + 126 tests + both builds.
3. Merge to `main` (or dispatch the workflow) → `deploy.yml` applies D1 migrations, deploys the
   Worker and the Pages site.
4. Verify from the phone browser: `/api/health`, the dashboard, and a settings change.
5. Secrets are set once via `wrangler secret put` from a GitHub Codespace, or pasted into
   Cloudflare's dashboard. Step-by-step instructions with screenshots-in-words live in
   [DEPLOYMENT_GUIDE_ANDROID.md](DEPLOYMENT_GUIDE_ANDROID.md).

No Termux, Docker, Android Studio or local Node is required to deploy.

---

## J. Phase-by-phase checklist

| Phase | Deliverable | State |
|---|---|---|
| 01 Foundation | Workspace, Worker API, D1, auth, permissions, budget guard, responsive shell, tests | **Complete** |
| 02 Shopify public app | OAuth, encrypted tokens, GraphQL client, webhooks, product/order/inventory sync | Planned — needs Partner app + deployed URL |
| 03 AI orchestrator | CEO planner, task table, Gemini client, structured outputs, tool executor, approvals | Planned — needs Gemini key |
| 04 Product management | Research, classification, pricing agent, supplier data, product write flows | Planned (depends on 02, 03) |
| 05 Business management | Sales analytics, orders, inventory, support drafts, risk reports | Planned (depends on 02, 03) |
| 06 Marketing | SEO/social/email/paid drafting with approval gates | Planned |
| 07 Automation | Cron, webhook processing, retries, activity monitor, approval centre | Planned |
| 08 Security & production | Audit, isolation tests, performance, deployment verification | Planned |

Acceptance criteria are tracked with unticked boxes in
[PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md); nothing is ticked without a test.
