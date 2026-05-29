/**
 * Server-side data assembly for portal pages.
 *
 * Each function returns everything a page needs, pre-joined and ready to render.
 * Called directly from server components — no API routes needed for reads.
 */

import { requireUser } from "./session";
import { getServices, type Invoice } from "./services";
import { getUserRecord } from "./table-storage";
import { getJobsForUser } from "./jobs";
import type { RequestRow } from "@/components/request-table";
import type { KeyRow } from "@/components/key-table";

const KB_PER_UNIT = 100;

// -------------------------------------------------------------------------
// Recent error (used by layout error banner)
// -------------------------------------------------------------------------

import type { RecentError } from "@/components/error-banner";

export async function getRecentError(): Promise<RecentError | null> {
  const { userId } = await requireUser();
  const connectionString = process.env.TABLE_STORAGE_CONNECTION_STRING!;
  const jobs = await getJobsForUser(connectionString, userId, 10);

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
  const { userId } = await requireUser();
  const { keys: keyStore } = getServices();
  const keys = await keyStore.list(userId);
  return {
    keys: keys.map((k) => ({
      id: k.id,
      displayName: k.displayName,
      keyHint: k.keyHint,
      createdDate: k.createdDate,
      lastUsed: k.lastUsed,
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
  const { userId } = await requireUser();
  const connectionString = process.env.TABLE_STORAGE_CONNECTION_STRING!;
  const userRecord = await getUserRecord(connectionString, userId);
  const { billing } = getServices();

  const [usage, invoices] = await Promise.all([
    userRecord.stripeCustomerId
      ? billing.getUsage(userRecord.stripeCustomerId)
      : Promise.resolve({ totalUnits: 0, periodStart: "", periodEnd: "" }),
    userRecord.stripeCustomerId
      ? billing.getInvoices(userRecord.stripeCustomerId)
      : Promise.resolve([]),
  ]);

  const totalUnits = usage.totalUnits;
  const freeUnits = userRecord.freeUnits;
  const pricePerUnit = userRecord.pricePerUnit;

  return {
    processedKB: totalUnits * KB_PER_UNIT,
    freeRemainingKB:
      freeUnits !== null
        ? Math.max(0, freeUnits - totalUnits) * KB_PER_UNIT
        : null,
    freeTotalKB: freeUnits !== null ? freeUnits * KB_PER_UNIT : null,
    estimatedCost:
      Math.max(0, totalUnits - (freeUnits ?? 0)) * (pricePerUnit ?? 0.003),
    pricePerUnit: pricePerUnit ?? 0.003,
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
  const { userId } = await requireUser();
  const connectionString = process.env.TABLE_STORAGE_CONNECTION_STRING!;
  return { requests: await getJobsForUser(connectionString, userId) };
}
