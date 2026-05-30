import { TableClient } from "@azure/data-tables";
import { toBillableKB } from "../pure/format";
import type { RequestRow, BlobState } from "@/components/request-table";
import { TableName } from "./table-names";

const TABLE_NAME = TableName.GW_JOBS;

let _tableReady: Promise<void> | null = null;

function ensureJobsTable(connectionString: string) {
  if (!_tableReady) {
    const opts = connectionString.includes("http://") ? { allowInsecureConnection: true } : {};
    const client = TableClient.fromConnectionString(connectionString, TABLE_NAME, opts);
    _tableReady = client.createTable().catch(() => {});
  }
  return _tableReady;
}

function statusToCode(status: string): number {
  switch (status) {
    case "ok": return 200;
    case "processing": return 202;
    case "error": return 500;
    default: return 0;
  }
}

function blobState(row: Record<string, unknown>): BlobState {
  if (row.deleted) return { status: "none" };
  if (row.status === "processing") return { status: "processing" };
  if (row.retention_expires) {
    const expires = new Date(row.retention_expires as string);
    if (expires < new Date()) return { status: "expired" };
  }
  // TODO: generate SAS URLs for blob download once blob access is wired
  return { status: "none" };
}

export async function getJobsForUser(
  connectionString: string,
  userId: string,
  limit: number = 50,
): Promise<RequestRow[]> {
  const opts = connectionString.includes("http://")
    ? { allowInsecureConnection: true }
    : {};
  await ensureJobsTable(connectionString);
  const client = TableClient.fromConnectionString(connectionString, TABLE_NAME, opts);

  const entities = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${userId}'`,
    },
  });

  const rows: RequestRow[] = [];
  for await (const entity of entities) {
    rows.push({
      id: entity.rowKey as string,
      timestamp: (entity.created_at as string) ?? "",
      completedAt: (entity.completed_at as string) || undefined,
      keyName: (entity.key_name as string) ?? "",
      fileHash: (entity.input_hash as string) || undefined,
      billableKB: toBillableKB(Number(entity.input_bytes ?? 0)),
      status: statusToCode(entity.status as string),
      result: blobState(entity),
      input: blobState(entity),
    });
    if (rows.length >= limit) break;
  }

  rows.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  return rows;
}
