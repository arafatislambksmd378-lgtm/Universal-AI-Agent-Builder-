/**
 * Deterministic money maths.
 *
 * The specification forbids asking an AI model to do arithmetic that code can
 * do reliably (PART 13). All money is represented as integer minor units
 * ("cents") and every percentage is expressed in basis points (1% = 100 bps)
 * so no floating point value ever reaches a stored financial figure.
 */

export interface UnitEconomicsInput {
  /** Price the customer pays, excluding tax collected on behalf of authorities. */
  sellingPriceCents: number;
  /** What we pay the supplier / print provider / licence vendor. */
  supplierCostCents: number;
  /** Inbound shipping + outbound fulfilment cost per unit. */
  shippingCostCents: number;
  /** Payment processing percentage, in basis points of selling price (e.g. 290 = 2.9%). */
  paymentFeeBps?: number;
  /** Flat payment/transaction fee per order, in cents. */
  transactionFeeCents?: number;
  /** Advertising / customer acquisition cost attributed to the order. */
  advertisingCostCents?: number;
  /** Taxes and duties absorbed by the merchant (not collected from the buyer). */
  taxAndDutyCents?: number;
  /** Any other variable cost (packaging, fees, refunds allowance). */
  otherVariableCostCents?: number;
}

export interface UnitEconomics {
  revenueCents: number;
  /** Supplier + shipping: the true cost of the goods sold. */
  cogsCents: number;
  feesCents: number;
  otherVariableCents: number;
  /** revenue - cogs. */
  grossProfitCents: number;
  grossMarginBps: number;
  grossMarginPct: number;
  /** gross profit - fees - advertising - taxes - other variable costs. */
  contributionProfitCents: number;
  contributionMarginPct: number;
  /** Price at which contribution profit is exactly zero (rounded up to the cent). */
  breakEvenPriceCents: number | null;
  /** Inputs the merchant has not supplied yet; margins are optimistic until filled in. */
  missingInputs: string[];
}

export type MarginBand = 'negative' | 'thin' | 'healthy' | 'strong';

export const DEFAULT_MARGIN_BANDS = {
  /** Below this gross margin the product is classified as thin. */
  thinBelowBps: 2000,
  /** At or above this gross margin the product is classified as strong. */
  strongAtOrAboveBps: 4500,
} as const;

const MAX_CENTS = 10_000_000_00; // $10,000,000.00 — guards against overflow/garbage input

/**
 * Round halves away from zero. `Math.round` rounds -0.5 to -0, which would
 * silently swallow a cent on negative adjustments, so we do it explicitly.
 */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function isValidCents(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Math.abs(value) <= MAX_CENTS
  );
}

export function isValidBps(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10_000
  );
}

/** Returns human-readable problems; empty array means the input is safe to price. */
export function validateUnitEconomicsInput(input: UnitEconomicsInput): string[] {
  const issues: string[] = [];
  const centFields: Array<[keyof UnitEconomicsInput, string]> = [
    ['sellingPriceCents', 'selling price'],
    ['supplierCostCents', 'supplier cost'],
    ['shippingCostCents', 'shipping cost'],
    ['transactionFeeCents', 'transaction fee'],
    ['advertisingCostCents', 'advertising cost'],
    ['taxAndDutyCents', 'tax and duty'],
    ['otherVariableCostCents', 'other variable cost'],
  ];
  for (const [field, label] of centFields) {
    const value = input[field];
    if (value === undefined) continue;
    if (!isValidCents(value)) issues.push(`${label} must be an integer number of cents`);
    else if (value < 0) issues.push(`${label} cannot be negative`);
  }
  if (input.paymentFeeBps !== undefined && !isValidBps(input.paymentFeeBps)) {
    issues.push('payment fee must be an integer basis-point value between 0 and 10000');
  }
  if (isValidCents(input.sellingPriceCents) && input.sellingPriceCents <= 0) {
    issues.push('selling price must be greater than zero');
  }
  return issues;
}

/**
 * Full unit economics. `netProfit` is deliberately absent: fixed costs
 * (subscriptions, salaries, app fees) are not known per unit, and the spec
 * forbids labelling revenue or contribution margin as net profit.
 */
export function computeUnitEconomics(input: UnitEconomicsInput): UnitEconomics {
  const issues = validateUnitEconomicsInput(input);
  if (issues.length > 0) {
    throw new RangeError(`Invalid unit economics input: ${issues.join('; ')}`);
  }

  const revenueCents = input.sellingPriceCents;
  const supplierCostCents = input.supplierCostCents;
  const shippingCostCents = input.shippingCostCents;
  const cogsCents = supplierCostCents + shippingCostCents;

  const paymentFeeBps = input.paymentFeeBps ?? 0;
  const transactionFeeCents = input.transactionFeeCents ?? 0;
  const variableFeeCents =
    transactionFeeCents + roundHalfAwayFromZero((revenueCents * paymentFeeBps) / 10_000);
  const feesCents = variableFeeCents;

  const advertisingCostCents = input.advertisingCostCents ?? 0;
  const taxAndDutyCents = input.taxAndDutyCents ?? 0;
  const otherVariableCostCents = input.otherVariableCostCents ?? 0;
  const otherVariableCents =
    advertisingCostCents + taxAndDutyCents + otherVariableCostCents;

  const grossProfitCents = revenueCents - cogsCents;
  const contributionProfitCents = grossProfitCents - feesCents - otherVariableCents;

  const grossMarginBps = marginBps(grossProfitCents, revenueCents);
  const contributionMarginBps = marginBps(contributionProfitCents, revenueCents);

  // The percentage fee scales with the break-even price, so only the flat and
  // per-unit costs belong in the numerator (otherwise the fee is counted twice).
  const fixedCostsCents =
    transactionFeeCents + advertisingCostCents + taxAndDutyCents + otherVariableCostCents;
  const denominator = 1 - paymentFeeBps / 10_000;
  const breakEvenPriceCents =
    denominator > 0
      ? Math.ceil((cogsCents + fixedCostsCents) / denominator)
      : null;

  const missingInputs: string[] = [];
  if (supplierCostCents === 0) missingInputs.push('supplier cost');
  if (shippingCostCents === 0) missingInputs.push('shipping cost');
  if (input.paymentFeeBps === undefined) missingInputs.push('payment fee %');
  if (input.advertisingCostCents === undefined) missingInputs.push('advertising cost');

  return {
    revenueCents,
    cogsCents,
    feesCents,
    otherVariableCents,
    grossProfitCents,
    grossMarginBps,
    grossMarginPct: bpsToPct(grossMarginBps),
    contributionProfitCents,
    contributionMarginPct: bpsToPct(contributionMarginBps),
    breakEvenPriceCents,
    missingInputs,
  };
}

export function marginBps(profitCents: number, revenueCents: number): number {
  if (!Number.isFinite(profitCents) || !Number.isFinite(revenueCents) || revenueCents <= 0) {
    return 0;
  }
  return Math.round((profitCents * 10_000) / revenueCents);
}

export function bpsToPct(bps: number): number {
  return roundHalfAwayFromZero(bps) / 100;
}

export function classifyMargin(
  grossMarginBps: number,
  bands: { thinBelowBps: number; strongAtOrAboveBps: number } = DEFAULT_MARGIN_BANDS,
): MarginBand {
  if (grossMarginBps < 0) return 'negative';
  if (grossMarginBps < bands.thinBelowBps) return 'thin';
  if (grossMarginBps >= bands.strongAtOrAboveBps) return 'strong';
  return 'healthy';
}

/** Format integer cents as a USD string. Display only — never feed back into maths. */
export function formatUsd(cents: number, options: { signed?: boolean } = {}): string {
  const safe = isValidCents(cents) ? cents : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const formatted = `$${dollars.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`;
  if (negative) return `-${formatted}`;
  return options.signed && safe > 0 ? `+${formatted}` : formatted;
}
