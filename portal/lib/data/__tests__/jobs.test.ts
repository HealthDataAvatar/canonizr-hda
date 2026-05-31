import { describe, it, expect, vi } from "vitest";
import type { JobRecord } from "@/lib/data/tables";

vi.mock("@/lib/data/tables", () => ({
  listJobsForUser: vi.fn(),
}));

import { listJobsForUser } from "@/lib/data/tables";
import { getJobsForUser } from "@/lib/data/jobs";

const mockList = vi.mocked(listJobsForUser);

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-1",
    timestamp: "2026-05-30T10:00:00Z",
    keyName: "my-key",
    billableKB: 100,
    inputBytes: 100000,
    status: "ok",
    ...overrides,
  };
}

describe("getJobsForUser", () => {
  it("maps status ok to 200", async () => {
    mockList.mockResolvedValue([job({ status: "ok" })]);
    const rows = await getJobsForUser("user-1");
    expect(rows[0].status).toBe(200);
  });

  it("maps status processing to 202", async () => {
    mockList.mockResolvedValue([job({ status: "processing" })]);
    const rows = await getJobsForUser("user-1");
    expect(rows[0].status).toBe(202);
  });

  it("maps status error to 500", async () => {
    mockList.mockResolvedValue([job({ status: "error" })]);
    const rows = await getJobsForUser("user-1");
    expect(rows[0].status).toBe(500);
  });

  it("deleted job has blob status none", async () => {
    mockList.mockResolvedValue([job({ status: "deleted" })]);
    const rows = await getJobsForUser("user-1");
    expect(rows[0].result.status).toBe("none");
    expect(rows[0].input.status).toBe("none");
  });

  it("processing job has blob status processing", async () => {
    mockList.mockResolvedValue([job({ status: "processing" })]);
    const rows = await getJobsForUser("user-1");
    expect(rows[0].result.status).toBe("processing");
  });

  it("expired retention has blob status expired", async () => {
    mockList.mockResolvedValue([job({
      retentionExpires: "2020-01-01T00:00:00Z",
    })]);
    const rows = await getJobsForUser("user-1");
    expect(rows[0].result.status).toBe("expired");
  });

  it("passes through scalar fields", async () => {
    mockList.mockResolvedValue([job({
      id: "j-42",
      timestamp: "2026-05-30T12:00:00Z",
      completedAt: "2026-05-30T12:01:00Z",
      keyName: "test-key",
      fileHash: "abc123",
      billableKB: 250,
    })]);
    const rows = await getJobsForUser("user-1");
    expect(rows[0]).toMatchObject({
      id: "j-42",
      timestamp: "2026-05-30T12:00:00Z",
      completedAt: "2026-05-30T12:01:00Z",
      keyName: "test-key",
      fileHash: "abc123",
      billableKB: 250,
    });
  });

  it("passes limit to listJobsForUser", async () => {
    mockList.mockResolvedValue([]);
    await getJobsForUser("user-1", 10);
    expect(mockList).toHaveBeenCalledWith("user-1", 10);
  });
});
