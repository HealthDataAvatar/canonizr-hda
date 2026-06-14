/** Maps JobRecord (raw table data) to CanonizeJobRow (UI type). */

import { parseArtefacts } from "@/lib/pure/artefacts";
import type { CanonizeJobRow } from "@/lib/pure/job-types";
import { JobRecord } from "./table-interface";
import { listJobsForUser } from "./tables/jobs";


export function toCanonizeJobRow(job: JobRecord): CanonizeJobRow {
  const submission = {
    id: job.id,
    keyId: job.keyId,
    filename: job.originalFilename ?? "unknown",
    mimeType: job.mimeType ?? "application/octet-stream",
    inputBytes: job.inputBytes,
    pricePerUnit: job.pricePerUnit ?? 0,
    submittedAt: job.timestamp,
  };

  switch (job.status) {
    case "processing":
      return { ...submission, status: "processing" };

    case "ok": {
      if (!job.retentionExpires) {
        // TODO: log this — completed jobs should always have retention_expires set by the worker
        const fallbackExpiry = new Date(new Date(job.completedAt ?? job.timestamp).getTime() + 24 * 60 * 60_000);
        if (fallbackExpiry < new Date()) {
          return { ...submission, status: "expired", completedAt: job.completedAt ?? "", expiredAt: fallbackExpiry.toISOString() };
        }
        return { ...submission, status: "ok", completedAt: job.completedAt ?? "", expiresAt: fallbackExpiry.toISOString(), artefacts: parseArtefacts(job.artefacts) };
      }
      const expiresAt = new Date(job.retentionExpires);
      if (expiresAt < new Date()) {
        return { ...submission, status: "expired", completedAt: job.completedAt ?? "", expiredAt: expiresAt.toISOString() };
      }
      return {
        ...submission,
        status: "ok",
        completedAt: job.completedAt ?? "",
        expiresAt: expiresAt.toISOString(),
        artefacts: parseArtefacts(job.artefacts),
      };
    }

    case "error":
      return { ...submission, status: "error", completedAt: job.completedAt ?? "", error: job.detail ?? "Unknown error" };

    case "deleted":
      return { ...submission, status: "expired", completedAt: job.completedAt ?? "", expiredAt: job.retentionExpires ?? job.completedAt ?? job.timestamp };
  }
}

export interface CanonizeJobPage {
  jobs: CanonizeJobRow[];
  nextCursor: string | null;
}

export async function getJobsForUser(
  userId: string,
  pageSize: number = 20,
  cursor?: string,
): Promise<CanonizeJobPage> {
  const page = await listJobsForUser(userId, pageSize, cursor);
  return {
    jobs: page.jobs.map(toCanonizeJobRow),
    nextCursor: page.nextCursor,
  };
}
