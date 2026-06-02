import { describe, it, expect, vi, beforeEach } from "vitest";
import { setConnectionString, getTableClient } from "@/lib/data/table-client";

describe("table-client", () => {
  beforeEach(() => {
    // Reset to a known state
    setConnectionString("DefaultEndpointsProtocol=http;AccountName=test;AccountKey=dGVzdA==;TableEndpoint=http://localhost:10002/test");
  });

  it("returns a TableClient for the given table name", () => {
    const client = getTableClient("TestTable");
    expect(client).toBeDefined();
    expect(client.tableName).toBe("TestTable");
  });

  it("throws when no connection is configured", () => {
    // Clear the override and env
    setConnectionString(null);
    const savedConn = process.env.TABLE_STORAGE_CONNECTION_STRING;
    const savedUrl = process.env.TABLE_STORAGE_URL;
    delete process.env.TABLE_STORAGE_CONNECTION_STRING;
    delete process.env.TABLE_STORAGE_URL;
    try {
      expect(() => getTableClient("Test")).toThrow("TABLE_STORAGE_URL or TABLE_STORAGE_CONNECTION_STRING");
    } finally {
      if (savedConn) process.env.TABLE_STORAGE_CONNECTION_STRING = savedConn;
      if (savedUrl) process.env.TABLE_STORAGE_URL = savedUrl;
    }
  });
});
