/** Audit tables — append only. No update, no delete. */

import { randomUUID } from "crypto";
import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";

function rowKey(): string {
  const ts = String(9999999999999 - Date.now()).padStart(13, "0");
  return `${ts}_${randomUUID().slice(0, 8)}`;
}

export interface AdminAuditEntry {
  adminId: string;
  adminEmail: string;
  targetUserId: string;
  action: string;
  detail?: Record<string, unknown>;
}

export interface UserAuditEntry {
  userId: string;
  userEmail: string;
  action: string;
  detail?: Record<string, unknown>;
}

export async function appendAdminAudit(entry: AdminAuditEntry): Promise<void> {
  const client = getTableClient(TableName.ADMIN_AUDIT_LOG);
  await client.createEntity({
    partitionKey: entry.targetUserId,
    rowKey: rowKey(),
    adminId: entry.adminId,
    adminEmail: entry.adminEmail,
    action: entry.action,
    detail: entry.detail ? JSON.stringify(entry.detail) : "",
    timestamp: new Date().toISOString(),
  });
}

export async function appendUserAudit(entry: UserAuditEntry): Promise<void> {
  const client = getTableClient(TableName.USER_AUDIT_LOG);
  await client.createEntity({
    partitionKey: entry.userId,
    rowKey: rowKey(),
    userEmail: entry.userEmail,
    action: entry.action,
    detail: entry.detail ? JSON.stringify(entry.detail) : "",
    timestamp: new Date().toISOString(),
  });
}
