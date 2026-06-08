/**
 * Server-side data assembly for portal pages.
 *
 * Each function returns everything a page needs, pre-joined and ready to render.
 * Called directly from server components — no API routes needed for reads.
 */

import { requireUser } from "@/lib/auth/session";
import { getServices, type Invoice } from "@/lib/services";
import { getCurrentConfig, getCurrentPermissions, appendPermissions, type BillingStatus } from "@/lib/data/tables";
import { getJobsForUser } from "./jobs";
import { calculateBilling } from "@/lib/pure/billing-calc";
import { getRedis } from "@/lib/redis";
import type { CanonizeJobRow } from "@/lib/pure/job-types";
import type { KeyRow } from "@/components/tables/key-table";

// -------------------------------------------------------------------------
// Recent error (used by layout error banner)
// -------------------------------------------------------------------------

import type { RecentError } from "@/components/error-banner";

export async function getRecentError(): Promise<RecentError | null> {
  const { userId } = await requireUser({ autoRedirect: true });
  const page = await getJobsForUser(userId, 10);

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const error = page.jobs.find(
    (r) => r.status === "error" && new Date(r.submittedAt).getTime() > fiveMinAgo
  );

  if (!error || error.status !== "error") return null;
  return {
    id: error.id,
    keyName: error.keyId,
    status: 500,
    timestamp: error.submittedAt,
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
  freeUsagePercent: number;
  pricePerUnit: number;
  invoices: Invoice[];
  billingStatus: BillingStatus;
  hasPaymentMethod: boolean;
}

async function invalidateBillingCache(userId: string) {
  const redis = getRedis();
  if (redis) await redis.del(`user:${userId}:billing_status`);
}

export async function getBillingData(): Promise<BillingData> {
  const { userId } = await requireUser({ autoRedirect: true });
  const [config, perms] = await Promise.all([
    getCurrentConfig(userId),
    getCurrentPermissions(userId),
  ]);
  const { billing } = getServices();

  const [usage, invoices, stripeHasPM] = await Promise.all([
    perms.stripeCustomerId
      ? billing.getUsage(perms.stripeCustomerId)
      : Promise.resolve({ totalUnits: 0, periodStart: "", periodEnd: "" }),
    perms.stripeCustomerId
      ? billing.getInvoices(perms.stripeCustomerId)
      : Promise.resolve([]),
    perms.stripeCustomerId
      ? billing.hasPaymentMethod(perms.stripeCustomerId)
      : Promise.resolve(false),
  ]);

  const calc = calculateBilling({
    totalUnits: usage.totalUnits,
    freeUnits: config.freeUnits,
    pricePerUnit: config.pricePerUnit,
  });

  // Sync hasPaymentMethod if Stripe disagrees with our record
  let hasPaymentMethod = perms.hasPaymentMethod;
  if (stripeHasPM !== perms.hasPaymentMethod) {
    hasPaymentMethod = stripeHasPM;
    await appendPermissions(userId, {
      ...perms,
      hasPaymentMethod: stripeHasPM,
      changedBy: "system",
    });
  }

  // Free tier exhaustion: set or clear billingStatus
  let billingStatus = perms.billingStatus;
  const freeExhausted = calc.freeRemainingKB === 0;

  if (freeExhausted && !hasPaymentMethod && billingStatus !== "past_due" && billingStatus !== "canceled") {
    if (billingStatus !== "free_exhausted") {
      billingStatus = "free_exhausted";
      await appendPermissions(userId, { ...perms, billingStatus, hasPaymentMethod, changedBy: "system" });
      await invalidateBillingCache(userId);
    }
  } else if (billingStatus === "free_exhausted" && (hasPaymentMethod || !freeExhausted)) {
    billingStatus = "active";
    await appendPermissions(userId, { ...perms, billingStatus, hasPaymentMethod, changedBy: "system" });
    await invalidateBillingCache(userId);
  }

  return {
    ...calc,
    pricePerUnit: config.pricePerUnit,
    invoices,
    billingStatus,
    hasPaymentMethod,
  };
}

// -------------------------------------------------------------------------
// History
// -------------------------------------------------------------------------

export interface HistoryData {
  jobs: CanonizeJobRow[];
  nextCursor: string | null;
}

export async function getHistoryData(): Promise<HistoryData> {
  const { userId } = await requireUser({ autoRedirect: true });
  const page = await getJobsForUser(userId);
  return { jobs: page.jobs, nextCursor: page.nextCursor };
}
