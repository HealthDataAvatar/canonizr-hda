/** Jobs table — reads from GwUserJobs index (mutable, newest-first). */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";
import { toBillableKB } from "@/lib/pure/format";

export interface JobRecord {
  id: string;
  timestamp: string;
  completedAt?: string;
  keyId: string;
  billableKB: number;
  status: "ok" | "processing" | "error" | "deleted";
  retentionExpires?: string;
  detail?: string;
  originalFilename?: string;
  mimeType?: string;
  inputBytes: number;
}

export interface JobPage {
  jobs: JobRecord[];
  nextCursor: string | null;
}

function parseStatus(raw: string): "ok" | "processing" | "error" | "deleted" {
  if (raw === "ok") return "ok";
  if (raw === "processing") return "processing";
  if (raw === "deleted") return "deleted";
  return "error";
}

export async function listJobsForUser(
  userId: string,
  pageSize: number = 20,
  cursor?: string,
): Promise<JobPage> {
  const client = getTableClient(TableName.GW_USER_JOBS);

  const pages = client
    .listEntities({
      queryOptions: {
        filter: `PartitionKey eq '${userId}'`,
      },
    })
    .byPage({ maxPageSize: pageSize, continuationToken: cursor });

  const page = await pages.next();
  if (page.done || !page.value) {
    return { jobs: [], nextCursor: null };
  }

  const jobs: JobRecord[] = [];
  for (const entity of page.value) {
    jobs.push({
      id: (entity.job_id as string) ?? "",
      timestamp: (entity.created_at as string) ?? "",
      completedAt: (entity.completed_at as string) || undefined,
      keyId: (entity.key_id as string) ?? "",
      billableKB: toBillableKB(Number(entity.input_bytes ?? 0)),
      status: parseStatus(entity.status as string),
      retentionExpires: (entity.retention_expires as string) || undefined,
      detail: (entity.detail as string) || undefined,
      originalFilename: (entity.original_filename as string) || undefined,
      mimeType: (entity.mime_type as string) || undefined,
      inputBytes: Number(entity.input_bytes ?? 0),
    });
  }

  return {
    jobs,
    nextCursor: page.value.continuationToken ?? null,
  };
}
