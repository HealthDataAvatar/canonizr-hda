/**
 * Ensure all required Azure Table Storage tables exist.
 *
 * Called once at app startup (via auth adapter init) and in test setup.
 * Single source of truth for which tables the system needs.
 */

import { TableClient } from "@azure/data-tables";
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
] as const;

let _done = false;

export async function ensureAllTables(connectionString: string): Promise<void> {
  if (_done) return;
  const opts = connectionString.includes("http://") ? { allowInsecureConnection: true } : {};
  await Promise.all(
    ALL_TABLES.map((name) =>
      TableClient.fromConnectionString(connectionString, name, opts)
        .createTable()
        .catch(() => {})
    )
  );
  _done = true;
}
