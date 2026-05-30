/** Adapts JobRecord from the table helper to RequestRow for the UI. */

import { listJobsForUser, type JobRecord } from "@/lib/data/tables";
import type { RequestRow, BlobState } from "@/components/request-table";

function statusToCode(status: JobRecord["status"]): number {
  switch (status) {
    case "ok": return 200;
    case "processing": return 202;
    case "error": return 500;
  }
}

function blobState(job: JobRecord): BlobState {
  if (job.deleted) return { status: "none" };
  if (job.status === "processing") return { status: "processing" };
  if (job.retentionExpires) {
    if (new Date(job.retentionExpires) < new Date()) return { status: "expired" };
  }
  // TODO: generate SAS URLs for blob download once blob access is wired
  return { status: "none" };
}

export async function getJobsForUser(
  userId: string,
  limit: number = 50,
): Promise<RequestRow[]> {
  const jobs = await listJobsForUser(userId, limit);
  return jobs.map((job) => ({
    id: job.id,
    timestamp: job.timestamp,
    completedAt: job.completedAt,
    keyName: job.keyName,
    fileHash: job.fileHash,
    billableKB: job.billableKB,
    status: statusToCode(job.status),
    result: blobState(job),
    input: blobState(job),
  }));
}
