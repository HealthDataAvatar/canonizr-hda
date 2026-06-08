/** Lazy-load job trace (steps JSON) from GwJobs append-only table.
 *
 * This is the only portal code that reads from GwJobs directly.
 * The index table (GwUserJobs) intentionally excludes the steps field
 * because it's large and only needed for admin trace viewing.
 */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-interface";

export async function getJobTrace(jobId: string): Promise<string | null> {
  const client = getTableClient(TableName.GW_JOBS);
  const pk = `job_${jobId.slice(0, 2)}`;

  // Range scan: all events for this job, newest first (inverted timestamp in RK)
  const entities = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${pk}' and RowKey ge '${jobId}_' and RowKey lt '${jobId}_~'`,
    },
  });

  // First result is the latest event (has the completed trace)
  for await (const entity of entities) {
    const steps = entity.steps as string | undefined;
    if (steps) return steps;
  }

  return null;
}
