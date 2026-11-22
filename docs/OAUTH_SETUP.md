# Shopify OAuth setup — manual steps and request contract

> **Status: NOT IMPLEMENTED (Phase 02).** These are the exact steps and the flow the code will
> implement. Do not expect any endpoint below to exist yet.

## Part 1 — What only you can do (Shopify Partner account)

1. Sign in at <https://partners.shopify.com> and create a Partner account (free).
2. **Apps → Create app → Create app manually.** Name it something recognisable, e.g.
   `AI Store Manager`.
3. Copy **Client ID** and **Client secret** — the secret is shown once.
4. Set:
   - **App URL**: `https://<your-worker-host>/` (placeholder is fine until the Worker is deployed)
   - **Allowed redirection URL(s)**: `https://<your-worker-host>/api/shopify/callback`
5. Under **Configuration → Admin API access scopes**, select only the scopes for the phases you are
   enabling (start with `read_products`, `read_orders`, `read_inventory`).
6. Create a **development store** (Partners → Stores → Add store → Development store) and install a
   few test products. Never run integration tests against live orders.
7. Distribute the app to your own store via **Select store → Install app** (custom distribution),
   or keep it unlisted while you develop.

## Part 2 — Server secrets

```bash
# from a GitHub Codespace (browser-based terminal) or any machine with Node:
npx wrangler login
npx wrangler secret put SHOPIFY_API_KEY        # Client ID
npx wrangler secret put SHOPIFY_API_SECRET     # Client secret
npx wrangler secret put SHOPIFY_SCOPES         # read_products,read_orders,read_inventory
npx wrangler secret put APP_ORIGIN             # https://<your-pages-host>
```

No Shopify secret may ever be sent to the browser, embedded in the SPA bundle or written to logs.
The logger redacts any field whose key contains `secret`, `token`, `password`, `key`, `cookie` or
`authorization`.

## Part 3 — Required environment per environment

| Variable | dev | production |
|---|---|---|
| `SHOPIFY_API_KEY` / `_SECRET` | optional (mocked) | required |
| `SHOPIFY_SCOPES` | `read_products` | least privilege per enabled phase |
| `APP_ORIGIN` | empty (same-origin via proxy) | exact Pages/custom origin |
| `SESSION_SECRET` | random per boot | 32+ random bytes, stable (encrypts store tokens) |
| `SETUP_TOKEN` | printed by the dev server | one-time secret, delete after setup |
| `COOKIE_SAMESITE` | `lax` | `lax` on a shared domain, `none` for pages.dev↔workers.dev |

> Losing `SESSION_SECRET` makes stored Shopify tokens undecryptable. That is the intended failure
> mode: you reinstall the app instead of silently using a weak key.

## Part 4 — Request/response contract (to build)

### GET /api/shopify/install

| Query | Rule |
|---|---|
| `shop` | must match `^[a-z0-9][a-z0-9-]*\.myshopify\.com$` after lowercasing; otherwise 400 |

Creates a single-use state row and 302s to the authorise URL. Requires an authenticated owner.

### GET /api/shopify/callback

| Query | Rule |
|---|---|
| `code` | required, single use |
| `shop` | must equal the shop bound to the state |
| `state` | must exist, be unexpired (<10 min) and unused |
| `hmac` | HMAC-SHA256 of the sorted query (excluding `hmac`/`signature`) with the app secret |
| `timestamp` | reject if more than 10 minutes from now |

Responses: `302 → APP_ORIGIN/?shopify=connected` on success; `400` for a bad shop domain;
`401` for a bad HMAC; `409` for a replayed/expired state. Every outcome is audited.

### POST /api/shopify/webhooks

- Verify `X-Shopify-Hmac-Sha256` against the **raw** body.
- Insert `X-Shopify-Webhook-Id` into `shopify_webhook_events` (unique) before processing.
- Return `200` within a second; enqueue work as a D1 task.
- Unknown topic → 200 (acknowledge) but log a warning.

### POST /api/shopify/uninstall (app/uninstalled webhook)

- Mark store `uninstalled`, delete the encrypted token, cancel queued tasks, purge customer rows
  within 30 days per the GDPR schedule, audit the event.

## Part 5 — Verification checklist for Phase 02

- [ ] Install from a development store completes and redirects back
- [ ] Scope list matches the requested list exactly
- [ ] Access token is encrypted at rest (inspect the row: it must start with `v1.` and not contain
      `shpat_`)
- [ ] Tampered `hmac` → 401 and an audit row with `outcome = denied`
- [ ] Replayed `state` → 409
- [ ] Webhook with a wrong signature → 401, no processing
- [ ] Duplicate webhook id → second call is a no-op
- [ ] Uninstall removes the token and stops scheduled work
- [ ] No token, secret or password appears in any response body or log line
