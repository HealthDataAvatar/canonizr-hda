/**
 * Server-side data assembly for portal pages.
 *
 * Each function returns everything a page needs, pre-joined and ready to render.
 * Called directly from server components — no API routes needed for reads.
 */

import { requireUser } from "@/lib/auth/session";
import { getServices, type Invoice } from "@/lib/services";
import { getCurrentConfig, getCurrentPermissions } from "@/lib/data/tables";
import { getJobsForUser } from "./jobs";
import { calculateBilling } from "@/lib/pure/billing-calc";
import type { RequestRow } from "@/components/request-table";
import type { KeyRow } from "@/components/key-table";

// -------------------------------------------------------------------------
// Recent error (used by layout error banner)
// -------------------------------------------------------------------------

import type { RecentError } from "@/components/error-banner";

export async function getRecentError(): Promise<RecentError | null> {
  const { userId } = await requireUser({ autoRedirect: true });
  const jobs = await getJobsForUser(userId, 10);

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const error = jobs.find(
    (r) => r.status !== 200 && r.status !== 202 && new Date(r.timestamp).getTime() > fiveMinAgo
  );

  if (!error) return null;
  return {
    id: error.id,
    keyName: error.keyName,
    status: error.status,
    timestamp: error.timestamp,
  };
}

// -------------------------------------------------------------------------
// Keys
// -------------------------------------------------------------------------

export interface KeysData {
  keys: KeyRow[];
}

export async function getKeysData(): Promise<KeysData> {
  const { userId } = await requireUser({ autoRedirect: true });
  const { keys: keyStore } = getServices();
  const keys = await keyStore.list(userId);
  return {
    keys: keys.map((k) => ({
      id: k.id,
      displayName: k.displayName,
      value: k.key,
      usageKB: k.usageKB,
      quotaKB: k.quotaKB,
    })),
  };
}

// -------------------------------------------------------------------------
// Billing
// -------------------------------------------------------------------------

export interface BillingData {
  processedKB: number;
  freeRemainingKB: number | null;
  freeTotalKB: number | null;
  estimatedCost: number;
  pricePerUnit: number;
  invoices: Invoice[];
}

export async function getBillingData(): Promise<BillingData> {
  const { userId } = await requireUser({ autoRedirect: true });
  const [config, perms] = await Promise.all([
    getCurrentConfig(userId),
    getCurrentPermissions(userId),
  ]);
  const { billing } = getServices();

  const [usage, invoices] = await Promise.all([
    perms.stripeCustomerId
      ? billing.getUsage(perms.stripeCustomerId)
      : Promise.resolve({ totalUnits: 0, periodStart: "", periodEnd: "" }),
    perms.stripeCustomerId
      ? billing.getInvoices(perms.stripeCustomerId)
      : Promise.resolve([]),
  ]);

  const calc = calculateBilling({
    totalUnits: usage.totalUnits,
    freeUnits: config.freeUnits,
    pricePerUnit: config.pricePerUnit,
  });

  return {
    ...calc,
    pricePerUnit: config.pricePerUnit,
    invoices,
  };
}

// -------------------------------------------------------------------------
// History
// -------------------------------------------------------------------------

export interface HistoryData {
  requests: RequestRow[];
}

export async function getHistoryData(): Promise<HistoryData> {
  const { userId } = await requireUser({ autoRedirect: true });
  return { requests: await getJobsForUser(userId) };
}
