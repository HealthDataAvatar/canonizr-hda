/**
 * Ensure all required Azure Table Storage tables exist.
 *
 * Called once at app startup and in test setup.
 * Uses getTableClient — no direct connection string access.
 */

import { getTableClient } from "./table-client";
import { TableName } from "./table-interface";

const ALL_TABLES = [
  // Auth adapter
  TableName.USERS,
  TableName.ACCOUNTS,
  TableName.SESSIONS,
  TableName.VERIFICATION_TOKENS,

  // User data (append-only)
  TableName.USER_CONFIG,
  TableName.USER_PERMISSIONS,

  // Portal services
  TableName.API_KEYS,
  TableName.BILLING,

  // Gateway shared
  TableName.GW_SUBSCRIPTIONS,
  TableName.GW_ENCRYPTION_KEYS,
  TableName.GW_JOBS,
  TableName.GW_USER_JOBS,
  TableName.GW_API_KEYS,
] as const;

let _done = false;

export async function ensureAllTables(): Promise<void> {
  if (_done) return;
  await Promise.all(
    ALL_TABLES.map((name) =>
      getTableClient(name).createTable().catch(() => {})
    )
  );
  _done = true;
}
