/**
 * Server-side data assembly for portal pages.
 *
 * Each function returns everything a page needs, pre-joined and ready to render.
 * Called directly from server components — no API routes needed for reads.
 */

import { requireUser } from "./session";
import { listSubscriptions, type ApimKey } from "./apim";
import { getUsage } from "./stripe";
import { getUserRecord } from "./table-storage";
import { getRecentRequests } from "./app-insights";
import type { RequestRow, BlobState } from "@/components/request-table";
import type { KeyRow } from "@/components/key-table";

const KB_PER_UNIT = 100;

// -------------------------------------------------------------------------
// Dashboard
// -------------------------------------------------------------------------

export interface DashboardData {
  hasKeys: boolean;
  recentError: {
    id: string;
    keyName: string;
    subscriptionId: string;
    status: number;
    timestamp: string;
  } | null;
}

export async function getDashboardData(): Promise<DashboardData> {
  const { userId } = await requireUser();
  const keys = await listSubscriptions(userId);
  const keyMap = buildKeyMap(keys);

  const requests = await getRecentRequests(keys.map((k) => k.id));
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const error = requests.find(
    (r) => r.status !== 200 && new Date(r.timestamp).getTime() > fiveMinAgo
  );

  return {
    hasKeys: keys.length > 0,
    recentError: error
      ? {
          id: error.id,
          keyName: keyMap[error.subscriptionId] ?? error.subscriptionId,
          subscriptionId: error.subscriptionId,
          status: error.status,
          timestamp: error.timestamp,
        }
      : null,
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
  const keys = await listSubscriptions(userId);
  return {
    keys: keys.map((k) => ({
      id: k.id,
      displayName: k.displayName,
      createdDate: k.createdDate,
      lastUsed: k.lastUsed,
      usageKB: k.usageKB,
      quotaKB: k.quotaKB,
    })),
  };
}

// -------------------------------------------------------------------------
// Usage
// -------------------------------------------------------------------------

export interface UsageData {
  processedKB: number;
  freeRemainingKB: number | null;
  freeTotalKB: number | null;
  estimatedCost: number;
  requests: RequestRow[];
}

export async function getUsageData(): Promise<UsageData> {
  const { userId } = await requireUser();
  const connectionString = process.env.TABLE_STORAGE_CONNECTION_STRING!;
  const userRecord = await getUserRecord(connectionString, userId);
  const keys = await listSubscriptions(userId);
  const keyMap = buildKeyMap(keys);

  const [usage, requests] = await Promise.all([
    userRecord.stripeCustomerId
      ? getUsage(userRecord.stripeCustomerId)
      : Promise.resolve({ totalUnits: 0, periodStart: "", periodEnd: "" }),
    getRecentRequests(keys.map((k) => k.id)),
  ]);

  const totalUnits = usage.totalUnits;
  const freeUnits = userRecord.freeUnits;
  const pricePerUnit = userRecord.pricePerUnit;

  const none: BlobState = { status: "none" };

  return {
    processedKB: totalUnits * KB_PER_UNIT,
    freeRemainingKB:
      freeUnits !== null
        ? Math.max(0, freeUnits - totalUnits) * KB_PER_UNIT
        : null,
    freeTotalKB: freeUnits !== null ? freeUnits * KB_PER_UNIT : null,
    estimatedCost:
      Math.max(0, totalUnits - (freeUnits ?? 0)) * (pricePerUnit ?? 0.003),
    requests: requests.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      keyName: keyMap[r.subscriptionId] ?? r.subscriptionId,
      inputSizeBytes: r.inputSizeBytes,
      processingTimeMs: r.processingTimeMs,
      pipeline: r.pipeline,
      status: r.status,
      // Blob state will come from job index (Table Storage) once built.
      // For now, all blobs show as unavailable.
      result: none,
      input: none,
    })),
  };
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function buildKeyMap(keys: ApimKey[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const k of keys) map[k.id] = k.displayName;
  return map;
}
