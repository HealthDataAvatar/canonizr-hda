import { describe, it, expect, vi } from "vitest";
import type { JobRecord, JobPage } from "@/lib/data/table-interface";
import { toCanonizeJobRow, getJobsForUser } from "@/lib/data/jobs";

// ---------------------------------------------------------------------------
// Mock the table reader — getJobsForUser calls listJobsForUser internally
// ---------------------------------------------------------------------------

vi.mock("@/lib/data/tables/jobs", () => ({
  listJobsForUser: vi.fn(),
}));

import { listJobsForUser } from "@/lib/data/tables/jobs";
const mockList = vi.mocked(listJobsForUser);

// ---------------------------------------------------------------------------
// Factory — minimal JobRecord, override per test
// ---------------------------------------------------------------------------

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-001",
    timestamp: "2026-06-01T10:00:00Z",
    keyId: "key-aaa",
    jobType: "canonize",
    billableKB: 100,
    inputBytes: 100_000,
    status: "ok",
    originalFilename: "report.pdf",
    mimeType: "application/pdf",
    pricePerUnit: 0.003,
    completedAt: "2026-06-01T10:00:05Z",
    retentionExpires: "2099-01-01T00:00:00Z",
    artefacts: JSON.stringify([
      { name: "markdown", mime_type: "text/markdown", size_bytes: 8420, label: "Extracted text" },
    ]),
    ...overrides,
  };
}

function page(jobs: JobRecord[], nextCursor: string | null = null): JobPage {
  return { jobs, nextCursor };
}

// ---------------------------------------------------------------------------
// toCanonizeJobRow — discriminated union mapping
// ---------------------------------------------------------------------------

describe("toCanonizeJobRow", () => {
  it("maps processing job", () => {
    const row = toCanonizeJobRow(job({ status: "processing", completedAt: undefined, retentionExpires: undefined, artefacts: undefined }));
    expect(row.status).toBe("processing");
    expect(row.id).toBe("job-001");
    expect(row.filename).toBe("report.pdf");
    expect(row.submittedAt).toBe("2026-06-01T10:00:00Z");
  });

  it("maps ok job with artefacts", () => {
    const row = toCanonizeJobRow(job());
    expect(row.status).toBe("ok");
    if (row.status !== "ok") throw new Error("narrow");
    expect(row.completedAt).toBe("2026-06-01T10:00:05Z");
    expect(row.artefacts).toHaveLength(1);
    expect(row.artefacts[0].name).toBe("markdown");
  });

  it("maps ok job with expired retention to expired", () => {
    const row = toCanonizeJobRow(job({ retentionExpires: "2020-01-01T00:00:00Z" }));
    expect(row.status).toBe("expired");
  });

  it("maps error job with detail", () => {
    const row = toCanonizeJobRow(job({ status: "error", detail: "Timeout after 120s" }));
    expect(row.status).toBe("error");
    if (row.status !== "error") throw new Error("narrow");
    expect(row.error).toBe("Timeout after 120s");
  });

  it("maps error job without detail to default message", () => {
    const row = toCanonizeJobRow(job({ status: "error", detail: undefined }));
    if (row.status !== "error") throw new Error("narrow");
    expect(row.error).toBe("Unknown error");
  });

  it("maps deleted job to expired", () => {
    const row = toCanonizeJobRow(job({ status: "deleted" }));
    expect(row.status).toBe("expired");
  });

  it("maps submission fields consistently", () => {
    const row = toCanonizeJobRow(job({
      id: "j-42",
      keyId: "key-bbb",
      originalFilename: "invoice.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      inputBytes: 204_800,
      pricePerUnit: 0.005,
      timestamp: "2026-06-01T12:00:00Z",
    }));
    expect(row).toMatchObject({
      id: "j-42",
      keyId: "key-bbb",
      filename: "invoice.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      inputBytes: 204_800,
      pricePerUnit: 0.005,
      submittedAt: "2026-06-01T12:00:00Z",
    });
  });

  it("handles missing optional fields gracefully", () => {
    const row = toCanonizeJobRow(job({ originalFilename: undefined, mimeType: undefined, pricePerUnit: undefined }));
    expect(row.filename).toBe("unknown");
    expect(row.mimeType).toBe("application/octet-stream");
    expect(row.pricePerUnit).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getJobsForUser — integration with listJobsForUser
// ---------------------------------------------------------------------------

describe("getJobsForUser", () => {
  it("maps jobs through toCanonizeJobRow", async () => {
    mockList.mockResolvedValue(page([job({ status: "processing" }), job({ status: "error", detail: "boom" })]));
    const result = await getJobsForUser("user-1");
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0].status).toBe("processing");
    expect(result.jobs[1].status).toBe("error");
  });

  it("passes pageSize and cursor to listJobsForUser", async () => {
    mockList.mockResolvedValue(page([]));
    await getJobsForUser("user-1", 10, "cursor-abc");
    expect(mockList).toHaveBeenCalledWith("user-1", 10, "cursor-abc");
  });

  it("passes through nextCursor", async () => {
    mockList.mockResolvedValue(page([job()], "cursor-next"));
    const result = await getJobsForUser("user-1");
    expect(result.nextCursor).toBe("cursor-next");
  });

  it("returns empty list for no jobs", async () => {
    mockList.mockResolvedValue(page([]));
    const result = await getJobsForUser("user-1");
    expect(result.jobs).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});
