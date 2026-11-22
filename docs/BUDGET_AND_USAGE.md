# Budget and AI usage

## Current spend

| Item | Plan | Monthly cost |
|---|---|---|
| Cloudflare Workers | Free (100k requests/day) | $0 |
| Cloudflare Pages | Free | $0 |
| Cloudflare D1 | Free tier | $0 |
| GitHub Actions | Free minutes for this repo size | $0 |
| Gemini API | Free tier only; not called yet | $0 |
| **Total** | | **$0.00** |

Phase 01 makes no AI calls at all, so the dashboard's "$0.00 spent" is a real `SUM()` over an empty
`usage_records` table.

## The hard ceiling

Seeded by migration `0001_foundation.sql`:

| Limit | Value | Enforced by |
|---|---|---|
| Monthly AI spend | $5.00 (500 cents) | `evaluateBudget()` hard stop |
| Daily AI spend | $0.50 (50 cents) | `evaluateBudget()` throttle |
| Warning threshold | 80% | Dashboard badge + notification |

Behaviour:

- `utilization ≥ 80%` → `warning` (work still allowed, owner sees amber).
- Would exceed monthly → `hard_stop`, AI work paused, notification raised.
- Would exceed daily → `throttled`, AI pauses until tomorrow.
- Free quota reported as exhausted (`freeRequestsRemaining === 0`) → `free_quota_exhausted`, pauses.
- Invalid policy or usage figures → `hard_stop` (fail closed, never open).
- A configured limit above 500 cents is **clamped** to 500, and the API rejects it with 400 as well.
- There is no code path that switches to a paid provider automatically. Enabling paid usage requires
  a code change plus explicit owner authorisation.

Tests: `packages/core/test/budget.test.ts` (13 cases) and `apps/api/test/settings.test.ts` (ceiling
cannot be raised above $5, persisted value verified, audit entry written).

## Gemini free-tier reality (verify before relying on it)

Published and community-reported limits have changed repeatedly and differ by model and region. As of
late 2026, reports put **Gemini Flash at roughly 20 requests/day** for free projects, with
**Flash-Lite around 500 requests/day**, and Pro models at zero free requests. Google's numbers must be
checked in **AI Studio → Rate limits** for your own project before designing around them.

Consequences baked into this design:

1. AI is a scarce resource: deterministic code does counting, summing, margins, stock maths.
2. Scheduled AI is capped at roughly **4–6 requests/day** in total (see
   [AUTOMATION_WORKFLOWS.md](AUTOMATION_WORKFLOWS.md)).
3. Routine work prefers Flash-Lite; Flash is reserved for planning.
4. Identical inputs are cached by hash; cache hits cost nothing and are not counted twice.
5. When the quota is gone, the affected job pauses and deterministic reports still run.

## What $5 would buy if you authorised paid usage

Prices change; the constants live in one place in Phase 03's Gemini client. Using published Flash-Lite
prices at the time of writing ($0.10 per 1M input tokens, $0.40 per 1M output tokens):

| Monthly tokens | Cost |
|---|---|
| 1M input + 1M output | ~$0.50 |
| 5M input + 5M output | ~$2.50 |
| 10M input + 10M output | ~$5.00 |

That is a large amount of text for a single store — but it is **not** authorised. Free tier remains
the only configured provider.

## Metering model (Phase 03)

Each AI call writes a `usage_records` row:

| Field | Meaning |
|---|---|
| `provider`, `model` | `gemini`, e.g. `gemini-2.5-flash-lite` |
| `agent_id`, `task_id` | Attribution for per-agent and per-task reporting |
| `input_tokens`, `output_tokens` | From the response's `usageMetadata` |
| `cost_usd_cents` | `estimateAiCostCents()` — integer cents, never a float |
| `request_count` | 1 per call; 0-cost cache hit recorded separately for visibility |

`estimateAiCostCents()` is unit tested, including negative token counts (treated as 0).

## Usage visibility

- Dashboard: spent / ceiling / remaining, utilisation bar, mode badge, request count this month.
- Settings: same plus today's spend against the daily cap, editable within $0–$5.
- Phase 07 adds a monthly usage breakdown per agent and per task.

## Guard rails checklist

- [x] Monthly ceiling stored in the database, not in code defaults only
- [x] Daily cap
- [x] Clamp above-ceiling configuration
- [x] Fail closed on malformed usage
- [x] Free-quota exhaustion path (no paid fallback)
- [x] Warning threshold
- [ ] Per-agent daily request caps (Phase 03)
- [ ] Notification on hard stop (Phase 03/07)
- [ ] Usage export for monthly review (Phase 07)

## Owner cost decisions still open

1. Whether to ever enable paid Gemini usage (default: no).
2. Whether to move login hashing off the free Workers CPU budget (see
   [SECURITY_POLICY.md](SECURITY_POLICY.md#known-gaps-and-the-plan)).
3. Whether a custom domain (~$10/year) is acceptable for same-site cookies. Not required; the
   `SameSite=None` path works without it.
