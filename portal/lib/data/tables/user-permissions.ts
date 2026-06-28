/** UserPermissions table — append-only permission and account state. */

import { getTableClient } from "@/lib/data/table-client";
import { TableName, UserPermissionsRecord } from "@/lib/data/table-interface";
import { invertedTimestampRK, getLatest } from "./append-only";

const DEFAULTS: Omit<UserPermissionsRecord, "changedBy" | "timestamp"> = {
  isAdmin: false,
  blocked: false,
  delinquent: false,
  stripeCustomerId: "",
};

export async function getCurrentPermissions(userId: string): Promise<UserPermissionsRecord> {
  const client = getTableClient(TableName.USER_PERMISSIONS);
  const row = await getLatest<Record<string, unknown>>(client, userId);

  if (!row) {
    return { ...DEFAULTS, changedBy: "system", timestamp: "" };
  }

  return {
    isAdmin: (row.isAdmin as boolean) ?? false,
    blocked: (row.blocked as boolean) ?? false,
    delinquent: (row.delinquent as boolean) ?? false,
    stripeCustomerId: (row.stripeCustomerId as string) ?? "",
    changedBy: (row.changedBy as string) ?? "system",
    timestamp: (row.timestamp as string) ?? "",
  };
}

export async function appendPermissions(
  userId: string,
  perms: Omit<UserPermissionsRecord, "timestamp">,
): Promise<void> {
  const client = getTableClient(TableName.USER_PERMISSIONS);
  await client.upsertEntity({
    partitionKey: userId,
    rowKey: invertedTimestampRK(),
    timestamp: new Date().toISOString(),
    isAdmin: perms.isAdmin,
    blocked: perms.blocked,
    delinquent: perms.delinquent,
    stripeCustomerId: perms.stripeCustomerId,
    changedBy: perms.changedBy,
  });
}

/** Append a permission record toggling the user's blocked flag. */
export async function setUserBlocked(userId: string, blocked: boolean, changedBy: string): Promise<void> {
  const current = await getCurrentPermissions(userId);
  await appendPermissions(userId, { ...current, blocked, changedBy });
}

/** Append a permission record toggling the user's delinquent (payment) flag. */
export async function setUserDelinquent(userId: string, delinquent: boolean, changedBy: string): Promise<void> {
  const current = await getCurrentPermissions(userId);
  await appendPermissions(userId, { ...current, delinquent, changedBy });
}
