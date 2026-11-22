# Testing report — Phase 01

Run date: 2026-11-22 · Node 22.22.3 · Linux sandbox · Command: `npm run verify`

```
packages/core  4 files   50 tests   passed
apps/api       7 files   65 tests   passed
apps/web       3 files   11 tests   passed
------------------------------------------------
total         14 files  126 tests   passed
```

Also verified in the same run:

- `tsc --noEmit` clean in all three workspaces
- Worker bundles with esbuild → `apps/api/dist/index.js` (~250 KB, no Node-only imports)
- SPA builds with Vite → 214 KB JS (67 KB gzip), 19 KB CSS (4.5 KB gzip)
- End-to-end manual run against the local stack (see §4)

## 1. Unit tests — deterministic domain logic (`packages/core`)

| File | Tests | Covers |
|---|---|---|
| `money.test.ts` | 14 | gross vs contribution profit, fee rounding (2.9% + flat), break-even price, negative margin, missing-input reporting, float/negative/NaN rejection, 100% fee edge case, margin bands, USD formatting, AI cost estimation |
| `permissions.test.ts` | 16 | action registry completeness, level-3 always approval-gated, immutability of policy objects, level-1 allowed, unknown action/agent denied, agent outside allow-list denied, level-2 requires grant, hostile grant cannot authorise level 3, prototype property does not pass as a grant, approval matching/unexpired, scope mismatch, rejected/pending/expired, malformed timestamps fail closed |
| `budget.test.ts` | 13 | normal/warn/hard-stop/throttled paths, request overflow, free-quota exhaustion with no paid fallback, ceiling clamp above $5, owner-lowered ceiling, NaN/negative/float/infinity rejection, invalid policy fails closed, $0 ceiling, non-negative remainders |
| `agents.test.ts` | 7 | exactly ten agents, unique ids/numbers, actions exist in the registry, every agent has a mission/dependency, no unimplemented dependency marked available, roadmap cannot claim a complete phase with no deliverables |

## 2. Integration tests — real HTTP + real SQL (`apps/api`)

The API tests run the actual Hono app against the actual migration SQL via a D1-compatible SQLite
adapter, so constraints, indexes, UPSERTs and `RETURNING` are all exercised.

| File | Tests | Covers |
|---|---|---|
| `migrations.test.ts` | 8 | all nine tables created, $5/$0.50 seed values, migration version recorded, case-insensitive unique email, CHECK constraints, session cascade delete, negative-usage rejection, no premature order/product/customer tables |
| `auth.test.ts` | 14 | setup token required, 503 when unconfigured, weak password/invalid email rejected, hardened cookie attributes, one-time setup (409), `/auth/state`, token stored only as hash, correct login, indistinguishable errors, lockout after ten failures (correct password still blocked), CSRF token exposure to authenticated client only, logout revocation, forged/expired cookie rejection, audit trail completeness and password absence |
| `security.test.ts` | 10 | every data route 401 without a session, CSRF required/incorrect/correct, hostile Origin 403, no-`APP_ORIGIN` behaviour, CORS credential scoping, preflight response, IP login rate limiting, no secrets in responses, client-supplied identity ignored, malformed JSON → 400 |
| `crypto.test.ts` | 13 | base64url round-trip, token unpredictability, SHA-256 known vector, HMAC stability, constant-time compare, PBKDF2 verify/reject, unique salts, weakened iteration refusal, unknown algorithm rejection, AES-GCM round-trip, random IV, wrong-key/tamper failure, short-key refusal |
| `settings.test.ts` | 10 | dashboard honest empty states, session activity present, settings surface, budget persistence + audit, cannot exceed $5 (501/100000/-1), level-2 grant allowed, level-3 and level-1 rejected, unknown action rejected, grant count reflects state, revoke works, agent registry (10 agents, approval flags), roadmap truth, activity pagination and limit validation |
| `health.test.ts` | 6 | healthy DB + migration count, feature flags all false, hardening headers + request id, graceful degradation with a broken DB (503, no internal error text), JSON 404, endpoint index |
| `rate-limit.test.ts` | 4 | limit enforcement, window reset, per-key isolation, client IP parsing |

## 3. Frontend tests (`apps/web`, jsdom)

| File | Tests | Covers |
|---|---|---|
| `api.test.ts` | 6 | JSON parsing, CSRF only on mutations + `same-origin` credentials, backend error surfacing, 401 listener firing/unsubscribing, network failure mapping, non-JSON error body |
| `login.test.tsx` | 3 | sign-in posts credentials and stores nothing in localStorage/sessionStorage, backend error rendered in an `alert` role, setup link only when the backend allows it |
| `dashboard.test.tsx` | 2 | honest empty states (`No store linked`, `—` for approvals, `$0.00`, 10 registered/0 executable), integration statuses, audit entry rendering, retry affordance on API failure |

## 4. Manual end-to-end run (local stack)

Executed against `npm run dev:api` (Worker code on the Node adapter) behind the Vite proxy, using a
browser-equivalent `Origin` header:

| Step | Result |
|---|---|
| `GET /api/health` through the proxy | 200, `migrationsApplied: 1`, database latency 1 ms |
| `GET /api/auth/state` | `setupAvailable: true` |
| `POST /api/auth/setup` | 201, `Set-Cookie: …; HttpOnly; SameSite=Lax`, session + CSRF returned |
| `GET /api/auth/me` with cookie | 200, same session |
| `GET /api/dashboard/summary` | 200, all `available: false` with explanatory notes |
| `PUT /api/settings/budget` without CSRF | **403** |
| `PUT /api/settings/budget` with CSRF | 200, values persisted |
| `GET /api/activity` | New `settings.budget.update` audit row visible |
| SQLite file reset, API restart | Clean first-run state, migration re-applied |

One observation: the Vite dev proxy rewrites `Origin` to the API origin so the browser behaves like a
same-origin client. Cross-origin enforcement is therefore verified by `security.test.ts` directly
against the app, not through the proxy.

## 5. Not tested (and why)

| Area | Status |
|---|---|
| Shopify OAuth, GraphQL, webhooks | Feature does not exist yet (Phase 02) |
| Gemini calls, JSON-schema validation, prompt injection | Phase 03 |
| Approvals end-to-end | Phase 03 |
| Cron/queue execution, duplicate task claims | Phase 07 |
| Two-store isolation | Needs Shopify connections (Phase 02/08) |
| Browser E2E (Playwright) | Not installed in this environment; UI covered by jsdom component tests |
| CPU time on the real Workers free plan | Requires a deployed Worker; measure after deploy |
| Accessibility audit with a screen reader | Manual pass recommended; markup uses landmarks, labels, `role="switch"`, `aria-live` alerts |

## 6. Reproducing

```bash
npm install
npm run verify            # typecheck + 126 tests + both builds
npm run test --workspace @aism/api     # API only
npm run dev:api & npm run dev          # manual run
```

CI runs `npm run verify` on every push and pull request (`.github/workflows/ci.yml`).
