/**
 * KeyStore backed by Azure Table Storage.
 * Used for local dev and integration tests (against Azurite).
 */

import { randomUUID } from "crypto";
import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";
import type { ApiKey, KeyStore } from "./services";

export class TableKeyStore implements KeyStore {
  async list(userId: string): Promise<ApiKey[]> {
    const client = getTableClient(TableName.API_KEYS);
    const entities = client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${userId}'` },
    });
    const keys: ApiKey[] = [];
    for await (const e of entities) {
      keys.push(toApiKey(e));
    }
    return keys;
  }

  async create(userId: string, name: string): Promise<{ id: string; primaryKey: string }> {
    const client = getTableClient(TableName.API_KEYS);
    const gwSubs = getTableClient(TableName.GW_SUBSCRIPTIONS);

    const id = `key-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const primaryKey = `pk_${randomUUID().replace(/-/g, "")}`;
    await client.upsertEntity({
      partitionKey: userId,
      rowKey: id,
      displayName: name,
      primaryKey,
      createdDate: new Date().toISOString(),
    });
    await gwSubs.upsertEntity({
      partitionKey: "subscription",
      rowKey: id,
      user_id: userId,
      key_name: name,
    });
    return { id, primaryKey };
  }

  async get(subscriptionId: string): Promise<string> {
    const client = getTableClient(TableName.API_KEYS);
    const entities = client.listEntities({
      queryOptions: { filter: `RowKey eq '${subscriptionId}'` },
    });
    for await (const e of entities) {
      return e.primaryKey as string;
    }
    throw new Error(`Key ${subscriptionId} not found`);
  }

  async rotate(subscriptionId: string): Promise<string> {
    const client = getTableClient(TableName.API_KEYS);
    const entities = client.listEntities({
      queryOptions: { filter: `RowKey eq '${subscriptionId}'` },
    });
    for await (const e of entities) {
      const newKey = `pk_${randomUUID().replace(/-/g, "")}`;
      await client.upsertEntity({
        partitionKey: e.partitionKey as string,
        rowKey: e.rowKey as string,
        displayName: e.displayName,
        primaryKey: newKey,
        createdDate: e.createdDate,
      });
      return newKey;
    }
    throw new Error(`Key ${subscriptionId} not found`);
  }

  async delete(subscriptionId: string): Promise<void> {
    const client = getTableClient(TableName.API_KEYS);
    const gwSubs = getTableClient(TableName.GW_SUBSCRIPTIONS);
    const entities = client.listEntities({
      queryOptions: { filter: `RowKey eq '${subscriptionId}'` },
    });
    for await (const e of entities) {
      await client.deleteEntity(e.partitionKey as string, e.rowKey as string);
      await gwSubs.deleteEntity("subscription", subscriptionId).catch(() => {});
      return;
    }
  }
}

function toApiKey(e: Record<string, unknown>): ApiKey {
  const created = e.createdDate as string;
  return {
    id: e.rowKey as string,
    displayName: e.displayName as string,
    keyHint: (e.primaryKey as string).slice(-4),
    createdDate: created ? new Date(created).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
    lastUsed: "—",
    usageKB: 0,
    quotaKB: null,
  };
}
