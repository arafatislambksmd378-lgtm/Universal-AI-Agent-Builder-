# AI agent system

## What exists today (Phase 01, tested)

| Piece | Location | Status |
|---|---|---|
| Ten agent definitions (mission, responsibilities, dependencies, requestable actions) | `packages/core/src/agents.ts` | Implemented, `agents.test.ts` |
| 22-action registry with levels, risk, required Shopify scopes | `packages/core/src/permissions.ts` | Implemented, `permissions.test.ts` |
| Permission evaluation (the server-side gate) | `evaluatePermission()` | Implemented, 16 tests |
| Budget guard (hard stop, daily cap, free-quota stop) | `packages/core/src/budget.ts` | Implemented, 13 tests |
| Agent registry API for the UI | `GET /api/agents` | Implemented |
| Level-2 grant storage + audited toggles | `PUT /api/settings/permissions/:actionId` | Implemented |
| LLM calls, task execution, approvals, tool executor | — | **Not implemented (Phase 03)** |

The UI labels every agent `Registry only` because that is true: they have no execution path yet.

## Registry

| # | Agent | May request (examples) |
|---|---|---|
| 01 | CEO / Executive | reads, `generate_report`, `research_market` |
| 02 | Product Research | `research_market`, `create_product_research`, `generate_report` |
| 03 | Product Manager | `create_product_draft`, `update_product_description`, `update_product_tags`, `publish_product`, `delete_product` |
| 04 | Pricing & Profit | reads, `change_price`, `change_discount`, `generate_report` |
| 05 | Sales & Analytics | reads, `generate_report` |
| 06 | Marketing | `generate_marketing_content`, `schedule_content`, `send_customer_message`, `activate_paid_ads`, `spend_money` |
| 07 | Order Management | reads, `cancel_order`, `issue_refund`, `generate_report` |
| 08 | Inventory | reads, `update_inventory_rules`, `generate_report` |
| 09 | Customer Support | reads, `generate_support_reply`, `send_customer_message` |
| 10 | Risk & Compliance | reads, `generate_report` |

An agent cannot request an action outside its list. An unknown agent or unknown action is denied.

## Three permission levels

| Level | Rule | Examples |
|---|---|---|
| 1 | Automatic. Read/analyse/draft only. | read products/orders/inventory/analytics, market research, reports, marketing and support drafts |
| 2 | Denied until the owner enables the specific action. Enabling is stored in `system_settings` and audited. | product drafts, description/tag updates, rule-based inventory changes, scheduled content, research runs |
| 3 | Always needs a matching, unexpired approval record — **even if** the agent is "autonomous". | publish/delete product, price change, discount change, cancel order, refund, customer message, paid ads, spending, Shopify settings |

The evaluator fails closed:

| Situation | Decision |
|---|---|
| Unknown action / agent | deny |
| Agent not allowed to raise the action | deny |
| Level 2 without grant | deny (`grant_required`) |
| Level 3 without approval | require approval |
| Approval for a different action | deny (`approval_scope_mismatch`) |
| Approval rejected / expired / malformed timestamp | deny |
| Approval still pending | require approval |
| Valid approval | allow (`allowed_approved`) |

Grants passed by a client cannot upgrade a level-3 action; there is no code path that reads an
`enabled` flag for level 3.

## Planned execution loop (Phase 03)

```
1. Owner instruction (Command Center) or scheduled trigger
2. CEO planner: ONE Gemini call → strict JSON plan
     { goal, steps: [{ agentId, actionId, reason, payload, requiresAi }] }
3. Plan validation (Zod) + per-step permission pre-check (deny early, never late)
4. Persist agent_tasks rows (idempotency key = hash(goal + step + target + window))
5. Execute steps in order:
     - deterministic steps run in code (counts, sums, margins, stock maths)
     - judgement steps batch into one call per agent per run
6. Validate model output against the step schema; reject and retry once on failure
7. For level-3 steps: create approval_request, stop, notify owner
8. On approval: re-check permission immediately before executing the tool
9. Every transition writes task_execution_logs + audit_logs, metered into usage_records
```

### Why the CEO cannot bypass approvals

`executeStep()` is the only function that can call a tool, and its first statement is
`evaluatePermission()` with the approval loaded from D1 by `task_id`. There is no "trusted" flag, no
client-provided approval object, and the approval's `actionId` must match the step's action. Tests
`does not treat a hostile grant object as authorization` and `blocks an approval issued for a
different action` lock this behaviour in.

## Prompt and output discipline

- Every agent call uses a JSON schema (`responseSchema`) and `responseMimeType: application/json`.
- Numbers the model must not invent (revenue, margin, stock, refund amounts) are passed in as facts
  computed by code; the model may only narrate and prioritise.
- Every research output must carry `sources[]`, `researchedAt`, `targetCountry`, `confidence` and a
  `classification`; a missing source downgrades the result to `insufficient_evidence`.
- Model output is never rendered as HTML. It is escaped by React and stored as text.
- Customer PII is not sent to the model. Support drafts receive order metadata (number, status,
  dates), never email addresses, phone numbers or full addresses.

## Cost and quota control

- Model routing: Flash-Lite for routine extraction/summaries (higher free daily quota), Flash only
  for planning that genuinely needs reasoning.
- A daily request cap per agent (`agent_settings.max_requests_per_day`) plus the global budget guard.
- Aggressive caching: identical prompt + context hash → reuse the stored result (`usage_records`
  records a zero-cost cache hit).
- Scheduled jobs skip AI entirely when their input hash is unchanged.
- On 429/quota exhaustion: mark the task `failed` with `free_quota_exhausted`, notify the owner, and
  do not retry against a paid provider.

## Failure handling

| Failure | Behaviour |
|---|---|
| Gemini 5xx / timeout | retry with backoff (max 3), then task `failed`, owner notified |
| Invalid JSON / schema violation | one repair attempt, then fail with the raw (redacted) output logged |
| Permission denied | task `failed`, audited, never retried automatically |
| Budget exhausted | task paused, notification raised, resumes next period or after owner raises the cap |
| Tool error (Shopify 4xx/5xx) | classify retryable vs terminal; retryable tasks back off, terminal ones need a human |

## Roadmap of agent work

| Phase | Adds |
|---|---|
| 03 | Gemini client, plan schema, task engine, approvals table/API, tool executor, command center |
| 04 | Research provider abstraction, scoring, product write tools, pricing recommendations |
| 05 | Order/inventory/support/risk tools and reports |
| 06 | Marketing drafting pipelines and channel adapters |
| 07 | Cron-driven agent runs and the live activity monitor |
| 08 | Red-team tests: prompt injection, approval replay, budget bypass |
