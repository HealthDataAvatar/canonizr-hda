/**
 * Table Storage client factory.
 *
 * Single source of truth for connection string + insecure connection handling.
 * In tests, call `setConnectionString()` to point at Azurite.
 */

import { TableClient } from "@azure/data-tables";

let _connectionString: string | null = null;

/** Override the connection string (for tests). Pass null to clear. */
export function setConnectionString(conn: string | null) {
  _connectionString = conn;
}

function getConnectionString(): string {
  if (_connectionString) return _connectionString;
  const conn = process.env.TABLE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("TABLE_STORAGE_CONNECTION_STRING is not set");
  return conn;
}

export function getTableClient(table: string): TableClient {
  const conn = getConnectionString();
  const opts = conn.includes("http://") ? { allowInsecureConnection: true } : {};
  return TableClient.fromConnectionString(conn, table, opts);
}
