/**
 * KeyStore backed by Azure API Management.
 * Production implementation.
 *
 * On key creation, also writes a subscription → user mapping to the gateway's
 * Table Storage so the conversion API can resolve the APIM subscription ID
 * to a user and encryption key.
 */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";
import { getRedis } from "@/lib/redis";
import { ApiKey, KeyStore } from "@/lib/services";

function getClient() {
  const { ApiManagementClient } = require("@azure/arm-apimanagement") as typeof import("@azure/arm-apimanagement");
  const { DefaultAzureCredential } = require("@azure/identity") as typeof import("@azure/identity");
  return new ApiManagementClient(
    new DefaultAzureCredential(),
    process.env.AZURE_SUBSCRIPTION_ID!,
  );
}

function getGatewayUsersTable() {
  return getTableClient(TableName.GW_SUBSCRIPTIONS);
}

const RG = () => process.env.APIM_RESOURCE_GROUP!;
const SVC = () => process.env.APIM_SERVICE_NAME!;
const PRODUCT_ID = "paid";

export class ApimKeyStore implements KeyStore {
  async list(userId: string): Promise<ApiKey[]> {
    const apim = getClient();
    const gwSubs = getGatewayUsersTable();
    const redis = getRedis();
    const results: ApiKey[] = [];
    for await (const sub of apim.subscription.list(RG(), SVC())) {
      if (sub.displayName?.startsWith(`user:${userId}:`)) {
        const secrets = await apim.subscription.listSecrets(RG(), SVC(), sub.name!);
        let quotaKB: number | null = null;
        try {
          const entity = await gwSubs.getEntity("subscription", sub.name!);
          const raw = entity.quota_bytes;
          if (raw != null && Number(raw) > 0) quotaKB = Math.round(Number(raw) / 1024);
        } catch {}
        let usageKB = 0;
        if (redis) {
          const bytes = await redis.get(`sub:${sub.name!}:bytes`);
          if (bytes) usageKB = Math.ceil(Number(bytes) / 1024);
        }
        results.push({
          id: sub.name!,
          displayName: sub.displayName.replace(`user:${userId}:`, ""),
          key: secrets.primaryKey ?? "",
          createdDate: sub.createdDate?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) ?? "",
          lastUsed: "—",
          usageKB,
          quotaKB,
        });
      }
    }
    return results;
  }

  async create(userId: string, name: string): Promise<{ id: string; primaryKey: string }> {
    const apim = getClient();
    const sid = `user-${userId}-${Date.now()}`;
    await apim.subscription.createOrUpdate(RG(), SVC(), sid, {
      displayName: `user:${userId}:${name}`,
      scope: `/products/${PRODUCT_ID}`,
      state: "active",
    });
    const keys = await apim.subscription.listSecrets(RG(), SVC(), sid);

    // Write subscription → user mapping for the gateway
    const gwUsers = getGatewayUsersTable();
    await gwUsers.upsertEntity({
      partitionKey: "subscription",
      rowKey: sid,
      user_id: userId,
      key_name: name,
    });

    return { id: sid, primaryKey: keys.primaryKey! };
  }

  async get(subscriptionId: string): Promise<string> {
    const apim = getClient();
    const keys = await apim.subscription.listSecrets(RG(), SVC(), subscriptionId);
    return keys.primaryKey!;
  }

  async rotate(subscriptionId: string): Promise<string> {
    const apim = getClient();
    await apim.subscription.regeneratePrimaryKey(RG(), SVC(), subscriptionId);
    const keys = await apim.subscription.listSecrets(RG(), SVC(), subscriptionId);
    return keys.primaryKey!;
  }

  async delete(subscriptionId: string): Promise<void> {
    const apim = getClient();
    await apim.subscription.delete(RG(), SVC(), subscriptionId, "*");

    // Clean up gateway mapping
    const gwUsers = getGatewayUsersTable();
    await gwUsers.deleteEntity("subscription", subscriptionId).catch(() => {});
  }

  async setQuota(subscriptionId: string, quotaKB: number | null): Promise<void> {
    const gwSubs = getGatewayUsersTable();
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
