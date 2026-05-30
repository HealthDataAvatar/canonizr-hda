/**
 * Table Storage integration tests against Azurite.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { AZURITE_CONN, initTables, seedJob } from "./helpers";

// Import adapter without mocking
vi.stubEnv("TABLE_STORAGE_CONNECTION_STRING", AZURITE_CONN);
const { AzureTableStorageAdapter } = await import("../../lib/services/table-storage");
const { getJobsForUser } = await import("../../lib/data/jobs");

// ---------------------------------------------------------------------------
// Verification tokens
// ---------------------------------------------------------------------------

describe("verification tokens", () => {
  const adapter = AzureTableStorageAdapter(AZURITE_CONN);

  it("creates and consumes a token", async () => {
    const token = {
      identifier: `vt-${Date.now()}@example.com`,
      token: "tok-" + Date.now(),
      expires: new Date(Date.now() + 60_000),
    };

    await adapter.createVerificationToken!(token);
    const result = await adapter.useVerificationToken!({
      identifier: token.identifier,
      token: token.token,
    });

    expect(result).not.toBeNull();
    expect(result!.identifier).toBe(token.identifier);
    expect(result!.token).toBe(token.token);
  });

  it("token is deleted after use", async () => {
    const id = `del-${Date.now()}@example.com`;
    const tok = "tok-" + Date.now();
    await adapter.createVerificationToken!({ identifier: id, token: tok, expires: new Date(Date.now() + 60_000) });
    await adapter.useVerificationToken!({ identifier: id, token: tok });
    expect(await adapter.useVerificationToken!({ identifier: id, token: tok })).toBeNull();
  });

  it("upsert overwrites existing token", async () => {
    const id = `upsert-${Date.now()}@example.com`;
    await adapter.createVerificationToken!({ identifier: id, token: "old", expires: new Date(Date.now() + 60_000) });
    await adapter.createVerificationToken!({ identifier: id, token: "new", expires: new Date(Date.now() + 60_000) });

    expect(await adapter.useVerificationToken!({ identifier: id, token: "old" })).toBeNull();

    const result = await adapter.useVerificationToken!({ identifier: id, token: "new" });
    expect(result).not.toBeNull();
    expect(result!.token).toBe("new");
  });
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe("users", () => {
  const adapter = AzureTableStorageAdapter(AZURITE_CONN);

  it("creates and retrieves a user", async () => {
    const user = await adapter.createUser!({
      id: `user-${Date.now()}`,
      email: `user-${Date.now()}@example.com`,
      emailVerified: null,
    } as any);
    expect(user.id).toBeTruthy();

    const fetched = await adapter.getUser!(user.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.email).toBe(user.email);
  });

  it("getUserByEmail returns null for unknown email", async () => {
    expect(await adapter.getUserByEmail!("nonexistent@example.com")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Jobs (history)
// ---------------------------------------------------------------------------

describe("getJobsForUser", () => {
  const userId = `jobs-test-${Date.now()}`;

  beforeAll(async () => {
    await initTables();
  });

  it("returns empty for user with no jobs", async () => {
    const rows = await getJobsForUser(AZURITE_CONN, "no-such-user");
    expect(rows).toEqual([]);
  });

  it("returns seeded jobs", async () => {
    await seedJob(userId);
    await seedJob(userId);
    const rows = await getJobsForUser(AZURITE_CONN, userId);
    expect(rows.length).toBe(2);
  });

  it("maps fields correctly", async () => {
    const jobId = await seedJob(userId, {
      input_bytes: 250000,
      status: "ok",
      key_name: "my-key",
      input_hash: "deadbeef",
    });
    const rows = await getJobsForUser(AZURITE_CONN, userId);
    const row = rows.find((r) => r.id === jobId)!;
    expect(row.status).toBe(200);
    expect(row.keyName).toBe("my-key");
    expect(row.fileHash).toBe("deadbeef");
    expect(row.billableKB).toBeGreaterThan(0);
  });

  it("maps processing → 202, error → 500", async () => {
    await seedJob(userId, { status: "processing" });
    await seedJob(userId, { status: "error" });
    const rows = await getJobsForUser(AZURITE_CONN, userId);
    expect(rows.find((r) => r.status === 202)).toBeTruthy();
    expect(rows.find((r) => r.status === 500)).toBeTruthy();
  });

  it("respects limit", async () => {
    const uid = `limit-${Date.now()}`;
    await seedJob(uid);
    await seedJob(uid);
    await seedJob(uid);
    expect((await getJobsForUser(AZURITE_CONN, uid, 2)).length).toBe(2);
  });

  it("sorts by timestamp descending", async () => {
    const uid = `sort-${Date.now()}`;
    await seedJob(uid, { created_at: "2026-01-01T00:00:00Z" });
    await seedJob(uid, { created_at: "2026-06-01T00:00:00Z" });
    await seedJob(uid, { created_at: "2026-03-01T00:00:00Z" });
    const rows = await getJobsForUser(AZURITE_CONN, uid);
    const ts = rows.map((r) => r.timestamp);
    expect(ts).toEqual([...ts].sort().reverse());
  });
});
