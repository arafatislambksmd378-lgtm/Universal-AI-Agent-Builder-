# Shopify integration — design and status

> **Status: NOT IMPLEMENTED.** Phase 02. Nothing in this document runs today: there is no OAuth
> endpoint, no token storage and no GraphQL client in the repository. The dashboard reports
> `shopify: not_implemented`. This file is the implementation contract that Phase 02 must satisfy.

## 1. App configuration

| Setting | Value |
|---|---|
| App type | Public app (custom distribution initially, public listing later) |
| Embedded | No — owner runs this system on its own dashboard, not inside the Shopify admin |
| App URL | `https://<api-host>/` |
| Redirect URL | `https://<api-host>/api/shopify/callback` |
| API version | `2025-01`, pinned once in `apps/api/src/version.ts` |
| Auth | OAuth 2.0 (authorization code) → offline access token per store |

> Shopify periodically retires API versions. Before Phase 02 ships, confirm the current stable
> version at <https://shopify.dev/docs/api/usage/versioning> and change the single constant plus any
> version-specific queries.

## 2. Scopes

Least privilege, requested only when the matching feature exists:

| Scope | Needed for | Phase |
|---|---|---|
| `read_products` | Catalogue display, pricing analysis, inventory context | 02 |
| `write_products` | Draft creation, description/tag updates, publishing (approved) | 04 |
| `read_orders` | Sales analytics, order monitoring, refund review | 02 |
| `read_inventory` | Low-stock detection | 02 |
| `read_discounts` | Discount analysis | 05 |
| `read_fulfillments` | Delivery status for support drafts | 05 |
| `write_orders` | Cancellations/refunds **after approval** | 05 |
| `write_inventory` | Rule-based adjustments **after opt-in** | 05 |
| `write_discounts` | Discount changes **after approval** | 06 |

Not requested at all: `read_customers` / `write_customers` (we use order-level shipping country
only), `write_fulfillments`, `write_settings`, `read_all_orders` (requires approval from Shopify and
is not needed), any `write_*` scope before its feature exists.

## 3. OAuth flow (to implement)

```
GET /api/shopify/install?shop=<store>.myshopify.com
  1. validate shop matches /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/  (case-insensitive)
  2. state = random 32 bytes; store {state_hash, shop, expires_at = +10 min, used = 0}
  3. 302 → https://{shop}/admin/oauth/authorize
        ?client_id=…&scope=…&redirect_uri=…&state=…

GET /api/shopify/callback?code=…&shop=…&state=…&hmac=…&timestamp=…
  1. verify hmac: HMAC-SHA256(secret, sorted query without hmac/signature)  → 401 if invalid
  2. verify state: exists, unused, unexpired → mark used (single use in D1)
  3. POST https://{shop}/admin/oauth/access_token {client_id, client_secret, code}
  4. encrypt token: encryptSecret(token, SESSION_SECRET)  (AES-256-GCM, already implemented)
  5. upsert connected_stores + store_installations, audit 'shopify.install'
  6. register webhooks (below), then 302 → APP_ORIGIN/?connected=1
```

Considerations:
- `state` is stored hashed and consumed transactionally so a replay cannot install twice.
- The callback must not require an owner session (Shopify calls it directly); after success the
  owner is redirected to the app and signs in normally. Cross-tenant hijack is prevented by the
  single-use state bound to a shop domain and by an owner-confirmation screen before the store is
  marked active.
- Token rotation: on `SCOPES_UPDATE`/reauth, replace the ciphertext and bump `token_issued_at`.

## 4. GraphQL Admin client (to implement)

- Single `shopifyFetch(store, {query, variables})` helper: POST
  `https://{shop}/admin/api/2025-01/graphql.json` with `X-Shopify-Access-Token`.
- Parse `errors` and the `extensions.cost` object; on `THROTTLED`, wait per
  `extensions.cost.throttleStatus` and retry with exponential backoff (max 4 attempts, jitter).
- Handle `401` (token revoked → mark store `revoked`, notify owner) and `402`/`403` (plan/scope
  issues) distinctly.
- Pagination via cursor (`pageInfo.hasNextPage`, `endCursor`), never by page number.
- Reads use bulk `nodes(ids:)` where available to reduce request count.
- All queries are typed with generated types (`shopify-api-types`) or hand-written interfaces kept
  next to the query; no `any`.

Example shape (products sync):

```graphql
query Products($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title status productType vendor tags
      descriptionHtml
      seo { title description }
      variants(first: 50) {
        nodes { id sku price compareAtPrice inventoryItem { id unitCost { amount } } }
      }
    }
  }
}
```

`unitCost` requires `read_inventory` plus the `InventoryItem` cost field permission; if unavailable,
the pricing agent marks cost as missing rather than assuming zero.

## 5. Webhooks (to implement)

| Topic | Purpose |
|---|---|
| `products/create`, `products/update`, `products/delete` | Catalogue sync |
| `orders/create`, `orders/updated`, `orders/cancelled` | Order sync |
| `refunds/create` | Refund analysis |
| `inventory_levels/update` | Stock monitoring |
| `app/uninstalled` | Token purge + stop all jobs |
| `customers/data_request`, `customers/redact`, `shop/redact` | Mandatory GDPR webhooks |

Verification: `X-Shopify-Hmac-Sha256` = base64(HMAC-SHA256(rawBody, appSecret)); compare in constant
time against the raw body **before** JSON parsing. Deduplicate on `X-Shopify-Webhook-Id` (unique
column). Respond 200 fast; do heavy work in a D1 task row processed by cron.

## 6. Sync strategy

1. Full backfill on install: products → variants → collections → inventory → last 90 days of orders.
   Batches of 50, checkpointed in `store_installations.sync_cursor` so an interrupted run resumes.
2. Incremental: webhooks for changes, plus a daily reconciliation cron that compares
   `updated_at >= last_sync` counts against Shopify totals to catch missed deliveries.
3. Idempotent upserts keyed on `shopify_gid`; deletions are soft (`deleted_at`) so historical
   analytics remain valid.
4. Analytics are computed from stored rows, with `analytics_snapshots` written per period so
   reporting never re-scans the whole order table.

## 7. Rate limits and reliability

- GraphQL uses a calculated cost bucket; the client tracks `currentlyAvailable` and defers when low.
- REST is avoided except for the OAuth token exchange.
- Every Shopify call is wrapped with a timeout (AbortSignal) and logged to `task_execution_logs`
  with store, topic and cost.
- Partial failures never mark a store disconnected; they create a retryable task.

## 8. Test strategy for Phase 02

- Unit: state signing/expiry/replay, HMAC verification (valid/tampered/missing), shop-domain
  validation, ciphertext round-trip, GraphQL error mapping.
- Integration: mocked Shopify responses (recorded fixtures) for sync and throttling.
- Manual: install on a development store, verify scopes granted, trigger product/order webhooks from
  the Partner dashboard, uninstall and confirm token purge.
- No destructive tests against production orders, ever.
