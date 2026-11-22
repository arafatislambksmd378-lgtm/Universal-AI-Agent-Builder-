import { evaluateBudget, type BudgetDecision } from '@aism/core';
import { getBudgetConfig, periodBoundaries, sumUsage, type BudgetConfig } from '../db/settings';
import type { Db } from '../db/client';
import type { BudgetView } from '@aism/core';

export interface BudgetSnapshot {
  config: BudgetConfig;
  view: BudgetView;
  decision: BudgetDecision;
  monthRequestCount: number;
}

export async function budgetSnapshot(db: Db, now: Date): Promise<BudgetSnapshot> {
  const config = await getBudgetConfig(db);
  const bounds = periodBoundaries(now);
  const [monthToDate, today] = await Promise.all([
    sumUsage(db, { fromIso: bounds.monthStartIso, toIso: bounds.nextMonthStartIso }),
    sumUsage(db, { fromIso: bounds.dayStartIso, toIso: bounds.nextDayStartIso }),
  ]);
  const decision = evaluateBudget({
    policy: config,
    monthlySpentCents: monthToDate.costCents,
    dailySpentCents: today.costCents,
  });
  return {
    config,
    decision,
    monthRequestCount: monthToDate.requests,
    view: {
      monthlyLimitCents: config.monthlyLimitCents,
      dailyLimitCents: config.dailyLimitCents,
      warningThresholdPct: config.warningThresholdPct,
      monthToDateCents: monthToDate.costCents,
      todayCents: today.costCents,
      remainingCents: decision.remainingMonthlyCents,
      utilizationPct: decision.utilizationPct,
      mode: decision.mode,
    },
  };
}
