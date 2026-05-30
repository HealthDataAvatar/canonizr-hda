/**
 * Pure calculation helpers for admin data.
 * No framework imports — independently testable.
 */

export function sumUsageSince(
  jobs: { timestamp: string; billableKB: number }[],
  sinceMs: number,
): number {
  return jobs
    .filter((j) => new Date(j.timestamp).getTime() >= sinceMs)
    .reduce((sum, j) => sum + j.billableKB, 0);
}

export function sumInvoiceAmounts(
  invoices: { amount: number }[],
): number {
  return invoices.reduce((sum, inv) => sum + inv.amount, 0);
}
