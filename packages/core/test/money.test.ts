import { describe, expect, it } from 'vitest';
import {
  classifyMargin,
  computeUnitEconomics,
  formatUsd,
  marginBps,
  roundHalfAwayFromZero,
  validateUnitEconomicsInput,
} from '../src/money';
import { estimateAiCostCents } from '../src/budget';

const base = {
  sellingPriceCents: 4999,
  supplierCostCents: 1500,
  shippingCostCents: 500,
  paymentFeeBps: 290,
  transactionFeeCents: 30,
  advertisingCostCents: 800,
  taxAndDutyCents: 0,
  otherVariableCostCents: 0,
};

describe('computeUnitEconomics', () => {
  it('separates gross profit from contribution profit', () => {
    const result = computeUnitEconomics(base);
    // revenue 49.99 - (15.00 + 5.00) = 29.99 gross
    expect(result.revenueCents).toBe(4999);
    expect(result.cogsCents).toBe(2000);
    expect(result.grossProfitCents).toBe(2999);
    // fee = 2.9% of 4999 = 144.971 -> 145, plus 30 flat
    expect(result.feesCents).toBe(175);
    expect(result.otherVariableCents).toBe(800);
    // 2999 - 175 - 800
    expect(result.contributionProfitCents).toBe(2024);
    expect(result.contributionMarginPct).toBe(40.49);
    expect(result.grossMarginPct).toBe(59.99);
  });

  it('never invents a net profit figure', () => {
    const result = computeUnitEconomics(base) as unknown as Record<string, unknown>;
    expect(result.netProfitCents).toBeUndefined();
    expect(result.netProfit).toBeUndefined();
  });

  it('computes break-even price including fees', () => {
    const result = computeUnitEconomics({
      sellingPriceCents: 3000,
      supplierCostCents: 1000,
      shippingCostCents: 0,
      paymentFeeBps: 290,
      transactionFeeCents: 30,
    });
    // (1000 + 30) / (1 - 0.029) = 1060.76 -> ceil 1061
    expect(result.breakEvenPriceCents).toBe(1061);
    const atBreakEven = computeUnitEconomics({
      sellingPriceCents: 1061,
      supplierCostCents: 1000,
      shippingCostCents: 0,
      paymentFeeBps: 290,
      transactionFeeCents: 30,
    });
    expect(atBreakEven.contributionProfitCents).toBeGreaterThanOrEqual(0);
  });

  it('detects negative margin products', () => {
    const result = computeUnitEconomics({
      sellingPriceCents: 1000,
      supplierCostCents: 1200,
      shippingCostCents: 200,
    });
    expect(result.grossProfitCents).toBe(-400);
    expect(result.grossMarginBps).toBe(-4000);
    expect(classifyMargin(result.grossMarginBps)).toBe('negative');
  });

  it('lists missing inputs instead of pretending the margin is complete', () => {
    const result = computeUnitEconomics({ sellingPriceCents: 2000, supplierCostCents: 0, shippingCostCents: 0 });
    expect(result.missingInputs).toEqual(
      expect.arrayContaining(['supplier cost', 'shipping cost', 'payment fee %', 'advertising cost']),
    );
  });

  it('rejects floats, negatives and non-numeric cents', () => {
    expect(validateUnitEconomicsInput({ ...base, sellingPriceCents: 49.99 })).not.toHaveLength(0);
    expect(validateUnitEconomicsInput({ ...base, supplierCostCents: -1 })).not.toHaveLength(0);
    expect(
      validateUnitEconomicsInput({ ...base, advertisingCostCents: Number.NaN }),
    ).not.toHaveLength(0);
    expect(() => computeUnitEconomics({ ...base, sellingPriceCents: 0 })).toThrow(RangeError);
    expect(() =>
      computeUnitEconomics({ ...base, paymentFeeBps: 12000 }),
    ).toThrow(RangeError);
  });

  it('handles a 100% fee bound without dividing by zero', () => {
    const result = computeUnitEconomics({ ...base, paymentFeeBps: 10000 });
    expect(result.breakEvenPriceCents).toBeNull();
  });

  it('keeps revenue identical regardless of input ordering', () => {
    const a = computeUnitEconomics(base);
    const b = computeUnitEconomics({ ...base });
    expect(a).toEqual(b);
  });
});

describe('margin helpers', () => {
  it('classifies margins with the documented defaults', () => {
    expect(classifyMargin(5000)).toBe('strong');
    expect(classifyMargin(3000)).toBe('healthy');
    expect(classifyMargin(1000)).toBe('thin');
    expect(classifyMargin(-1)).toBe('negative');
  });

  it('returns 0 margin for zero revenue instead of Infinity', () => {
    expect(marginBps(500, 0)).toBe(0);
    expect(Number.isFinite(marginBps(500, 0))).toBe(true);
  });

  it('rounds halves away from zero', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('formats cents as USD strings', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(123456)).toBe('$1,234.56');
    expect(formatUsd(-500)).toBe('-$5.00');
    expect(formatUsd(Number.NaN)).toBe('$0.00');
  });
});

describe('estimateAiCostCents', () => {
  it('estimates token cost in cents', () => {
    // 1M input tokens at $0.075/M = 7.5 cents; 1M output at $0.30/M = 30 cents
    expect(
      estimateAiCostCents({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        inputPricePerMillionCents: 7.5,
        outputPricePerMillionCents: 30,
      }),
    ).toBe(38);
  });

  it('is immune to negative token counts', () => {
    expect(
      estimateAiCostCents({
        inputTokens: -100,
        outputTokens: 0,
        inputPricePerMillionCents: 10,
        outputPricePerMillionCents: 10,
      }),
    ).toBe(0);
  });
});
