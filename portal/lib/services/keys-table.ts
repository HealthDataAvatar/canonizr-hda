/**
 * KeyStore backed by Azure Table Storage.
 * Used for local dev and integration tests (against Azurite).
 */

import { createHash, randomUUID } from "crypto";
import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-interface";
import { getRedis } from "@/lib/redis";
import { currentPeriodStart, quotaUsageKey } from "@/lib/pure/billing-period";
import type { ApiKey, KeyStore } from ".";

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export class TableKeyStore implements KeyStore {
  async list(userId: string): Promise<ApiKey[]> {
    const client = getTableClient(TableName.API_KEYS);
    const gwSubs = getTableClient(TableName.GW_SUBSCRIPTIONS);
    const redis = getRedis();
    const entities = client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${userId}'` },
    });
    const rawKeys: Record<string, unknown>[] = [];
    for await (const e of entities) {
      rawKeys.push(e);
    }
    // Read billing anchor for period-scoped usage keys
    const gwBilling = getTableClient(TableName.GW_BILLING);
    let anchorDay = 1;
    try {
      const billingEntity = await gwBilling.getEntity("billing", userId);
      anchorDay = (billingEntity.billing_anchor_day as number) ?? 1;
    } catch { /* no billing record yet */ }
    const ps = currentPeriodStart(anchorDay);

    const keys = await Promise.all(
      rawKeys.map(async (e) => {
        const id = e.rowKey as string;
        const [subEntity, usageBytes] = await Promise.all([
          gwSubs.getEntity("subscription", id).catch(() => null),
          redis ? redis.get(quotaUsageKey(id, ps)) : null,
        ]);
        let quotaKB: number | null = null;
        if (subEntity) {
          const raw = subEntity.quota_bytes;
          if (raw != null && Number(raw) > 0) quotaKB = Math.round(Number(raw) / 1024);
        }
        const usageKB = usageBytes ? Math.ceil(Number(usageBytes) / 1024) : 0;
        return toApiKey(e, quotaKB, usageKB);
      }),
    );
    return keys;
  }

  async create(userId: string, name: string): Promise<{ id: string; primaryKey: string }> {
    const client = getTableClient(TableName.API_KEYS);
    const gwSubs = getTableClient(TableName.GW_SUBSCRIPTIONS);
    const gwApiKeys = getTableClient(TableName.GW_API_KEYS);

    const id = `key-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const primaryKey = `pk_${randomUUID().replace(/-/g, "")}`;
    const keyHash = hashApiKey(primaryKey);
    await Promise.all([
      client.upsertEntity({
        partitionKey: userId,
        rowKey: id,
        displayName: name,
        primaryKey,
        createdDate: new Date().toISOString(),
      }),
      gwSubs.upsertEntity({
        partitionKey: "subscription",
        rowKey: id,
        user_id: userId,
        key_name: name,
      }),
      gwApiKeys.upsertEntity({
        partitionKey: "key",
        rowKey: keyHash,
        sub_id: id,
        user_id: userId,
        created_at: new Date().toISOString(),
      }),
    ]);
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
    const gwApiKeys = getTableClient(TableName.GW_API_KEYS);
    const redis = getRedis();
    const entities = client.listEntities({
      queryOptions: { filter: `RowKey eq '${subscriptionId}'` },
    });
    for await (const e of entities) {
      const oldKey = e.primaryKey as string;
      const oldHash = hashApiKey(oldKey);
      const newKey = `pk_${randomUUID().replace(/-/g, "")}`;
      const newHash = hashApiKey(newKey);
      await Promise.all([
        client.upsertEntity({
          partitionKey: e.partitionKey as string,
          rowKey: e.rowKey as string,
          displayName: e.displayName,
          primaryKey: newKey,
          createdDate: e.createdDate,
        }),
        gwApiKeys.deleteEntity("key", oldHash).catch(() => {}),
        gwApiKeys.upsertEntity({
          partitionKey: "key",
          rowKey: newHash,
          sub_id: subscriptionId,
          user_id: e.partitionKey as string,
          created_at: new Date().toISOString(),
        }),
      ]);
      // Invalidate old cache entry
      if (redis) await redis.del(`apikey:${oldHash}:sub_id`);
      return newKey;
    }
    throw new Error(`Key ${subscriptionId} not found`);
  }

  async delete(subscriptionId: string): Promise<void> {
    const client = getTableClient(TableName.API_KEYS);
    const gwSubs = getTableClient(TableName.GW_SUBSCRIPTIONS);
    const gwApiKeys = getTableClient(TableName.GW_API_KEYS);
    const redis = getRedis();
    const entities = client.listEntities({
      queryOptions: { filter: `RowKey eq '${subscriptionId}'` },
    });
    for await (const e of entities) {
      const keyHash = hashApiKey(e.primaryKey as string);
      await Promise.all([
        client.deleteEntity(e.partitionKey as string, e.rowKey as string),
        gwSubs.deleteEntity("subscription", subscriptionId).catch(() => {}),
        gwApiKeys.deleteEntity("key", keyHash).catch(() => {}),
      ]);
      if (redis) await redis.del(`apikey:${keyHash}:sub_id`);
      return;
    }
  }

  async setQuota(subscriptionId: string, quotaKB: number | null): Promise<void> {
    const gwSubs = getTableClient(TableName.GW_SUBSCRIPTIONS);
    const entity = await gwSubs.getEntity("subscription", subscriptionId);
    // Table Storage ignores null on upsert, so use -1 sentinel for "no quota"
    const quotaBytes = quotaKB !== null ? Math.round(quotaKB * 1024) : -1;
    await gwSubs.upsertEntity({
      partitionKey: "subscription",
      rowKey: subscriptionId,
      user_id: entity.user_id,
      key_name: entity.key_name,
      quota_bytes: quotaBytes,
    });

    const redis = getRedis();
    if (redis) {
      const redisKey = `sub:${subscriptionId}:quota:bytes`;
      if (quotaKB !== null) {
        await redis.set(redisKey, String(quotaBytes));
      } else {
        await redis.del(redisKey);
      }
    }
  }
}

function toApiKey(e: Record<string, unknown>, quotaKB: number | null, usageKB: number): ApiKey {
  const created = e.createdDate as string;
  return {
    id: e.rowKey as string,
    displayName: e.displayName as string,
    key: e.primaryKey as string,
    createdDate: created ? new Date(created).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
    lastUsed: "—",
    usageKB,
    quotaKB,
  };
}
