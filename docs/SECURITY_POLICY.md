# Security policy

## Implemented controls (Phase 01, verified by tests)

| Area | Control | Where |
|---|---|---|
| Passwords | PBKDF2-SHA256, 16-byte random salt, 100k iterations, per-user; constant-time compare | `lib/crypto.ts`, `hashPassword`/`verifyPassword` |
| Password policy | Minimum 12 characters, max 200; rejected with a field-level error | `lib/validation.ts` |
| Account enumeration | Unknown accounts still pay a PBKDF2 cost; identical 401 body for unknown account and wrong password (only the correlation id differs) | `services/auth.service.ts`, `test/auth.test.ts` |
| Brute force | 10 failures → 15-minute lock; login IP-limited to 10 per 15 min | `auth.service.ts`, `middleware/rate-limit.ts` |
| Sessions | 32-byte random token, only SHA-256 hash stored, 12 h sliding expiry, revocation on logout | `db/sessions.ts`, `middleware/auth.ts` |
| Cookie | `HttpOnly`, `SameSite=Lax` (configurable to `None` for cross-site hosting), `Secure` in production, `Path=/` | `middleware/auth.ts` |
| CSRF | Per-session token, constant-time compare, required on every mutation, never sent to JS as a cookie | `requireCsrf` |
| Cross-origin writes | `Origin` must be allow-listed (or exactly same-origin when no list is configured) | `middleware/security.ts` |
| CORS | Credentialed CORS only for configured origins; `Vary: Origin` | `applyCorsHeaders` |
| Rate limiting | Durable D1 fixed-window counters with atomic UPSERT; `Retry-After` returned | `lib/rate-limit.ts` |
| Headers | `nosniff`, `DENY` framing, `no-referrer`, restrictive `Permissions-Policy`, `Cross-Origin-Resource-Policy: same-site`, `Cache-Control: no-store`, HSTS in production | `middleware/security.ts` |
| CSP | Defined for the static app in `apps/web/public/_headers` | Pages `_headers` |
| Input validation | Zod schemas on every body/query; unknown fields ignored; field paths returned | `lib/validation.ts` |
| SQL injection | Every statement parameterised; SQL confined to `src/db/*` | `db/*` |
| Error handling | Typed `AppError` with public codes; unexpected errors return `internal_error` and log server-side only | `app.ts` |
| Secret logging | Logger redacts keys matching `/password|secret|token|authorization|cookie|api[_-]?key|credential/` | `lib/logger.ts` |
| Secrets storage | No secret in the SPA bundle; server secrets via `wrangler secret put`; tokens to be encrypted with AES-256-GCM | `lib/crypto.ts`, docs |
| Audit | Auth events, permission toggles and budget changes recorded with actor, outcome, IP, request id | `db/audit.ts` |
| Bootstrap | First-run owner creation requires a server-side `SETUP_TOKEN` (≥16 chars) and closes permanently after one account exists | `services/auth.service.ts` |
| Authorisation | Three-level permission engine, server-side only, fails closed | `packages/core/src/permissions.ts` |
| Budget | Hard stop at the configured ceiling; above-$5 settings rejected by the API and clamped in code | `packages/core/src/budget.ts` |
| Tenant isolation | Sessions bound to a user; future store tables keyed by `store_id`; no cross-store query path | schema + design |

### Verified by tests

`test/security.test.ts` covers: unauthenticated access to every data route (401), missing/incorrect
CSRF (403), hostile `Origin` (403), missing-`APP_ORIGIN` origin handling, CORS credential scoping,
preflight, login rate limiting, secret non-disclosure in responses, ignoring client-supplied
`x-user-id`/`x-role`, and malformed JSON (400 not 500). `test/auth.test.ts` covers forged and expired
cookies, session revocation, hashed-token storage, lockout and audit-trail contents.

## Threat model

| Threat | Mitigation | Residual risk |
|---|---|---|
| Internet stranger claims the deployment | `SETUP_TOKEN` + one-time setup | If the token leaks before setup, attacker becomes owner. Set it right before setup and delete it after. |
| Stolen session cookie | HttpOnly, hashed at rest, 12 h expiry, revocation | A still-valid stolen cookie works until expiry; no device binding yet (Phase 08 option). |
| XSS stealing a session | HttpOnly cookie, React escaping, no `dangerouslySetInnerHTML`, strict CSP | A dependency compromise could inject script; lockfiles + review required. |
| CSRF | Token + Origin checks + SameSite | `SameSite=None` deployments lose one layer; Origin+token still apply. |
| Brute force | Lockout + IP rate limit + PBKDF2 | Distributed slow attacks possible; Phase 08 adds exponential IP bans. |
| Cross-store data access | Store-scoped queries, sessions bound to user | Must be re-verified with two stores in Phase 02/08 tests. |
| Agent does something destructive | Level 2/3 gating, approval re-check before execution | A bug in a future tool could bypass its policy; tool wrappers must call `evaluatePermission`. |
| Cost runaway | Budget guard, daily cap, per-agent caps | A bug that skips the guard would be serious; guards live in shared core with tests. |
| Prompt injection via product text | Model output is data, never instructions; tools are allow-listed; PII excluded | Model could still be manipulated into proposing bad content — hence approvals. |
| Secret leakage in logs | Redaction + no secrets in error messages | Raw third-party payloads could contain PII; store hashed/minimised. |

## Known gaps and the plan

1. **PBKDF2 vs Workers CPU limit.** 100k iterations can approach the free plan's 10 ms CPU budget.
   Login is rare, but if Cloudflare returns CPU-limit errors, lower `PASSWORD_ITERATIONS` to 50k (the
   API refuses anything below 100k by default — this would be a deliberate documented change) or move
   hashing to a paid plan / external IdP. Tracked as an owner decision, not silently changed.
2. **No 2FA.** Phase 08 candidate: TOTP stored encrypted, with recovery codes.
3. **No password reset flow.** Reset is a deliberate D1 update by the owner (documented); self-service
   reset needs email infrastructure, which is not in the $5 budget yet.
4. **No device/session management UI.** Phase 08: list and revoke individual sessions.
5. **GDPR webhooks not implemented.** Required before public distribution; Phase 02.
6. **No penetration test.** Phase 08 includes a structured red-team pass (SSRF, IDOR, replay).

## Operational rules

- Never commit `.dev.vars`, `.env*`, tokens or customer data. `.gitignore` covers these.
- Rotate `SETUP_TOKEN` to empty after setup and rotate `SESSION_SECRET` if it is ever exposed
  (rotation invalidates stored Shopify tokens by design).
- Do not enable a paid provider, a paid Cloudflare feature or a third-party API without explicit
  owner approval.
- Keep Shopify scopes at the minimum required by shipped features.

## Reporting

This is a private single-owner deployment. Security issues should be fixed and deployed immediately;
every change touching auth, permissions or money must come with a test that fails before the fix.
