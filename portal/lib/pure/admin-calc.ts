/**
 * Pure calculation helpers for admin data.
 * No framework imports — independently testable.
 */

import { toBillableKB } from "./format";

// ---------------------------------------------------------------------------
// Job aggregation — single source of truth for usage/error stats
// ---------------------------------------------------------------------------

/** Minimal job shape needed for aggregation. Both raw table entities and
 *  typed JobRecords can satisfy this interface. */
export interface JobSummaryInput {
  timestamp: string;
  inputBytes: number;
  status: string;
}

export interface JobStats {
  count: number;
  errorCount: number;
  billableKB: number;
}

/** Aggregate job stats from a list of jobs within a time window. */
export function aggregateJobs(
  jobs: JobSummaryInput[],
  sinceMs: number,
): JobStats {
  let count = 0;
  let errorCount = 0;
  let billableKB = 0;

  for (const j of jobs) {
    if (new Date(j.timestamp).getTime() < sinceMs) continue;
    count++;
    if (j.status === "error") errorCount++;
    billableKB += toBillableKB(j.inputBytes);
  }

  return { count, errorCount, billableKB };
}

// ---------------------------------------------------------------------------
// Invoice aggregation
// ---------------------------------------------------------------------------

export function sumInvoiceAmounts(
  invoices: { amount: number }[],
): number {
  return invoices.reduce((sum, inv) => sum + inv.amount, 0);
}
