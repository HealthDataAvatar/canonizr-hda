/** Jobs table — read only from the portal's perspective. Gateway writes. */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";
import { toBillableKB } from "@/lib/pure/format";

export interface JobRecord {
  id: string;
  timestamp: string;
  completedAt?: string;
  keyName: string;
  fileHash?: string;
  billableKB: number;
  status: "ok" | "processing" | "error" | "deleted";
  retentionExpires?: string;
}

function parseStatus(raw: string): "ok" | "processing" | "error" | "deleted" {
  if (raw === "ok") return "ok";
  if (raw === "processing") return "processing";
  if (raw === "deleted") return "deleted";
  return "error";
}

export async function listJobsForUser(
  userId: string,
  limit: number = 50,
): Promise<JobRecord[]> {
  const client = getTableClient(TableName.GW_JOBS);

  const entities = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${userId}'`,
    },
  });

  const rows: JobRecord[] = [];
  for await (const entity of entities) {
    rows.push({
      id: entity.rowKey as string,
      timestamp: (entity.created_at as string) ?? "",
      completedAt: (entity.completed_at as string) || undefined,
      keyName: (entity.key_name as string) ?? "",
      fileHash: (entity.input_hash as string) || undefined,
      billableKB: toBillableKB(Number(entity.input_bytes ?? 0)),
      status: parseStatus(entity.status as string),
      retentionExpires: (entity.retention_expires as string) || undefined,
    });
    if (rows.length >= limit) break;
  }

  rows.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  return rows;
}
