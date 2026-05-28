import { LogsQueryClient } from "@azure/monitor-query";
import { DefaultAzureCredential } from "@azure/identity";

const WORKSPACE_ID = process.env.LOG_ANALYTICS_WORKSPACE_ID!;

let client: LogsQueryClient | null = null;

function getClient(): LogsQueryClient {
  if (!client) {
    client = new LogsQueryClient(new DefaultAzureCredential());
  }
  return client;
}

export interface RequestRecord {
  timestamp: string;
  subscriptionId: string;
  inputSizeBytes: number;
  processingTimeMs: number;
  status: number;
  pipeline: string;
  documentHash: string;
}

/**
 * Query App Insights for recent requests by APIM subscription ID(s).
 * Returns the last `limit` requests.
 */
export async function getRecentRequests(
  subscriptionIds: string[],
  limit: number = 20
): Promise<RequestRecord[]> {
  if (subscriptionIds.length === 0) return [];

  const quotedIds = subscriptionIds.map((id) => `'${id}'`).join(",");
  const query = `
    requests
    | where customDimensions["Request-Header-X-Subscription-Id"] in (${quotedIds})
    | project
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

  const logsClient = getClient();
  const result = await logsClient.queryWorkspace(WORKSPACE_ID, query, {
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
