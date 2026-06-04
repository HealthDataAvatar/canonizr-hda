/** Adapts JobRecord from the table helper to RequestRow for the UI. */

import { listJobsForUser, type JobRecord } from "@/lib/data/tables";
import type { RequestRow, BlobState } from "@/components/tables/request-table";

function statusToCode(status: JobRecord["status"]): number {
  switch (status) {
    case "ok": return 200;
    case "processing": return 202;
    case "error": return 500;
    case "deleted": return 410;
  }
}

function blobState(job: JobRecord, artifact: "output" | "input"): BlobState {
  if (job.status === "error" || job.status === "deleted") return { status: "none" };
  if (job.status === "processing") return { status: "processing" };
  if (job.retentionExpires) {
    if (new Date(job.retentionExpires) < new Date()) return { status: "expired" };
  }
  if (job.status === "ok") {
    return { status: "available", url: `/api/jobs/${job.id}/${artifact}` };
  }
  return { status: "none" };
}

function toRequestRow(job: JobRecord): RequestRow {
  return {
    id: job.id,
    timestamp: job.timestamp,
    completedAt: job.completedAt,
    keyId: job.keyId,
    billableKB: job.billableKB,
    status: statusToCode(job.status),
    result: blobState(job, "output"),
    input: blobState(job, "input"),
    detail: job.detail,
    originalFilename: job.originalFilename,
    mimeType: job.mimeType,
    inputBytes: job.inputBytes,
    retentionExpires: job.retentionExpires,
  };
}

export interface RequestPage {
  requests: RequestRow[];
  nextCursor: string | null;
}

export async function getJobsForUser(
  userId: string,
  pageSize: number = 20,
  cursor?: string,
): Promise<RequestPage> {
  const page = await listJobsForUser(userId, pageSize, cursor);
  return {
    requests: page.jobs.map(toRequestRow),
    nextCursor: page.nextCursor,
  };
}
