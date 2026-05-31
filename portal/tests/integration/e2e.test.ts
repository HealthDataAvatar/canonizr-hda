/**
 * End-to-end test: portal signup → key creation → gateway conversion.
 *
 * Verifies the contract between portal and gateway — that key creation
 * writes the correct Table Storage entries for the gateway to resolve
 * subscriptions to users and encryption keys.
 */

import { describe, it, expect, beforeAll } from "vitest";
import type { TestUser } from "./helpers";
import {
  authenticate,
  createFetcher,
  APIM_STUB_URL,
} from "./helpers";
import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";

let fetchPortal: ReturnType<typeof createFetcher>;
let testUser: TestUser;
let apiKey: string;
let subscriptionId: string;

beforeAll(async () => {
  const { cookie, user } = await authenticate();
  testUser = user;
  fetchPortal = createFetcher(cookie);

  // Create an API key via the portal
  const res = await fetchPortal("/api/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "e2e-test" }),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  apiKey = body.primaryKey;
  subscriptionId = body.id;
}, 30_000);

describe("gateway table contract", () => {
  it("subscription → user mapping written to gateway users table", async () => {
    const gwSubs = getTableClient(TableName.GW_SUBSCRIPTIONS);
    const entity = await gwSubs.getEntity("subscription", subscriptionId);
    expect(entity.user_id).toBe(testUser.id);
    expect(entity.key_name).toBe("e2e-test");
  });

  it("encryption key written to gateway encryptionkeys table", async () => {
    const gwKeys = getTableClient(TableName.GW_ENCRYPTION_KEYS);
    const entity = await gwKeys.getEntity("key", testUser.id);
    expect(entity.key_hex).toBeTruthy();
    expect((entity.key_hex as string).length).toBe(64);
  });
});

describe("gateway accepts portal-issued key", () => {
  it("POST /v1/jobs returns 202 with correct fields", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["Hello from e2e"], { type: "text/plain" }), "test.txt");

    const res = await fetch(`${APIM_STUB_URL}/v1/jobs`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
      body: formData,
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.job_id).toBeTruthy();
    expect(body.poll_url).toBeTruthy();
    expect(body.estimated_seconds).toBeGreaterThan(0);
    expect(body.input_bytes).toBe(14);
    expect(body.billable_units).toBe(1);
  });
});
