/**
 * Budget guard rails (PART 13).
 *
 * The ceiling is a hard stop, not a suggestion: when the free quota is gone the
 * AI features pause and the owner is notified. Nothing here ever switches to a
 * paid provider, and no caller can pass a value that widens the limit.
 */

import { isValidCents } from './money';

export interface BudgetPolicy {
  monthlyLimitCents: number;
  dailyLimitCents: number;
  /** Utilisation (%) at which the owner should be warned. */
  warningThresholdPct: number;
}

export const BUDGET_DEFAULTS: BudgetPolicy = {
  monthlyLimitCents: 500, // $5.00 — the spec's maximum
  dailyLimitCents: 50, // $0.50/day ≈ $15/month cap by pacing
  warningThresholdPct: 80,
};

export type BudgetMode = 'normal' | 'warning' | 'throttled' | 'hard_stop';

export interface BudgetEvaluationInput {
  policy?: Partial<BudgetPolicy>;
  monthlySpentCents: number;
  dailySpentCents: number;
  /** Cost of the work about to run; 0 for a pure availability check. */
  requestedCents?: number;
  /** Free-tier requests still available today, when the provider exposes it. */
  freeRequestsRemaining?: number | null;
}

export interface BudgetDecision {
  allowed: boolean;
  mode: BudgetMode;
  reasons: string[];
  code:
    | 'ok'
    | 'near_limit'
    | 'daily_limit_reached'
    | 'monthly_limit_reached'
    | 'insufficient_remaining'
    | 'invalid_policy'
    | 'invalid_usage'
    | 'free_quota_exhausted';
  remainingMonthlyCents: number;
  remainingDailyCents: number;
  utilizationPct: number;
}

function sanitizePolicy(policy: Partial<BudgetPolicy> | undefined): BudgetPolicy | null {
  const merged: BudgetPolicy = { ...BUDGET_DEFAULTS, ...policy };
  const { monthlyLimitCents, dailyLimitCents, warningThresholdPct } = merged;
  if (!isValidCents(monthlyLimitCents) || monthlyLimitCents < 0) return null;
  if (!isValidCents(dailyLimitCents) || dailyLimitCents < 0) return null;
  if (!Number.isFinite(warningThresholdPct) || warningThresholdPct < 0 || warningThresholdPct > 100) {
    return null;
  }
  // A configured cap above the authorised ceiling is clamped, never honoured.
  return {
    monthlyLimitCents: Math.min(monthlyLimitCents, BUDGET_DEFAULTS.monthlyLimitCents),
    dailyLimitCents: Math.min(dailyLimitCents, BUDGET_DEFAULTS.monthlyLimitCents),
    warningThresholdPct,
  };
}

export function evaluateBudget(input: BudgetEvaluationInput): BudgetDecision {
  const policy = sanitizePolicy(input.policy);
  if (!policy) {
    return {
      allowed: false,
      mode: 'hard_stop',
      code: 'invalid_policy',
      reasons: ['Budget configuration is invalid; AI work is paused until it is fixed.'],
      remainingMonthlyCents: 0,
      remainingDailyCents: 0,
      utilizationPct: 100,
    };
  }

  const { monthlySpentCents, dailySpentCents } = input;
  const requested = input.requestedCents ?? 0;
  if (
    !isValidCents(monthlySpentCents) ||
    monthlySpentCents < 0 ||
    !isValidCents(dailySpentCents) ||
    dailySpentCents < 0 ||
    !isValidCents(requested) ||
    requested < 0
  ) {
    return {
      allowed: false,
      mode: 'hard_stop',
      code: 'invalid_usage',
      reasons: ['Usage figures are invalid; AI work is paused rather than risk overspend.'],
      remainingMonthlyCents: 0,
      remainingDailyCents: 0,
      utilizationPct: 100,
    };
  }

  const remainingMonthlyCents = Math.max(0, policy.monthlyLimitCents - monthlySpentCents);
  const remainingDailyCents = Math.max(0, policy.dailyLimitCents - dailySpentCents);
  const utilizationPct =
    policy.monthlyLimitCents === 0
      ? 100
      : Math.min(100, Math.round((monthlySpentCents * 100) / policy.monthlyLimitCents));

  if (policy.monthlyLimitCents === 0) {
    return {
      allowed: false,
      mode: 'hard_stop',
      code: 'monthly_limit_reached',
      reasons: ['Monthly budget is set to $0. No AI requests may be made.'],
      remainingMonthlyCents: 0,
      remainingDailyCents,
      utilizationPct: 100,
    };
  }

  if (monthlySpentCents + requested > policy.monthlyLimitCents) {
    return {
      allowed: false,
      mode: 'hard_stop',
      code: monthlySpentCents >= policy.monthlyLimitCents ? 'monthly_limit_reached' : 'insufficient_remaining',
      reasons: [
        monthlySpentCents >= policy.monthlyLimitCents
          ? 'Monthly AI budget exhausted. AI work is paused until the next period.'
          : 'This request would exceed the remaining monthly AI budget.',
      ],
      remainingMonthlyCents,
      remainingDailyCents,
      utilizationPct,
    };
  }

  if (dailySpentCents + requested > policy.dailyLimitCents) {
    return {
      allowed: false,
      mode: 'throttled',
      code: 'daily_limit_reached',
      reasons: ['Daily AI spend cap reached. AI work pauses until tomorrow (owner can raise the cap).'],
      remainingMonthlyCents,
      remainingDailyCents,
      utilizationPct,
    };
  }

  if (input.freeRequestsRemaining === 0) {
    return {
      allowed: false,
      mode: 'throttled',
      code: 'free_quota_exhausted',
      reasons: [
        'Free-tier AI quota is exhausted. AI work is paused — the system will not switch to a paid provider automatically.',
      ],
      remainingMonthlyCents,
      remainingDailyCents,
      utilizationPct,
    };
  }

  if (utilizationPct >= policy.warningThresholdPct) {
    return {
      allowed: true,
      mode: 'warning',
      code: 'near_limit',
      reasons: [`${utilizationPct}% of the monthly AI budget is used.`],
      remainingMonthlyCents,
      remainingDailyCents,
      utilizationPct,
    };
  }

  return {
    allowed: true,
    mode: 'normal',
    code: 'ok',
    reasons: [],
    remainingMonthlyCents,
    remainingDailyCents,
    utilizationPct,
  };
}

/** Convert provider token counts into a cost estimate at a known price. */
export function estimateAiCostCents(params: {
  inputTokens: number;
  outputTokens: number;
  inputPricePerMillionCents: number;
  outputPricePerMillionCents: number;
}): number {
  const { inputTokens, outputTokens } = params;
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens) || inputTokens < 0 || outputTokens < 0) {
    return 0;
  }
  const input = (inputTokens * params.inputPricePerMillionCents) / 1_000_000;
  const output = (outputTokens * params.outputPricePerMillionCents) / 1_000_000;
  return Math.round(input + output);
}
