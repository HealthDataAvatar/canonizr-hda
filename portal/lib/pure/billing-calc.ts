/** Pure billing calculations — no I/O. */

const KB_PER_UNIT = 100;

export interface BillingInput {
  totalUnits: number;
  freeUnits: number | null;
  pricePerUnit: number;
}

export interface BillingCalc {
  processedKB: number;
  freeRemainingKB: number | null;
  freeTotalKB: number | null;
  estimatedCost: number;
  freeUsagePercent: number;
}

export function calculateBilling(input: BillingInput): BillingCalc {
  const { totalUnits, freeUnits, pricePerUnit } = input;

  return {
    processedKB: totalUnits * KB_PER_UNIT,
    freeRemainingKB:
      freeUnits !== null
        ? Math.max(0, freeUnits - totalUnits) * KB_PER_UNIT
        : null,
    freeTotalKB: freeUnits !== null ? freeUnits * KB_PER_UNIT : null,
    estimatedCost:
      Math.max(0, totalUnits - (freeUnits ?? 0)) * pricePerUnit,
    freeUsagePercent:
      freeUnits !== null && freeUnits > 0
        ? Math.min(100, Math.round((totalUnits / freeUnits) * 100))
        : 0,
  };
}
