/** Pure spend/quota conversion functions. */

/**
 * Convert a dollar spend limit to KB quota.
 * Rounds down to avoid exceeding the dollar limit.
 */
export function dollarsToQuotaKB(dollars: number, pricePerUnit: number): number {
  return Math.floor(dollars / pricePerUnit) * 100;
}

/**
 * Convert KB usage to dollar amount.
 */
export function usageKBToDollars(usageKB: number, pricePerUnit: number): number {
  return (usageKB / 100) * pricePerUnit;
}

/**
 * Convert a KB quota to dollar equivalent.
 */
export function quotaKBToDollars(quotaKB: number, pricePerUnit: number): number {
  return (quotaKB / 100) * pricePerUnit;
}
