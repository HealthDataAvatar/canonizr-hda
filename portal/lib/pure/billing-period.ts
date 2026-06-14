/** Billing period calculation -- pure functions, no I/O. */

/**
 * Compute the start date (YYYY-MM-DD) of the current billing period.
 * Must match gateway/app/quota.py current_period_start() exactly.
 */
export function currentPeriodStart(anchorDay: number): string {
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth(); // 0-indexed

  function clamp(y: number, m: number): string {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const day = Math.min(anchorDay, lastDay);
    return new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
  }

  const periodThisMonth = clamp(year, month);
  if (today.toISOString().slice(0, 10) >= periodThisMonth) {
    return periodThisMonth;
  }

  // Haven't reached anchor day yet -- period started last month
  if (month === 0) {
    return clamp(year - 1, 11);
  }
  return clamp(year, month - 1);
}

/** Redis key for period-scoped usage. Must match gateway/app/keys.py. */
export function quotaUsageKey(subId: string, periodStart: string): string {
  return `sub:${subId}:bytes:${periodStart}`;
}
