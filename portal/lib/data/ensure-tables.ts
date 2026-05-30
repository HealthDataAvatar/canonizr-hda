/**
 * Ensure all required Azure Table Storage tables exist.
 *
 * Called once at app startup and in test setup.
 * Uses getTableClient — no direct connection string access.
 */

import { getTableClient } from "./table-client";
import { TableName } from "./table-names";

const ALL_TABLES = [
  // Auth adapter
  TableName.USERS,
  TableName.ACCOUNTS,
  TableName.SESSIONS,
  TableName.VERIFICATION_TOKENS,

  // Portal services
  TableName.API_KEYS,
  TableName.BILLING,

  // Gateway shared
  TableName.GW_SUBSCRIPTIONS,
  TableName.GW_ENCRYPTION_KEYS,
  TableName.GW_JOBS,

  // Audit
  TableName.ADMIN_AUDIT_LOG,
  TableName.USER_AUDIT_LOG,
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
