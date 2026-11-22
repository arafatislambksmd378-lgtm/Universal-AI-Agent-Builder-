import { BUDGET_DEFAULTS } from '@aism/core';
import { execute, queryAll, queryOne, type Db } from './client';

export interface BudgetLimitsRow {
  id: string;
  scope_id: string;
  period: 'monthly' | 'daily';
  category: 'ai' | 'infrastructure' | 'total';
  limit_usd_cents: number;
  hard_stop: number;
}

export interface BudgetConfig {
  monthlyLimitCents: number;
  dailyLimitCents: number;
  warningThresholdPct: number;
}

export interface UsageSummary {
  requests: number;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
}

export async function getSetting<T>(db: Db, key: string): Promise<T | null> {
  const row = await queryOne<{ value: string }>(
    db,
    `SELECT value FROM system_settings WHERE scope = 'global' AND key = ? LIMIT 1`,
    [key],
  );
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function putSetting(
  db: Db,
  key: string,
  value: unknown,
  updatedBy: string | null,
  now: string,
): Promise<void> {
  await execute(
    db,
    `INSERT INTO system_settings (scope, key, value, updated_at, updated_by)
     VALUES ('global', ?, ?, ?, ?)
     ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    [key, JSON.stringify(value), now, updatedBy],
  );
}

export async function getBudgetConfig(db: Db): Promise<BudgetConfig> {
  const rows = await queryAll<BudgetLimitsRow>(
    db,
    `SELECT id, scope_id, period, category, limit_usd_cents, hard_stop
     FROM budget_limits WHERE scope_id = 'global' AND category = 'ai'`,
  );
  const monthly = rows.find((row) => row.period === 'monthly');
  const daily = rows.find((row) => row.period === 'daily');
  const thresholdRaw = await getSetting<number | string>(db, 'budget.warning_threshold_pct');
  const threshold = Number(thresholdRaw);
  return {
    monthlyLimitCents: monthly?.limit_usd_cents ?? BUDGET_DEFAULTS.monthlyLimitCents,
    dailyLimitCents: daily?.limit_usd_cents ?? BUDGET_DEFAULTS.dailyLimitCents,
    warningThresholdPct:
      Number.isFinite(threshold) && threshold >= 0 && threshold <= 100
        ? threshold
        : BUDGET_DEFAULTS.warningThresholdPct,
  };
}

export async function setBudgetConfig(
  db: Db,
  config: BudgetConfig,
  now: string,
): Promise<void> {
  const upsert = async (period: 'monthly' | 'daily', limit: number) => {
    await execute(
      db,
      `INSERT INTO budget_limits (id, scope_id, period, category, limit_usd_cents, hard_stop, created_at, updated_at)
       VALUES (?, 'global', ?, 'ai', ?, 1, ?, ?)
       ON CONFLICT (scope_id, period, category)
       DO UPDATE SET limit_usd_cents = excluded.limit_usd_cents, updated_at = excluded.updated_at`,
      [`bl_global_${period}_ai`, period, limit, now, now],
    );
  };
  await upsert('monthly', config.monthlyLimitCents);
  await upsert('daily', config.dailyLimitCents);
  await putSetting(db, 'budget.warning_threshold_pct', config.warningThresholdPct, null, now);
}

export async function sumUsage(
  db: Db,
  range: { fromIso: string; toIso: string },
): Promise<UsageSummary> {
  const row = await queryOne<{
    requests: number | null;
    cost_cents: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
  }>(
    db,
    `SELECT COALESCE(SUM(request_count), 0) AS requests,
            COALESCE(SUM(cost_usd_cents), 0) AS cost_cents,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens
     FROM usage_records
     WHERE occurred_at >= ? AND occurred_at < ?`,
    [range.fromIso, range.toIso],
  );
  return {
    requests: Number(row?.requests ?? 0),
    costCents: Number(row?.cost_cents ?? 0),
    inputTokens: Number(row?.input_tokens ?? 0),
    outputTokens: Number(row?.output_tokens ?? 0),
  };
}

/** UTC start of the month and of the day containing `now`. */
export function periodBoundaries(now: Date): {
  monthStartIso: string;
  nextMonthStartIso: string;
  dayStartIso: string;
  nextDayStartIso: string;
} {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const nextDayStart = dayStart + 24 * 60 * 60 * 1000;
  return {
    monthStartIso: new Date(monthStart).toISOString(),
    nextMonthStartIso: new Date(nextMonthStart).toISOString(),
    dayStartIso: new Date(dayStart).toISOString(),
    nextDayStartIso: new Date(nextDayStart).toISOString(),
  };
}
