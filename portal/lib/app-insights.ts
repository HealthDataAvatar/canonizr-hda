import { DEV_MODE } from "./dev";

export interface RequestRecord {
  id: string;
  timestamp: string;
  subscriptionId: string;
  inputSizeBytes: number;
  processingTimeMs: number;
  status: number;
  pipeline: string;
  documentHash: string;
}

// ---------------------------------------------------------------------------
// Dev mode fixtures
// ---------------------------------------------------------------------------

const devRequests: RequestRecord[] = [
  { id: "req-a1b2c3", timestamp: "2026-05-28T14:23:00Z", subscriptionId: "dev-sub-001", inputSizeBytes: 127283, processingTimeMs: 2340, status: 200, pipeline: "docling+caption", documentHash: "abc123" },
  { id: "req-d4e5f6", timestamp: "2026-05-28T14:21:00Z", subscriptionId: "dev-sub-001", inputSizeBytes: 8291, processingTimeMs: 420, status: 200, pipeline: "passthrough", documentHash: "def456" },
  { id: "req-g7h8i9", timestamp: "2026-05-28T13:58:00Z", subscriptionId: "dev-sub-002", inputSizeBytes: 2516582, processingTimeMs: 11200, status: 200, pipeline: "docling+caption", documentHash: "ghi789" },
  { id: "req-j0k1l2", timestamp: "2026-05-28T13:45:00Z", subscriptionId: "dev-sub-001", inputSizeBytes: 0, processingTimeMs: 12, status: 400, pipeline: "—", documentHash: "" },
];

// ---------------------------------------------------------------------------
// Real implementation
// ---------------------------------------------------------------------------

function getClient() {
  const { LogsQueryClient } = require("@azure/monitor-query") as typeof import("@azure/monitor-query");
  const { DefaultAzureCredential } = require("@azure/identity") as typeof import("@azure/identity");
  return new LogsQueryClient(new DefaultAzureCredential());
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function getRecentRequests(
  subscriptionIds: string[],
  limit: number = 20
): Promise<RequestRecord[]> {
  if (DEV_MODE) return [...devRequests].slice(0, limit);

  if (subscriptionIds.length === 0) return [];

  const quotedIds = subscriptionIds.map((id) => `'${id}'`).join(",");
  const query = `
    requests
    | where customDimensions["Request-Header-X-Subscription-Id"] in (${quotedIds})
    | project
        id = operation_Id,
        timestamp,
        subscriptionId = tostring(customDimensions["Request-Header-X-Subscription-Id"]),
        inputSizeBytes = toint(customDimensions["Response-Header-X-Input-Size-Bytes"]),
        processingTimeMs = toint(customDimensions["Response-Header-X-Processing-Time-Ms"]),
        status = resultCode,
        pipeline = tostring(customDimensions["Response-Header-X-Processing-Pipeline"]),
        documentHash = tostring(customDimensions["Response-Header-X-Document-Hash"])
    | order by timestamp desc
    | take ${limit}
  `;

  const client = getClient();
  const result = await client.queryWorkspace(process.env.LOG_ANALYTICS_WORKSPACE_ID!, query, {
    duration: "P30D",
  });

  if (result.status !== "Success" || !result.tables[0]) return [];

  const table = result.tables[0];
  return table.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    table.columnDescriptors.forEach((col, i) => {
      obj[col.name!] = row[i];
    });
    return {
      id: String(obj.id ?? ""),
      timestamp: String(obj.timestamp ?? ""),
      subscriptionId: String(obj.subscriptionId ?? ""),
      inputSizeBytes: Number(obj.inputSizeBytes ?? 0),
      processingTimeMs: Number(obj.processingTimeMs ?? 0),
      status: Number(obj.status ?? 0),
      pipeline: String(obj.pipeline ?? ""),
      documentHash: String(obj.documentHash ?? ""),
    };
  });
}
