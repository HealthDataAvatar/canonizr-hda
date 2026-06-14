/**
 * Server-side data assembly for portal pages.
 *
 * Each function returns everything a page needs, pre-joined and ready to render.
 * Called directly from server components -- no API routes needed for reads.
 */

import { requireUser } from "@/lib/auth/session";
import { getServices, type Invoice } from "@/lib/services";
import { getCurrentConfig, getCurrentPermissions } from "@/lib/data/tables";
import { getJobsForUser } from "./jobs";
import { calculateBilling } from "@/lib/pure/billing-calc";
import { currentPeriodStart, quotaUsageKey } from "@/lib/pure/billing-period";
import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-interface";
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
}

/** Sum real-time usage across all keys from Redis, falling back to
 *  GwUserJobs on cache miss. Seeds Redis if reconstructed from tables. */
async function getCurrentUsageUnits(userId: string): Promise<number> {
  // Get billing anchor
  const gwBilling = getTableClient(TableName.GW_BILLING);
  let anchorDay = 1;
  try {
    const entity = await gwBilling.getEntity("billing", userId);
    anchorDay = (entity.billing_anchor_day as number) ?? 1;
  } catch { /* no billing record */ }

  const ps = currentPeriodStart(anchorDay);
  const redis = getRedis();

  // Try Redis first
  if (redis) {
    const apiKeys = getTableClient(TableName.API_KEYS);
    const entities = apiKeys.listEntities({
      queryOptions: { filter: `PartitionKey eq '${userId}'` },
    });

    let totalBytes = 0;
    let anyHit = false;
    const keyIds: string[] = [];
    for await (const e of entities) {
      const subId = e.rowKey as string;
      keyIds.push(subId);
      const val = await redis.get(quotaUsageKey(subId, ps));
      if (val !== null) {
        anyHit = true;
        totalBytes += Number(val);
      }
    }

    if (anyHit) {
      return totalBytes > 0 ? Math.ceil(totalBytes / 100_000) : 0;
    }
    // All keys returned null — fall through to table reconstruction
  }

  // Cache miss — reconstruct from GwUserJobs and seed Redis
  const totalBytes = await reconstructUsageFromTable(userId, ps, redis);
  return totalBytes > 0 ? Math.ceil(totalBytes / 100_000) : 0;
}

/** Sum input_bytes from GwUserJobs for completed jobs in the current period.
 *  Seeds per-key counters in Redis so subsequent reads are fast. */
async function reconstructUsageFromTable(
  userId: string,
  periodStart: string,
  redis: ReturnType<typeof getRedis>,
): Promise<number> {
  const gwUserJobs = getTableClient(TableName.GW_USER_JOBS);
  const entities = gwUserJobs.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${userId}' and status eq 'ok' and completed_at ge '${periodStart}T00:00:00Z'`,
    },
  });

  // Accumulate per-key bytes so we can seed Redis per-key
  const perKey = new Map<string, number>();
  for await (const e of entities) {
    const keyId = (e.key_id as string) ?? "";
    const bytes = Number(e.input_bytes ?? 0);
    if (keyId && bytes > 0) {
      perKey.set(keyId, (perKey.get(keyId) ?? 0) + bytes);
    }
  }

  // Seed Redis per-key
  if (redis && perKey.size > 0) {
    for (const [keyId, bytes] of perKey) {
      await redis.set(quotaUsageKey(keyId, periodStart), String(bytes));
    }
  }

  let total = 0;
  for (const bytes of perKey.values()) total += bytes;
  return total;
}

export async function getBillingData(): Promise<BillingData> {
  const { userId } = await requireUser({ autoRedirect: true });
  const [config, perms] = await Promise.all([
    getCurrentConfig(userId),
    getCurrentPermissions(userId),
  ]);
  const { billing } = getServices();

  const [totalUnits, invoices] = await Promise.all([
    getCurrentUsageUnits(userId),
    perms.stripeCustomerId
      ? billing.getInvoices(perms.stripeCustomerId)
      : Promise.resolve([]),
  ]);

  const calc = calculateBilling({
    totalUnits,
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
  jobs: CanonizeJobRow[];
  nextCursor: string | null;
}

export async function getHistoryData(): Promise<HistoryData> {
  const { userId } = await requireUser({ autoRedirect: true });
  const page = await getJobsForUser(userId);
  return { jobs: page.jobs, nextCursor: page.nextCursor };
}
