/** UserConfig table — append-only billing/quota settings. */

import { getTableClient } from "@/lib/data/table-client";
import { TableName, UserConfigRecord } from "@/lib/data/table-interface";
import { invertedTimestampRK, getLatest } from "./append-only";

function requireEnvNumber(name: string): number {
  const raw = process.env[name];
  const n = Number(raw);
  if (!raw || Number.isNaN(n)) throw new Error(`Missing or invalid env var: ${name}`);
  return n;
}

let _defaults: Omit<UserConfigRecord, "changedBy" | "timestamp"> | null = null;

export function getDefaults(): Omit<UserConfigRecord, "changedBy" | "timestamp"> {
  if (!_defaults) {
    _defaults = {
      freeUnits: requireEnvNumber("DEFAULT_FREE_UNITS"),
      maxKeys: 100,
      spendCapUnits: null,
      adminCapUnits: null,
      paidEnabled: false,
      comp: false,
    };
  }
  return _defaults;
}

export async function getCurrentConfig(userId: string): Promise<UserConfigRecord> {
  const client = getTableClient(TableName.USER_CONFIG);
  const row = await getLatest<Record<string, unknown>>(client, userId);

  if (!row) {
    return { ...getDefaults(), changedBy: "system", timestamp: "" };
  }

  return {
    freeUnits: (row.freeUnits as number) ?? getDefaults().freeUnits,
    maxKeys: (row.maxKeys as number) ?? getDefaults().maxKeys,
    spendCapUnits: (row.spendCapUnits as number) ?? null,
    adminCapUnits: (row.adminCapUnits as number) ?? null,
    paidEnabled: (row.paidEnabled as boolean) ?? false,
    comp: (row.comp as boolean) ?? false,
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
    spendCapUnits: config.spendCapUnits,
    adminCapUnits: config.adminCapUnits,
    paidEnabled: config.paidEnabled,
    comp: config.comp,
    changedBy: config.changedBy,
  });
}
