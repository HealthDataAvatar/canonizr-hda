/**
 * Server-side data assembly for admin pages.
 *
 * Reads directly from Table Storage. No caching — admin traffic is low.
 */

import { requireAdmin } from "@/lib/auth/session";
import { getUser } from "@/lib/data/tables";
import { getJobsForUser } from "./jobs";
import { getServices } from "@/lib/services";
import { getTableClient } from "./table-client";
import { TableName } from "./table-names";
import type { RequestRow } from "@/components/request-table";
import type { KeyRow } from "@/components/key-table";
import { sumUsageSince, sumInvoiceAmounts } from "@/lib/pure/admin-calc";

// -------------------------------------------------------------------------
// User list
// -------------------------------------------------------------------------

export interface AdminUserRow {
  id: string;
  email: string;
  keyCount: number;
  jobCount30d: number;
  blocked: boolean;
  joined: string;
}

// TODO: This does N+1 queries (per user for keys + jobs). Fine for a handful
// of users but won't scale. Fetch full keys/jobs tables in bulk and aggregate
// in memory instead.
export async function getUserList(): Promise<AdminUserRow[]> {
  await requireAdmin({ autoRedirect: true });
  const users = getTableClient(TableName.USERS);
  const keys = getTableClient(TableName.API_KEYS);
  const jobs = getTableClient(TableName.GW_JOBS);

  const rows: AdminUserRow[] = [];

  for await (const entity of users.listEntities({
    queryOptions: { filter: "PartitionKey eq 'user'" },
  })) {
    const userId = entity.rowKey as string;

    let keyCount = 0;
    for await (const _k of keys.listEntities({
      queryOptions: { filter: `PartitionKey eq '${userId}'` },
    })) {
      keyCount++;
    }

    let jobCount = 0;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    for await (const _j of jobs.listEntities({
      queryOptions: {
        filter: `PartitionKey eq '${userId}' and created_at ge '${thirtyDaysAgo}'`,
      },
    })) {
      jobCount++;
    }

    rows.push({
      id: userId,
      email: (entity.email as string) ?? "",
      keyCount,
      jobCount30d: jobCount,
      blocked: (entity.blocked as boolean) ?? false,
      joined: (entity.emailVerified as string) ?? "",
    });
  }

  rows.sort((a, b) => (b.joined > a.joined ? 1 : -1));
  return rows;
}

// -------------------------------------------------------------------------
// User detail
// -------------------------------------------------------------------------

export interface AdminUserDetail {
  id: string;
  email: string;
  joined: string;
  blocked: boolean;
  isAdmin: boolean;
  freeUnits: number | null;
  maxKeys: number;
  pricePerUnit: number;
  notes: string;
  stripeCustomerId: string;
  keys: KeyRow[];
  recentJobs: RequestRow[];
  usageLast7dKB: number;
  totalInvoiced: number;
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  await requireAdmin({ autoRedirect: true });

  let record;
  try {
    record = await getUser(userId);
  } catch {
    return null;
  }

  const usersTable = getTableClient(TableName.USERS);

  let entity;
  try {
    entity = await usersTable.getEntity("user", userId);
  } catch {
    return null;
  }

  const { keys: keyStore } = getServices();
  const apiKeys = await keyStore.list(userId);

  const recentJobs = await getJobsForUser(userId, 50);

  const usageLast7dKB = sumUsageSince(recentJobs, Date.now() - 7 * 86_400_000);

  let totalInvoiced = 0;
  if (record.stripeCustomerId) {
    try {
      const { billing } = getServices();
      const invoices = await billing.getInvoices(record.stripeCustomerId);
      totalInvoiced = sumInvoiceAmounts(invoices);
    } catch {
      // Billing unavailable — leave as 0
    }
  }

  return {
    id: userId,
    email: record.email,
    joined: (entity.emailVerified as string) ?? "",
    blocked: record.blocked,
    isAdmin: record.isAdmin,
    freeUnits: record.freeUnits,
    maxKeys: record.maxKeys,
    pricePerUnit: record.pricePerUnit,
    notes: record.notes,
    stripeCustomerId: record.stripeCustomerId,
    keys: apiKeys.map((k) => ({
      id: k.id,
      displayName: k.displayName,
      keyHint: k.keyHint,
      createdDate: k.createdDate,
      lastUsed: k.lastUsed,
      usageKB: k.usageKB,
      quotaKB: k.quotaKB,
    })),
    recentJobs,
    usageLast7dKB,
    totalInvoiced,
  };
}
