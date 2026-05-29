/**
 * Server-side data assembly for admin pages.
 *
 * Reads directly from Table Storage. No caching — admin traffic is low.
 */

import { TableClient } from "@azure/data-tables";
import { requireAdmin } from "./session";
import { getUserRecord } from "./table-storage";
import { getJobsForUser } from "./jobs";
import { getServices } from "./services";
import { TableName } from "./table-names";
import type { RequestRow } from "@/components/request-table";
import type { KeyRow } from "@/components/key-table";

function conn() {
  return process.env.TABLE_STORAGE_CONNECTION_STRING!;
}

function tableOpts(connectionString: string) {
  return connectionString.includes("http://") ? { allowInsecureConnection: true } : {};
}

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

export async function getUserList(): Promise<AdminUserRow[]> {
  await requireAdmin();
  const connectionString = conn();
  const opts = tableOpts(connectionString);
  const users = TableClient.fromConnectionString(connectionString, TableName.USERS, opts);
  const keys = TableClient.fromConnectionString(connectionString, TableName.API_KEYS, opts);
  const jobs = TableClient.fromConnectionString(connectionString, TableName.GW_JOBS, opts);

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
    for await (const j of jobs.listEntities({
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
  name: string;
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
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  await requireAdmin();
  const connectionString = conn();

  let record;
  try {
    record = await getUserRecord(connectionString, userId);
  } catch {
    return null;
  }

  const opts = tableOpts(connectionString);
  const usersTable = TableClient.fromConnectionString(connectionString, TableName.USERS, opts);

  let entity;
  try {
    entity = await usersTable.getEntity("user", userId);
  } catch {
    return null;
  }

  const { keys: keyStore } = getServices();
  const apiKeys = await keyStore.list(userId);

  const recentJobs = await getJobsForUser(connectionString, userId, 50);

  return {
    id: userId,
    email: record.email,
    name: (entity.name as string) ?? "",
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
  };
}
