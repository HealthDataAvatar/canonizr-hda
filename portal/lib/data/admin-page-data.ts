/**
 * Server-side data assembly for admin pages.
 *
 * Reads directly from Table Storage. No caching — admin traffic is low.
 */

import { requireAdmin } from "@/lib/auth/session";
import { getJobsForUser } from "./jobs";
import { getServices } from "@/lib/services";
import { getTableClient } from "./table-client";
import { TableName } from "./table-interface";
import type { KeyRow } from "@/components/tables/key-table";
import { aggregateJobs, sumInvoiceAmounts, type JobSummaryInput } from "@/lib/pure/admin-calc";
import { getCurrentPermissions } from "./tables/user-permissions";
import { getCurrentConfig } from "./tables/user-config";

// -------------------------------------------------------------------------
// User list
// -------------------------------------------------------------------------

export interface AdminUserRow {
  id: string;
  email: string;
  keyCount: number;
  jobCount30d: number;
  errorCount30d: number;
  usageKB30d: number;
  blocked: boolean;
  joined: string;
  stripeCustomerId: string;
}

// TODO: This does N+1 queries (per user for keys + jobs). Fine for a handful
// of users but won't scale. Fetch full keys/jobs tables in bulk and aggregate
// in memory instead.
export async function getUserList(): Promise<AdminUserRow[]> {
  await requireAdmin({ autoRedirect: true });
  const users = getTableClient(TableName.USERS);
  const keys = getTableClient(TableName.API_KEYS);
  const jobs = getTableClient(TableName.GW_USER_JOBS);

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

    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const jobInputs: JobSummaryInput[] = [];
    for await (const j of jobs.listEntities({
      queryOptions: {
        filter: `PartitionKey eq '${userId}' and created_at ge '${new Date(thirtyDaysAgo).toISOString()}'`,
      },
    })) {
      jobInputs.push({
        timestamp: (j.created_at as string) ?? "",
        inputBytes: Number(j.input_bytes ?? 0),
        status: (j.status as string) ?? "",
      });
    }

    const stats = aggregateJobs(jobInputs, thirtyDaysAgo);
    const perms = await getCurrentPermissions(userId);

    rows.push({
      id: userId,
      email: (entity.email as string) ?? "",
      keyCount,
      jobCount30d: stats.count,
      errorCount30d: stats.errorCount,
      usageKB30d: stats.billableKB,
      blocked: perms.blocked,
      joined: (entity.emailVerified as string) ?? "",
      stripeCustomerId: perms.stripeCustomerId,
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
  spendCapUnits: number | null;
  adminCapUnits: number | null;
  paidEnabled: boolean;
  comp: boolean;
  stripeCustomerId: string;
  keys: KeyRow[];
  usageKB30d: number;
  totalInvoiced: number;
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  await requireAdmin({ autoRedirect: true });

  const usersTable = getTableClient(TableName.USERS);
  let entity;
  try {
    entity = await usersTable.getEntity("user", userId);
  } catch {
    return null;
  }

  const [config, perms] = await Promise.all([
    getCurrentConfig(userId),
    getCurrentPermissions(userId),
  ]);

  const { keys: keyStore } = getServices();
  const apiKeys = await keyStore.list(userId);

  const jobPage = await getJobsForUser(userId, 100);
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  const stats = aggregateJobs(
    jobPage.jobs.map((j) => ({
      timestamp: j.submittedAt,
      inputBytes: j.inputBytes,
      status: j.status === "error" ? "error" : "ok",
    })),
    thirtyDaysAgo,
  );

  let totalInvoiced = 0;
  if (perms.stripeCustomerId) {
    try {
      const { billing } = getServices();
      const invoices = await billing.getInvoices(perms.stripeCustomerId);
      totalInvoiced = sumInvoiceAmounts(invoices);
    } catch {
      // Billing unavailable — leave as 0
    }
  }

  return {
    id: userId,
    email: entity.email as string,
    joined: (entity.emailVerified as string) ?? "",
    blocked: perms.blocked,
    isAdmin: perms.isAdmin,
    freeUnits: config.freeUnits,
    maxKeys: config.maxKeys,
    spendCapUnits: config.spendCapUnits,
    adminCapUnits: config.adminCapUnits,
    paidEnabled: config.paidEnabled,
    comp: config.comp,
    stripeCustomerId: perms.stripeCustomerId,
    keys: apiKeys.map((k) => ({
      id: k.id,
      displayName: k.displayName,
      value: k.key,
      createdDate: k.createdDate,
      lastUsed: k.lastUsed,
      usageKB: k.usageKB,
      quotaKB: k.quotaKB,
    })),
    usageKB30d: stats.billableKB,
    totalInvoiced,
  };
}
