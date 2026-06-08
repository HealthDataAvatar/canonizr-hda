/**
 * Table Storage integration tests against Azurite.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { initTables, seedJob } from "./helpers";
import { AzureTableStorageAdapter } from "@/lib/services/auth-adapter";
import { getJobsForUser } from "@/lib/data/jobs";

// ---------------------------------------------------------------------------
// Verification tokens
// ---------------------------------------------------------------------------

describe("verification tokens", () => {
  const adapter = AzureTableStorageAdapter();

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
  const adapter = AzureTableStorageAdapter();

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
    const { jobs } = await getJobsForUser("no-such-user");
    expect(jobs).toEqual([]);
  });

  it("returns seeded jobs", async () => {
    await seedJob(userId);
    await seedJob(userId);
    const { jobs } = await getJobsForUser(userId);
    expect(jobs.length).toBe(2);
  });

  it("maps fields correctly", async () => {
    const jobId = await seedJob(userId, {
      input_bytes: 250000,
      status: "ok",
      key_id: "my-key",
    });
    const { jobs } = await getJobsForUser(userId);
    const row = jobs.find((r: { id: string }) => r.id === jobId)!;
    expect(row.status).toBe("ok");
    expect(row.keyId).toBe("my-key");
    expect(row.inputBytes).toBe(250000);
  });

  it("maps processing and error statuses", async () => {
    await seedJob(userId, { status: "processing" });
    await seedJob(userId, { status: "error" });
    const { jobs } = await getJobsForUser(userId);
    expect(jobs.find((r: { status: string }) => r.status === "processing")).toBeTruthy();
    expect(jobs.find((r: { status: string }) => r.status === "error")).toBeTruthy();
  });

  it("respects pageSize", async () => {
    const uid = `limit-${Date.now()}`;
    await seedJob(uid);
    await seedJob(uid);
    await seedJob(uid);
    const { jobs } = await getJobsForUser(uid, 2);
    expect(jobs.length).toBe(2);
  });

  it("paginates with cursor", async () => {
    const uid = `cursor-${Date.now()}`;
    await seedJob(uid, { created_at: "2026-01-01T00:00:00Z" });
    await seedJob(uid, { created_at: "2026-02-01T00:00:00Z" });
    await seedJob(uid, { created_at: "2026-03-01T00:00:00Z" });

    // Page 1: newest 2
    const page1 = await getJobsForUser(uid, 2);
    expect(page1.jobs.length).toBe(2);
    expect(page1.nextCursor).not.toBeNull();

    // Page 2: remaining 1
    const page2 = await getJobsForUser(uid, 2, page1.nextCursor!);
    expect(page2.jobs.length).toBe(1);
    expect(page2.nextCursor).toBeNull();

    // No overlap between pages
    const allIds = [...page1.jobs, ...page2.jobs].map((r: { id: string }) => r.id);
    expect(new Set(allIds).size).toBe(3);
  });

  it("returns null cursor when all results fit in one page", async () => {
    const uid = `nocursor-${Date.now()}`;
    await seedJob(uid);
    const { jobs, nextCursor } = await getJobsForUser(uid, 20);
    expect(jobs.length).toBe(1);
    expect(nextCursor).toBeNull();
  });

  it("sorts by timestamp descending", async () => {
    const uid = `sort-${Date.now()}`;
    await seedJob(uid, { created_at: "2026-01-01T00:00:00Z" });
    await seedJob(uid, { created_at: "2026-06-01T00:00:00Z" });
    await seedJob(uid, { created_at: "2026-03-01T00:00:00Z" });
    const { jobs } = await getJobsForUser(uid);
    const ts = jobs.map((r: { submittedAt: string }) => r.submittedAt);
    expect(ts).toEqual([...ts].sort().reverse());
  });
});
