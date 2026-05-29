/**
 * KeyStore backed by Azure Table Storage.
 * Used for local dev and integration tests (against Azurite).
 */

import { TableClient } from "@azure/data-tables";
import { randomUUID } from "crypto";
import type { ApiKey, KeyStore } from "./services";

const TABLE = "ApiKeys";

export class TableKeyStore implements KeyStore {
  private client: TableClient;

  constructor(connectionString: string) {
    const opts = connectionString.includes("http://") ? { allowInsecureConnection: true } : {};
    this.client = TableClient.fromConnectionString(connectionString, TABLE, opts);
    this.client.createTable().catch(() => {});
  }

  async list(userId: string): Promise<ApiKey[]> {
    const entities = this.client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${userId}'` },
    });
    const keys: ApiKey[] = [];
    for await (const e of entities) {
      keys.push(this.toApiKey(e));
    }
    return keys;
  }

  async create(userId: string, name: string): Promise<{ id: string; primaryKey: string }> {
    const id = `key-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const primaryKey = `pk_${randomUUID().replace(/-/g, "")}`;
    await this.client.upsertEntity({
      partitionKey: userId,
      rowKey: id,
      displayName: name,
      primaryKey,
      createdDate: new Date().toISOString(),
    });
    return { id, primaryKey };
  }

  async get(subscriptionId: string): Promise<string> {
    const entities = this.client.listEntities({
      queryOptions: { filter: `RowKey eq '${subscriptionId}'` },
    });
    for await (const e of entities) {
      return e.primaryKey as string;
    }
    throw new Error(`Key ${subscriptionId} not found`);
  }

  async rotate(subscriptionId: string): Promise<string> {
    const entities = this.client.listEntities({
      queryOptions: { filter: `RowKey eq '${subscriptionId}'` },
    });
    for await (const e of entities) {
      const newKey = `pk_${randomUUID().replace(/-/g, "")}`;
      await this.client.upsertEntity({
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
    const entities = this.client.listEntities({
      queryOptions: { filter: `RowKey eq '${subscriptionId}'` },
    });
    for await (const e of entities) {
      await this.client.deleteEntity(e.partitionKey as string, e.rowKey as string);
      return;
    }
  }

  private toApiKey(e: Record<string, unknown>): ApiKey {
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
}
