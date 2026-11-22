import { describe, expect, it } from 'vitest';
import { BUDGET_DEFAULTS, evaluateBudget } from '../src/budget';

describe('evaluateBudget', () => {
  it('allows work well inside the ceiling', () => {
    const decision = evaluateBudget({ monthlySpentCents: 100, dailySpentCents: 5 });
    expect(decision.allowed).toBe(true);
    expect(decision.mode).toBe('normal');
    expect(decision.remainingMonthlyCents).toBe(400);
  });

  it('warns at 80% utilisation but still allows', () => {
    const decision = evaluateBudget({ monthlySpentCents: 420, dailySpentCents: 10, requestedCents: 5 });
    expect(decision.allowed).toBe(true);
    expect(decision.mode).toBe('warning');
    expect(decision.code).toBe('near_limit');
  });

  it('hard-stops at the monthly ceiling', () => {
    const decision = evaluateBudget({ monthlySpentCents: 500, dailySpentCents: 0, requestedCents: 1 });
    expect(decision.allowed).toBe(false);
    expect(decision.mode).toBe('hard_stop');
    expect(decision.code).toBe('monthly_limit_reached');
    expect(decision.remainingMonthlyCents).toBe(0);
  });

  it('refuses a request that would overflow the remaining budget', () => {
    const decision = evaluateBudget({ monthlySpentCents: 495, dailySpentCents: 0, requestedCents: 6 });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('insufficient_remaining');
  });

  it('throttles at the daily cap', () => {
    const decision = evaluateBudget({ monthlySpentCents: 100, dailySpentCents: 50, requestedCents: 1 });
    expect(decision.allowed).toBe(false);
    expect(decision.mode).toBe('throttled');
    expect(decision.code).toBe('daily_limit_reached');
  });

  it('stops when the free AI quota is exhausted instead of switching provider', () => {
    const decision = evaluateBudget({
      monthlySpentCents: 0,
      dailySpentCents: 0,
      freeRequestsRemaining: 0,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('free_quota_exhausted');
  });

  it('clamps a limit raised above the authorised $5 ceiling', () => {
    const decision = evaluateBudget({
      policy: { monthlyLimitCents: 100_000 },
      monthlySpentCents: 501,
      dailySpentCents: 0,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.remainingMonthlyCents).toBe(0);
  });

  it('honours a lower owner-configured limit', () => {
    const decision = evaluateBudget({
      policy: { monthlyLimitCents: 200, dailyLimitCents: 10 },
      monthlySpentCents: 201,
      dailySpentCents: 0,
    });
    expect(decision.allowed).toBe(false);
  });

  it('fails closed on hostile or malformed usage values', () => {
    for (const input of [
      { monthlySpentCents: Number.NaN, dailySpentCents: 0 },
      { monthlySpentCents: -50, dailySpentCents: 0 },
      { monthlySpentCents: 1.5, dailySpentCents: 0 },
      { monthlySpentCents: 10, dailySpentCents: 0, requestedCents: -100 },
      { monthlySpentCents: 10, dailySpentCents: 0, requestedCents: Number.POSITIVE_INFINITY },
    ]) {
      const decision = evaluateBudget(input as never);
      expect(decision.allowed, JSON.stringify(input)).toBe(false);
      expect(decision.code).toBe('invalid_usage');
    }
  });

  it('fails closed on an invalid policy', () => {
    const decision = evaluateBudget({
      policy: { warningThresholdPct: 150 },
      monthlySpentCents: 0,
      dailySpentCents: 0,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('invalid_policy');
  });

  it('blocks everything when the owner sets a $0 ceiling', () => {
    const decision = evaluateBudget({
      policy: { monthlyLimitCents: 0 },
      monthlySpentCents: 0,
      dailySpentCents: 0,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('monthly_limit_reached');
  });

  it('never reports negative remaining budget', () => {
    const decision = evaluateBudget({ monthlySpentCents: 900, dailySpentCents: 900 });
    expect(decision.remainingMonthlyCents).toBeGreaterThanOrEqual(0);
    expect(decision.remainingDailyCents).toBeGreaterThanOrEqual(0);
    expect(decision.utilizationPct).toBeLessThanOrEqual(100);
  });

  it('uses the $5 spec ceiling by default', () => {
    expect(BUDGET_DEFAULTS.monthlyLimitCents).toBe(500);
  });
});
