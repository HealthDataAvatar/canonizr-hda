/**
 * KeyStore backed by Azure API Management.
 * Production implementation.
 *
 * On key creation, also writes a subscription → user mapping to the gateway's
 * Table Storage so the conversion API can resolve the APIM subscription ID
 * to a user and encryption key.
 */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-interface";
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
    const gwSubs = getGatewayUsersTable();
    const redis = getRedis();

    // 1. Query GwSubscriptions for this user's keys (single table scan)
    const subs: { id: string; keyName: string; quotaKB: number | null }[] = [];
    for await (const entity of gwSubs.listEntities({
      queryOptions: { filter: `user_id eq '${userId}'` },
    })) {
      const raw = entity.quota_bytes;
      const quotaKB = raw != null && Number(raw) > 0 ? Math.round(Number(raw) / 1024) : null;
      subs.push({ id: entity.rowKey as string, keyName: entity.key_name as string, quotaKB });
    }

    // 2. Fetch APIM secrets, subscription details, and Redis usage in parallel per key
    const apim = getClient();
    const results = await Promise.all(
      subs.map(async (sub) => {
        const [secrets, apimSub, usageBytes] = await Promise.all([
          apim.subscription.listSecrets(RG(), SVC(), sub.id),
          apim.subscription.get(RG(), SVC(), sub.id),
          redis ? redis.get(`sub:${sub.id}:bytes`) : null,
        ]);
        return {
          id: sub.id,
          displayName: sub.keyName,
          key: secrets.primaryKey ?? "",
          createdDate: apimSub.createdDate?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) ?? "",
          lastUsed: "—",
          usageKB: usageBytes ? Math.ceil(Number(usageBytes) / 1024) : 0,
          quotaKB: sub.quotaKB,
        };
      }),
    );
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
