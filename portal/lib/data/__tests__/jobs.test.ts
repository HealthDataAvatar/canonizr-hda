import { describe, it, expect, vi } from "vitest";
import type { JobRecord, JobPage } from "@/lib/data/tables";

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
    keyId: "my-key",
    billableKB: 100,
    inputBytes: 100000,
    status: "ok",
    ...overrides,
  };
}

function page(jobs: JobRecord[], nextCursor: string | null = null): JobPage {
  return { jobs, nextCursor };
}

describe("getJobsForUser", () => {
  it("maps status ok to 200", async () => {
    mockList.mockResolvedValue(page([job({ status: "ok" })]));
    const result = await getJobsForUser("user-1");
    expect(result.requests[0].status).toBe(200);
  });

  it("maps status processing to 202", async () => {
    mockList.mockResolvedValue(page([job({ status: "processing" })]));
    const result = await getJobsForUser("user-1");
    expect(result.requests[0].status).toBe(202);
  });

  it("maps status error to 500", async () => {
    mockList.mockResolvedValue(page([job({ status: "error" })]));
    const result = await getJobsForUser("user-1");
    expect(result.requests[0].status).toBe(500);
  });

  it("deleted job has blob status none", async () => {
    mockList.mockResolvedValue(page([job({ status: "deleted" })]));
    const result = await getJobsForUser("user-1");
    expect(result.requests[0].result.status).toBe("none");
    expect(result.requests[0].input.status).toBe("none");
  });

  it("processing job has blob status processing", async () => {
    mockList.mockResolvedValue(page([job({ status: "processing" })]));
    const result = await getJobsForUser("user-1");
    expect(result.requests[0].result.status).toBe("processing");
  });

  it("expired retention has blob status expired", async () => {
    mockList.mockResolvedValue(page([job({
      retentionExpires: "2020-01-01T00:00:00Z",
    })]));
    const result = await getJobsForUser("user-1");
    expect(result.requests[0].result.status).toBe("expired");
  });

  it("passes through scalar fields", async () => {
    mockList.mockResolvedValue(page([job({
      id: "j-42",
      timestamp: "2026-05-30T12:00:00Z",
      completedAt: "2026-05-30T12:01:00Z",
      keyId: "test-key",
      billableKB: 250,
    })]));
    const result = await getJobsForUser("user-1");
    expect(result.requests[0]).toMatchObject({
      id: "j-42",
      timestamp: "2026-05-30T12:00:00Z",
      completedAt: "2026-05-30T12:01:00Z",
      keyId: "test-key",
      billableKB: 250,
    });
  });

  it("passes pageSize to listJobsForUser", async () => {
    mockList.mockResolvedValue(page([]));
    await getJobsForUser("user-1", 10);
    expect(mockList).toHaveBeenCalledWith("user-1", 10, undefined);
  });

  it("passes through nextCursor", async () => {
    mockList.mockResolvedValue(page([job()], "cursor-abc"));
    const result = await getJobsForUser("user-1");
    expect(result.nextCursor).toBe("cursor-abc");
  });
});
