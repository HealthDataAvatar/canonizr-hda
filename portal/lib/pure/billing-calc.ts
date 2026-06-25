/** Pure billing calculations — no I/O. */

export const KB_PER_UNIT = 100;

/**
 * USD per 100KB unit. The single source of truth for the *displayed* rate and
 * estimate. This must match the Stripe Price `canonizr_per_100kb`, which is what
 * actually invoices — Stripe owns billing; this constant only mirrors it for the
 * UI. There is deliberately no per-user override: per-user rates would require a
 * distinct Stripe Price each (see docs/issues/stripe.md "tier registry").
 */
export const RATE_PER_UNIT = 0.003;

export interface BillingInput {
  totalUnits: number;
  freeUnits: number | null;
}

export interface BillingCalc {
  processedKB: number;
  freeRemainingKB: number | null;
  freeTotalKB: number | null;
  estimatedCost: number;
  freeUsagePercent: number;
}

export function calculateBilling(input: BillingInput): BillingCalc {
  const { totalUnits, freeUnits } = input;

  return {
    processedKB: totalUnits * KB_PER_UNIT,
    freeRemainingKB:
      freeUnits !== null
        ? Math.max(0, freeUnits - totalUnits) * KB_PER_UNIT
        : null,
    freeTotalKB: freeUnits !== null ? freeUnits * KB_PER_UNIT : null,
    estimatedCost:
      Math.max(0, totalUnits - (freeUnits ?? 0)) * RATE_PER_UNIT,
    freeUsagePercent:
      freeUnits !== null && freeUnits > 0
        ? Math.min(100, Math.round((totalUnits / freeUnits) * 100))
        : 0,
  };
}
