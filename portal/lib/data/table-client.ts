/**
 * Table Storage client factory.
 *
 * Single source of truth for Table Storage access.
 * Production: TABLE_STORAGE_URL + DefaultAzureCredential (managed identity).
 * Local dev / Azurite: TABLE_STORAGE_CONNECTION_STRING.
 * Tests: call setConnectionString() to point at Azurite.
 */

import { TableClient } from "@azure/data-tables";
import type { TokenCredential } from "@azure/identity";

let _connectionString: string | null = null;
let _credential: TokenCredential | null = null;

/** Override the connection string (for tests). Pass null to clear. */
export function setConnectionString(conn: string | null) {
  _connectionString = conn;
}

function getCredential(): TokenCredential {
  if (!_credential) {
    // Lazy import to avoid loading @azure/identity in local dev / tests
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DefaultAzureCredential } = require("@azure/identity");
    _credential = new DefaultAzureCredential();
  }
  return _credential;
}

export function getTableClient(table: string): TableClient {
  // Test override — always wins
  if (_connectionString) {
    const opts = _connectionString.includes("http://") ? { allowInsecureConnection: true } : {};
    return TableClient.fromConnectionString(_connectionString, table, opts);
  }

  // Production — endpoint + managed identity
  const url = process.env.TABLE_STORAGE_URL;
  if (url) {
    return new TableClient(url, table, getCredential());
  }

  // Local dev — connection string from env
  const conn = process.env.TABLE_STORAGE_CONNECTION_STRING;
  if (conn) {
    const opts = conn.includes("http://") ? { allowInsecureConnection: true } : {};
    return TableClient.fromConnectionString(conn, table, opts);
  }

  throw new Error("Set TABLE_STORAGE_URL or TABLE_STORAGE_CONNECTION_STRING");
}
