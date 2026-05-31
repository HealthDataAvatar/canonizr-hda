/** UserPermissions table — append-only permission and account state. */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";
import { invertedTimestampRK, getLatest } from "./append-only";

export interface UserPermissionsRecord {
  isAdmin: boolean;
  blocked: boolean;
  stripeCustomerId: string;
  changedBy: string;
  timestamp: string;
}

const DEFAULTS: Omit<UserPermissionsRecord, "changedBy" | "timestamp"> = {
  isAdmin: false,
  blocked: false,
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
    stripeCustomerId: perms.stripeCustomerId,
    changedBy: perms.changedBy,
  });
}
