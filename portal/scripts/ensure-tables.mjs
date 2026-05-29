/**
 * Ensure all required Azure Table Storage tables exist.
 * Runs once at container startup before the server starts.
 *
 * Table names must match portal/lib/table-names.ts and gateway/app/tables.py.
 */

import { TableClient } from "@azure/data-tables";

const TABLE_NAMES = [
  "Users", "Accounts", "Sessions", "VerificationTokens",
  "ApiKeys", "Billing",
  "GwSubscriptions", "GwEncryptionKeys", "GwJobs",
];

const connStr = process.env.TABLE_STORAGE_CONNECTION_STRING;
if (!connStr) {
  console.warn("TABLE_STORAGE_CONNECTION_STRING not set — skipping table init");
  process.exit(0);
}

const opts = connStr.includes("http://") ? { allowInsecureConnection: true } : {};
await Promise.all(
  TABLE_NAMES.map((name) =>
    TableClient.fromConnectionString(connStr, name, opts)
      .createTable()
      .catch(() => {})
  )
);
console.log(`Tables ensured: ${TABLE_NAMES.join(", ")}`);
