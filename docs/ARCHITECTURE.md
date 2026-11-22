# Architecture

## Principles

1. **Deterministic code owns money, permissions and limits.** The AI proposes; TypeScript decides.
   `packages/core` has no I/O, so `computeUnitEconomics`, `evaluatePermission` and `evaluateBudget`
   are pure functions with exhaustive tests.
2. **Modular monolith.** One Worker, clearly separated modules, no microservices. A single
   deployment can be reasoned about and debugged from a phone.
3. **Least privilege by default.** Nothing is granted implicitly: level-2 writes are off until the
   owner enables them, and level-3 actions need a fresh approval every time.
4. **Honest surfaces.** If a data source is absent, the API returns `available: false` and `null`,
   never a zero that looks like real data. The UI renders that as an empty state.
5. **Everything auditable.** Authentication events, permission changes and budget changes write to
   `audit_logs` with actor, outcome, request id and metadata (secrets redacted).

## Workspaces

| Package | Runtime | Responsibility |
|---|---|---|
| `packages/core` | Anywhere | Domain logic + shared DTOs (`api-types.ts`) |
| `apps/api` | Cloudflare Workers | HTTP, auth, persistence, policy enforcement |
| `apps/web` | Browser | Mobile-first control room |

`@aism/core` is consumed as TypeScript source (`exports: ./src/index.ts`, plus path aliases for `tsc`
and Vite). That keeps one source of truth for DTOs: a backend change that breaks the contract fails
the frontend typecheck instead of silently producing a blank screen.

## Request lifecycle (Worker)

```
Request
  → requestContext   assign requestId, create redacting logger, time the request
  → securityHeaders  nosniff, DENY framing, no-store, HSTS in production
  → originGuard      state-changing requests must come from an allowed Origin
  → cors             credentialed CORS only for allow-listed origins
  → route handler
       → validation (Zod)            reject with 400 + field paths
       → rate limit (D1 counter)     reject with 429 + Retry-After
       → requireAuth (session)       hashed token lookup, expiry, user-disabled check
       → requireCsrf (mutations)     constant-time compare against session row
       → service                     business logic, transaction-ish writes
       → audit log
  → JSON response
```

Errors never leak internals: `AppError` carries a public code/message, unexpected throws are logged
server-side (first six stack lines) and returned as `internal_error`.

### Session design

- 32 random bytes, base64url, sent in an `HttpOnly` cookie (`SameSite=Lax`, `Secure` in production).
- Only the SHA-256 hash is stored. A database leak does not yield usable session tokens.
- 12-hour sliding expiry, refreshed at most every five minutes to avoid a write per request.
- CSRF token stored on the session row, returned by `/api/auth/me`, required via `x-csrf-token` on
  every mutation and compared in constant time. Cookies are never readable by JavaScript, and the
  CSRF token never leaves memory.
- Passwords: PBKDF2-SHA256, per-user 16-byte salt, 100k iterations (configurable within
  [100k, 300k]). Unknown accounts still pay a hash cost so response time does not reveal existence.
- Ten consecutive failures lock the account for 15 minutes; the IP is rate-limited separately.

## Local development and tests

Production code paths are identical in dev and test. The only difference is the storage driver:
`apps/api/dev/d1-sqlite.mjs` implements the subset of the D1 API used by the repositories
(`prepare`, `bind`, `first`, `all`, `run`, `batch`, `exec`) over Node's built-in SQLite. Consequences:

- Tests run the real migrations, real SQL, real constraints and the real Hono app.
- No mocking of the database layer means index/constraint mistakes are caught before deployment.
- `wrangler` is not needed to develop; it is needed only to deploy.

The dev server additionally rewrites the `Origin` header at the Vite proxy so the browser talks to
the API as a same-origin client. Cross-origin enforcement is therefore exercised by the API tests
(`test/security.test.ts`), which call the app directly with hostile `Origin` values.

## Data flow (current)

```
Shopify ── (Phase 02) ──► sync jobs ──► D1 products/orders/inventory
                                          │
dashboard ◄── /api/dashboard/summary ◄─────┘  (real rows; nulls where no source exists)
                  │
                  ├── budgetSnapshot(): budget_limits + usage_records → evaluateBudget()
                  ├── listAudit():      audit_logs
                  ├── roadmap:          packages/core/roadmap.ts
                  └── integrations:     services/integrations.service.ts (single source of truth)
```

## Scaling and multi-tenancy

- Single owner today, but every tenant-owned table will carry `store_id`; the permission and budget
  engines already accept a scope identifier so per-store ceilings are additive, not a rewrite.
- D1 reads are indexed; list endpoints paginate with a `before` cursor rather than `OFFSET`.
- Workers scale horizontally; no in-memory state is relied upon except a per-request logger.

## Deliberate non-goals for now

- No microservices, no message broker beyond Cron + D1 tasks.
- No client-side state library: two custom hooks (`useApiQuery`, `AuthProvider`) cover the needs.
- No offline service worker. The manifest makes the app installable; offline caching is a Phase 08
  decision because stale financial data on a phone is worse than an honest loading error.
