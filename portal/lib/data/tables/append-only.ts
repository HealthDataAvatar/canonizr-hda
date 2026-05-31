/**
 * Shared helpers for append-only tables.
 *
 * Pattern: PK = entity ID, RK = inverted timestamp + UUID.
 * Newest row sorts first. Every row also carries a human-readable `timestamp`.
 */

import { randomUUID } from "crypto";
import type { TableClient } from "@azure/data-tables";

/**
 * Generate an inverted-timestamp RowKey for append-only tables.
 * Newest sorts first in Azure Table Storage's ascending RK order.
 */
export function invertedTimestampRK(): string {
  const inverted = String(9_999_999_999_999 - Date.now()).padStart(13, "0");
  return `${inverted}_${randomUUID().slice(0, 8)}`;
}

/**
 * Get the latest (newest) row for a partition key.
 * Returns null if no rows exist.
 */
export async function getLatest<T extends Record<string, unknown>>(
  client: TableClient,
  partitionKey: string,
): Promise<T | null> {
  const entities = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${partitionKey}'`,
    },
  });

  for await (const entity of entities) {
    return entity as unknown as T;
  }
  return null;
}
