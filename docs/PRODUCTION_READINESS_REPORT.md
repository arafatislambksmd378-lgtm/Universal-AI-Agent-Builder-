# Production readiness report

Date: 2026-11-22 · Build: 0.1.0 · Phase 01 of 08

**Bottom line:** the foundation is deployed-ready and tested, but the product described in the
specification is roughly **12% built**. Shopify, AI execution, approvals, automation and the business
modules are not implemented. Nothing below is ticked unless it exists and has a passing test or was
verified by hand.

## Acceptance criteria (PART 18)

### Shopify integration
- [ ] Public app configured — *needs your Shopify Partner account*
- [ ] OAuth installation works
- [ ] Store authorisation secure (AES-GCM helper exists and is tested; flow does not)
- [ ] Products can be read
- [ ] Authorised product creation works
- [ ] Authorised product updates work
- [ ] Orders can be read
- [ ] Inventory can be read
- [ ] Webhooks verified
- [ ] Uninstallation handled

### AI system
- [x] Ten agents registered with least-privilege action sets (`agents.test.ts`)
- [x] Agent permissions enforced server-side (`permissions.test.ts`, 16 cases)
- [x] Human-approval rules defined and enforced in the policy engine
- [ ] Central CEO Agent executes
- [ ] Agent tasks recorded (schema designed, table not created)
- [ ] AI outputs validated (no model calls yet)
- [ ] Agent errors handled at runtime

### Business operations
- [ ] Mixed product categories supported (taxonomy defined, no product module)
- [ ] Research reports contain sources
- [x] Profit calculations correct (`money.test.ts` — 14 cases)
- [ ] Sales analysis uses real data
- [ ] Inventory monitoring works
- [ ] Order management works
- [ ] Marketing content generation works

### Automation
- [ ] Scheduled tasks work
- [ ] Webhook events processed
- [ ] Tasks survive restarts (design: D1 queue)
- [ ] Duplicate actions prevented (design: unique idempotency keys)
- [ ] Failed jobs retryable
- [ ] Activity monitor shows live task status (audit feed works today)

### Security
- [x] Secrets not exposed (tested: responses contain no setup token, session secret, hashes)
- [ ] Store data isolated (only one tenant exists; needs a two-store test in Phase 08)
- [x] Permissions checked server-side (`evaluatePermission` is the only gate)
- [x] Sensitive actions require approval (level 3 cannot be pre-authorised — tested)
- [x] Budget limits cannot be bypassed (clamped in code, rejected at the API — tested)
- [x] Audit logs recorded (auth, permissions, budget)
- [x] Sessions, CSRF, rate limiting, security headers, input validation (tested)

### Deployment
- [ ] Frontend deployed — *workflow ready, needs your Cloudflare secrets*
- [ ] Backend deployed — *same*
- [ ] Database configured — *migration ready, needs a D1 database*
- [ ] Shopify connection verified
- [x] Mobile interface works (mobile-first shell, bottom navigation, 44 px targets)
- [x] No laptop or VPS required for normal operation (GitHub Actions → Cloudflare)
- [x] Free-tier limits respected ($0 spend; guard rails tested)

**Score: 15 of 44 criteria met.**

## What is genuinely done

| Area | Evidence |
|---|---|
| Monorepo, typecheck, build | `npm run verify` green; Worker bundles to 250 KB |
| D1 schema + migration runner | `0001_foundation.sql`, 8 migration tests |
| Owner bootstrap + auth | 14 auth tests, manual E2E run |
| Session + CSRF + Origin + rate limits | 10 security tests, manual 403/200 checks |
| Permission engine | 16 tests including hostile inputs |
| Budget guard | 13 tests, seeded $5 ceiling, API rejects >$5 |
| Audit trail | Real records surfaced on dashboard and Activity page |
| Mobile UI | Dashboard, Agents, Activity, Roadmap, Settings, Login, Setup; 11 UI tests |
| Honest status reporting | Roadmap from code, integrations asserted by the backend |

## Blockers and manual steps

| # | Item | Owner action | Blocks |
|---|---|---|---|
| 1 | Cloudflare account + API token | Create token, add two repo secrets | Any deployment |
| 2 | D1 database | Create `aism-db`, paste the ID into `wrangler.toml` | Deployment, migrations |
| 3 | Worker secrets | `APP_ORIGIN`, `SETUP_TOKEN`, `SESSION_SECRET`, `COOKIE_SAMESITE` | Login in production |
| 4 | Shopify Partner app | Create app, copy client id/secret, set redirect URL | Phase 02 |
| 5 | Development store | Create one in Partners | Safe integration testing |
| 6 | Gemini API key | Create in AI Studio when Phase 03 starts | All AI features |
| 7 | Paid-usage decision | Explicit authorisation if free quota is insufficient | Continuous AI |
| 8 | Meta/email/ads accounts | Only if Phase 06 integrations are wanted | Marketing publishing |

Instructions: [DEPLOYMENT_GUIDE_ANDROID.md](DEPLOYMENT_GUIDE_ANDROID.md),
[OAUTH_SETUP.md](OAUTH_SETUP.md).

## Known limitations accepted for now

1. **Free AI quota may be ~20 requests/day.** Continuous autonomous operation is not realistic on the
   free tier; the design keeps AI to a few batched calls per day and does analysis deterministically.
2. **PBKDF2 at 100k iterations may approach the free Workers CPU budget** on login. Login is rare and
   the setting is configurable, but this must be measured on the deployed Worker.
3. **No 2FA, no password-reset email, no session-management UI.** Reset is an owner-run D1 query.
4. **`pages.dev` + `workers.dev` needs `SameSite=None`.** Works, but a custom domain is cleaner.
5. **No service worker.** The app is installable but not offline-capable; stale financial data would
   be worse than an honest loading state.
6. **No Queues.** Not on the free plan; D1 tasks + cron cover the need.
7. **No Shopify `read_customers`.** Support features must work from order metadata only.

## Deployment verification checklist (run after step 1–3)

- [ ] `/api/health` → `status: ok`, `migrationsApplied ≥ 1`
- [ ] Pages URL loads over HTTPS with the CSP header
- [ ] Setup completes; second attempt returns 409
- [ ] `SETUP_TOKEN` secret deleted
- [ ] Budget update persists and appears in Activity
- [ ] No secret visible in the SPA bundle (`grep` the built JS for `shpat_`, `AIza`, `SETUP_TOKEN`)
- [ ] Unauthenticated data request returns 401
- [ ] Cookie has `HttpOnly` and the configured `SameSite` value

## Recommended next phase

**Phase 02 — Shopify public app**, because every business feature depends on real store data, and it
is the only phase that requires your accounts. Concretely:

1. Deploy Phase 01 (needs steps 1–3 above).
2. Create the Partner app and development store.
3. Implement: install/callback routes, state + HMAC verification, encrypted token storage,
   `connectors/shopify.ts` GraphQL client with throttling, webhook receiver with dedupe, and
   product/order/inventory sync with resumable cursors.
4. Verify on the development store before pointing at the live store.
5. Then Phase 03 (Gemini planner + task engine + approvals), which unlocks the actual autonomy.

Each phase ends with its tests, an updated roadmap entry, and an updated version of this report.
