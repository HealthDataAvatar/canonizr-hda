/**
 * Append-only audit logging to Azure Table Storage.
 *
 * Two tables:
 *   AdminAuditLog — admin actions on users (block, unblock, update plan)
 *   UserAuditLog  — user self-service actions (key create, key delete, key rotate)
 */

import { TableClient } from "@azure/data-tables";
import { randomUUID } from "crypto";
import { TableName } from "./table-names";

function getClient(connectionString: string, table: string) {
  const opts = connectionString.includes("http://")
    ? { allowInsecureConnection: true }
    : {};
  return TableClient.fromConnectionString(connectionString, table, opts);
}

function rowKey(): string {
  // Reverse timestamp for newest-first ordering + UUID for uniqueness
  const ts = String(9999999999999 - Date.now()).padStart(13, "0");
  return `${ts}_${randomUUID().slice(0, 8)}`;
}

export async function logAdminAction(
  connectionString: string,
  opts: {
    adminId: string;
    adminEmail: string;
    targetUserId: string;
    action: string;
    detail?: Record<string, unknown>;
  }
) {
  const client = getClient(connectionString, TableName.ADMIN_AUDIT_LOG);
  await client.createEntity({
    partitionKey: opts.targetUserId,
    rowKey: rowKey(),
    adminId: opts.adminId,
    adminEmail: opts.adminEmail,
    action: opts.action,
    detail: opts.detail ? JSON.stringify(opts.detail) : "",
    timestamp: new Date().toISOString(),
  });
}

export async function logUserAction(
  connectionString: string,
  opts: {
    userId: string;
    userEmail: string;
    action: string;
    detail?: Record<string, unknown>;
  }
) {
  const client = getClient(connectionString, TableName.USER_AUDIT_LOG);
  await client.createEntity({
    partitionKey: opts.userId,
    rowKey: rowKey(),
    userEmail: opts.userEmail,
    action: opts.action,
    detail: opts.detail ? JSON.stringify(opts.detail) : "",
    timestamp: new Date().toISOString(),
  });
}
