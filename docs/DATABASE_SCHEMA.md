# Database schema

Engine: Cloudflare D1 (SQLite). Migrations live in `apps/api/migrations` and are applied with
`wrangler d1 migrations apply` (remote) or `npm run db:migrate:local` (local file). Every migration
is transactional and records itself in `schema_migrations`.

## Conventions

- Money: `INTEGER` minor units (`*_cents`). Never `REAL`, never formatted strings.
- Percentages: basis points (`*_bps`, 1% = 100).
- Timestamps: `TEXT` ISO-8601 UTC (`2026-01-10T12:00:00.000Z`), so lexicographic ordering equals
  chronological ordering.
- IDs: `TEXT` with a type prefix (`usr_`, `ses_`, `aud_`, `apr_`), generated server-side.
- Tenant scoping: `store_id` on every row that belongs to a store; indexed with time for listings.
- Booleans: `INTEGER` with `CHECK (x IN (0,1))`.
- Enums: `CHECK` constraints, so bad values fail at the database, not just in the app.
- Secrets: never stored in plaintext. Shopify tokens will be AES-GCM ciphertext; passwords are
  PBKDF2 hashes; session tokens are SHA-256 hashes.

## Applied — migration 0001_foundation

### users

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `usr_…` |
| `email` | TEXT | unique via `idx_users_email` on `lower(email)` |
| `name` | TEXT NULL | optional |
| `role` | TEXT | `owner` / `operator` / `viewer` |
| `password_hash`, `password_salt` | TEXT | base64url PBKDF2 output and salt |
| `password_iterations`, `password_algo` | INTEGER / TEXT | algorithm agility (rehash on login later) |
| `failed_login_count`, `locked_until` | INTEGER / TEXT | brute-force lockout |
| `last_login_at`, `created_at`, `updated_at`, `disabled_at` | TEXT | lifecycle |

### sessions

`token_hash` (unique), `csrf_token`, `expires_at`, `revoked_at`, `last_seen_at`, `ip`, `user_agent`,
FK to `users` with `ON DELETE CASCADE`. Indexed on `user_id` and `expires_at`.

### budget_limits

Seeded rows: monthly AI $5.00 (500 cents) and daily AI $0.50 (50 cents), both `hard_stop = 1`.
`scope_id` uses the sentinel `'global'` rather than `NULL` so `UNIQUE (scope_id, period, category)`
actually deduplicates (SQLite treats NULLs as distinct).

### usage_records

Per-request AI metering: provider, model, agent, task, request count, input/output tokens, cost in
cents, `occurred_at`. Indexed by time and by agent+time. Empty today — the dashboard's "$0.00" is a
real `SUM()` over this table, not a placeholder.

### audit_logs

`actor_type` (owner/system/agent/webhook), actor id, store id, action, target, outcome, JSON
metadata, IP, request id. Indexed by `created_at DESC`, `action` and `(store_id, created_at DESC)`.

### rate_limit_buckets

`bucket_key` PK, `window_start`, `count`, `expires_at`. Updated with a single atomic UPSERT
(`RETURNING count`), so concurrent requests cannot both read a stale counter.

### notifications

Severity, title, body, source, `dedupe_key` (unique, prevents duplicate alerts), `read_at`.

### system_settings

`(scope, key)` PK with JSON value. Holds `permissions.grants`, `budget.warning_threshold_pct`
and `app.installed_at`.

## Planned tables (by phase)

### Phase 02 — Shopify

```sql
store_installations(id, shop_domain UNIQUE, status, scopes, installed_at, uninstalled_at)
connected_stores(id, owner_user_id FK, shop_domain UNIQUE, access_token_ciphertext,
                 token_issued_at, scopes, currency, timezone, primary_domain,
                 status CHECK IN ('connected','uninstalled','revoked','pending'), created_at, updated_at)
shopify_webhook_events(id PK, shop_domain, topic, webhook_id UNIQUE, payload_hash,
                       received_at, processed_at, attempts, last_error, status)
products(store_id, shopify_gid UNIQUE, handle, title, product_type, status, vendor,
         tags, description_html, seo_title, seo_description, product_kind, synced_at)
product_variants(store_id, product_id FK, shopify_gid UNIQUE, sku, price_cents,
                 compare_at_price_cents, cost_cents, inventory_item_gid, barcode)
collections(store_id, shopify_gid, title, handle, kind)
orders(store_id, shopify_gid, order_number, created_at_shopify, currency,
       subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
       financial_status, fulfillment_status, country_code, cancelled_at, refunded_cents)
order_line_items(store_id, order_id FK, variant_gid, title, quantity, unit_price_cents)
inventory_levels(store_id, inventory_item_gid, location_gid, available, updated_at)
customers(store_id, shopify_gid, email_hash, country_code, orders_count, last_order_at)
  -- email stored hashed unless a support flow needs the address; no addresses/phones by default
```

### Phase 03 — Agents and approvals

```sql
agent_registry(id PK, name, version, enabled, config_json)
agent_settings(store_id, agent_id, enabled, model, max_requests_per_day, config_json)
agent_permissions(store_id, agent_id, action_id, enabled_by_owner, granted_at, granted_by)
agent_tasks(id, store_id, parent_task_id, agent_id, action_id, status CHECK IN
            ('queued','running','awaiting_approval','succeeded','failed','cancelled'),
            input_json, output_json, idempotency_key UNIQUE, attempts, max_attempts,
            cost_cents, created_at, started_at, finished_at, error_code, error_message)
task_execution_logs(id, task_id FK, at, level, message, data_json)
approval_requests(id, store_id, task_id, agent_id, action_id, target_type, target_id,
                  reason, expected_impact, risk_level, proposed_changes_json,
                  status CHECK IN ('pending','approved','rejected','expired','executed'),
                  requested_at, decided_at, decided_by, expires_at, executed_at,
                  execution_result_json)
```

### Phase 04–06 — Commerce and marketing

```sql
product_research(id, store_id, requested_by, status, product_name, category, target_country,
                 sources_json, supplier_cost_cents, shipping_cost_cents, suggested_price_cents,
                 gross_profit_cents, gross_margin_bps, competition_notes, demand_evidence,
                 risk_notes, confidence CHECK IN ('low','medium','high'),
                 classification CHECK IN ('high_potential','medium_potential','low_potential',
                                          'insufficient_evidence'),
                 researched_at, created_at)
suppliers(id, store_id, name, platform, lead_time_days, reliability_notes, api_status)
product_costs(store_id, product_id, supplier_id, unit_cost_cents, shipping_cents,
              effective_from, source)
marketing_campaigns(id, store_id, channel, objective, status, content_json,
                    budget_cents, approved_by, started_at, ended_at)
```

### Phase 07–08 — Automation and analytics

```sql
workflows(id, store_id, name, trigger CHECK IN ('cron','webhook','manual'),
          schedule_cron, enabled, config_json)
scheduled_tasks(id, workflow_id, next_run_at, last_run_at, last_status, consecutive_failures)
analytics_snapshots(id, store_id, period CHECK IN ('daily','weekly','monthly'),
                    period_start, period_end, revenue_cents, discount_cents, refund_cents,
                    net_revenue_cents, cogs_cents, fees_cents, contribution_profit_cents,
                    order_count, aov_cents, created_at, UNIQUE(store_id, period, period_start))
```

## Indexes and constraints

- Unique: `users(lower(email))`, `sessions(token_hash)`, `system_settings(scope,key)`,
  `budget_limits(scope_id,period,category)`, `notifications(dedupe_key)`, plus per-table `shopify_gid`
  and `idempotency_key` uniques to make webhook/task replay harmless.
- Foreign keys: `ON DELETE CASCADE` for children of sessions/tasks; `ON DELETE RESTRICT` for
  financial records (never silently delete an order).
- Listing indexes always lead with the tenant (`store_id, created_at DESC`).

## Retention

| Data | Retention |
|---|---|
| `sessions` | Delete expired/revoked rows after 30 days (Phase 07 cron) |
| `rate_limit_buckets` | Delete rows with `expires_at` older than 24 hours |
| `audit_logs` | 12 months, then archive or delete (Phase 08 policy) |
| `usage_records` | 24 months (needed for cost trend analysis) |
| `shopify_webhook_events` | 30 days after successful processing |
| Customer records | Deleted on uninstall and on GDPR redaction requests |

## Backup

D1 supports time-travel (`wrangler d1 time-travel`) and `wrangler d1 export`. Phase 08 adds a weekly
export to a private GitHub artifact (free) as a second copy.
