/**
 * KeyStore backed by Azure Table Storage.
 * Used for local dev and integration tests (against Azurite).
 */

import { TableClient } from "@azure/data-tables";
import { randomUUID } from "crypto";
import type { ApiKey, KeyStore } from "./services";
import { TableName } from "./table-names";

export class TableKeyStore implements KeyStore {
  private client: TableClient;
  private gwUsers: TableClient;
  private initPromise: Promise<void>;

  constructor(connectionString: string) {
    const opts = connectionString.includes("http://") ? { allowInsecureConnection: true } : {};
    this.client = TableClient.fromConnectionString(connectionString, TableName.API_KEYS, opts);
    this.gwUsers = TableClient.fromConnectionString(connectionString, TableName.GW_SUBSCRIPTIONS, opts);
    this.initPromise = Promise.all([
      this.client.createTable().catch(() => {}),
      this.gwUsers.createTable().catch(() => {}),
    ]).then(() => {});
  }

  async list(userId: string): Promise<ApiKey[]> {
    await this.initPromise;
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
    await this.initPromise;
    const id = `key-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const primaryKey = `pk_${randomUUID().replace(/-/g, "")}`;
    await this.client.upsertEntity({
      partitionKey: userId,
      rowKey: id,
      displayName: name,
      primaryKey,
      createdDate: new Date().toISOString(),
    });
    // Gateway: subscription → user mapping
    await this.gwUsers.createTable().catch(() => {});
    await this.gwUsers.upsertEntity({
      partitionKey: "subscription",
      rowKey: id,
      user_id: userId,
      key_name: name,
    });
    return { id, primaryKey };
  }

  async get(subscriptionId: string): Promise<string> {
    await this.initPromise;
    const entities = this.client.listEntities({
      queryOptions: { filter: `RowKey eq '${subscriptionId}'` },
    });
    for await (const e of entities) {
      return e.primaryKey as string;
    }
    throw new Error(`Key ${subscriptionId} not found`);
  }

  async rotate(subscriptionId: string): Promise<string> {
    await this.initPromise;
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
    await this.initPromise;
    const entities = this.client.listEntities({
      queryOptions: { filter: `RowKey eq '${subscriptionId}'` },
    });
    for await (const e of entities) {
      await this.client.deleteEntity(e.partitionKey as string, e.rowKey as string);
      // Gateway: clean up subscription mapping
      await this.gwUsers.deleteEntity("subscription", subscriptionId).catch(() => {});
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
