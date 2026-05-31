/** UserConfig table — append-only billing/quota settings. */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";
import { invertedTimestampRK, getLatest } from "./append-only";

export interface UserConfigRecord {
  freeUnits: number | null;
  maxKeys: number;
  pricePerUnit: number;
  spendCapKB: number | null;
  changedBy: string;
  timestamp: string;
}

const DEFAULTS: Omit<UserConfigRecord, "changedBy" | "timestamp"> = {
  freeUnits: 500,
  maxKeys: 100,
  pricePerUnit: 0.003,
  spendCapKB: null,
};

export async function getCurrentConfig(userId: string): Promise<UserConfigRecord> {
  const client = getTableClient(TableName.USER_CONFIG);
  const row = await getLatest<Record<string, unknown>>(client, userId);

  if (!row) {
    return { ...DEFAULTS, changedBy: "system", timestamp: "" };
  }

  return {
    freeUnits: (row.freeUnits as number) ?? DEFAULTS.freeUnits,
    maxKeys: (row.maxKeys as number) ?? DEFAULTS.maxKeys,
    pricePerUnit: (row.pricePerUnit as number) ?? DEFAULTS.pricePerUnit,
    spendCapKB: (row.spendCapKB as number) ?? null,
    changedBy: (row.changedBy as string) ?? "system",
    timestamp: (row.timestamp as string) ?? "",
  };
}

export async function appendConfig(
  userId: string,
  config: Omit<UserConfigRecord, "timestamp">,
): Promise<void> {
  const client = getTableClient(TableName.USER_CONFIG);
  await client.upsertEntity({
    partitionKey: userId,
    rowKey: invertedTimestampRK(),
    timestamp: new Date().toISOString(),
    freeUnits: config.freeUnits,
    maxKeys: config.maxKeys,
    pricePerUnit: config.pricePerUnit,
    spendCapKB: config.spendCapKB,
    changedBy: config.changedBy,
  });
}
