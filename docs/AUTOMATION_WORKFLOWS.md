# Automation workflows

> **Status: NOT IMPLEMENTED.** No cron trigger, queue consumer or background job exists in Phase 01.
> Cloudflare Queues are also not part of the free plan, so the design below deliberately avoids them.

## Why not Queues

| Option | Free plan | Decision |
|---|---|---|
| Cloudflare Queues | No | Not used; adds a paid dependency |
| Cron Triggers | Yes (per Worker) | Primary scheduler |
| D1 task table | Yes | Durable work queue |
| Shopify webhooks | Yes | Event source |
| Durable Objects | Limited/no on free | Not used |

This is a **D1-backed work queue**: webhooks and cron insert rows with an `idempotency_key`; a cron
run claims a small batch, executes it, and records the outcome. It survives deployments, isolate
restarts and duplicate deliveries.

## Planned cron schedule

| Cron (UTC) | Job | AI needed? |
|---|---|---|
| `*/15 * * * *` | Process due `agent_tasks` / `shopify_webhook_events` (max 10 per run) | Only if a task requires it |
| `0 2 * * *` | Daily Shopify reconciliation (products/orders/inventory deltas) | No |
| `30 2 * * *` | Sales analysis for yesterday → snapshot | No (deterministic sums) |
| `45 2 * * *` | Inventory thresholds → low-stock notifications | No |
| `0 3 * * *` | Risk scan (negative margins, missing costs, failed jobs) | No |
| `15 3 * * *` | CEO daily brief (single batched AI call) | 1 request |
| `0 4 * * *` | Product research run if the owner queued one | 1–2 requests |
| `30 4 * * *` | Marketing drafting for approved calendar slots | ≤1 request |
| `0 5 * * 1` | Weekly performance + competitor review | 1 request |
| `0 6 1 * *` | Monthly report, AI usage review, cost analysis | 1 request |
| `0 * * * *` | Housekeeping: expire sessions, purge rate-limit buckets, expire approvals | No |

Total AI budget: **≈4–6 requests/day**, chosen to fit a free Flash quota reported at ~20/day, with
Flash-Lite (higher quota) for routine steps. If quotas are lower than expected, the guard pauses AI
and deterministic reports still run.

## Idempotency

| Job | Key |
|---|---|
| Webhook | `shopify_webhook_events.webhook_id` (unique) |
| Task | `agent_tasks.idempotency_key` = hash(agent, action, target, period, payload digest) |
| Approval execution | `approval_requests.id` + `executed_at IS NULL` guard in one UPDATE |
| Snapshot | `UNIQUE(store_id, period, period_start)` |
| Notification | `notifications.dedupe_key` |

Claiming work uses a single conditional UPDATE:

```sql
UPDATE agent_tasks
   SET status = 'running', started_at = ?, attempts = attempts + 1
 WHERE id = ? AND status IN ('queued','failed')
   AND (locked_until IS NULL OR locked_until < ?)
RETURNING *;
```

If it returns no row, another isolate claimed it — the worker does nothing. This avoids distributed
locks while remaining safe for overlapping cron runs.

## Retry policy

| Failure class | Attempts | Backoff |
|---|---|---|
| Network/timeout (Shopify, Gemini) | 4 | 30 s, 2 m, 8 m, 30 m (jittered) |
| Shopify 429 | 5 | honour `Retry-After` |
| Gemini 429 / quota | 0 automatic | pause AI, notify owner |
| Validation/permission | 0 | terminal, needs a human |
| Unexpected | 3 | 1 m, 5 m, 15 m, then `failed` + notification |

After `max_attempts`, the task becomes `failed` with `error_code`/`error_message`; the Activity page
shows it, and the owner can retry or cancel from the Approval/Activity UI (Phase 07).

## Cancellation

`POST /api/automation/tasks/:id/cancel` (Phase 07) only cancels tasks that have not started a
Shopify mutation. Because every mutation is preceded by a permission check and the task row is the
single source of truth, cancelling between steps is safe; there is no partially-applied batch.

## Webhook processing

1. Verify HMAC over the raw body.
2. Insert a `shopify_webhook_events` row keyed on `X-Shopify-Webhook-Id`; on conflict, return 200
   immediately (duplicate delivery).
3. Store the payload (already validated as JSON) and topic.
4. Return 200 in under a second.
5. The 15-minute cron maps events to sync tasks, marking `processed_at`.
6. Failures increment `attempts`; after 5 the row is `failed` and the owner is notified.

## Activity monitor data

Everything the UI needs is a query away:

- Running tasks: `agent_tasks WHERE status IN ('queued','running','awaiting_approval')`.
- Recent completions: `ORDER BY finished_at DESC LIMIT n`.
- Errors with messages: `status = 'failed'` plus `task_execution_logs`.
- Progress: derived from completed steps of the parent task — a real ratio, never a timer-based fake
  percentage. If a step count is unknown, the UI shows "running" with no percentage.

## Observability

- Structured JSON logs with `requestId`, `taskId`, `storeId`, `agentId`.
- `task_execution_logs` holds the durable history for the Activity page.
- Cloudflare Workers observability (`[observability] enabled = true`) is on in `wrangler.toml`;
  free plan retains a short window, which is enough for incident triage.
- Failure alerts become `notifications` rows, so the owner sees them in-app even if email is not
  configured.

## Phase 07 verification

- [ ] Cron fires and processes a due task exactly once with two overlapping runs
- [ ] Duplicate webhook id is a no-op
- [ ] A failing task retries with backoff and ends `failed` with a visible error
- [ ] AI-quota exhaustion pauses AI but deterministic jobs continue
- [ ] Cancel prevents a not-yet-started mutation
- [ ] Activity page reflects real statuses, including failures
