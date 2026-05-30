/**
 * KeyStore backed by Azure API Management.
 * Production implementation.
 *
 * On key creation, also writes a subscription → user mapping to the gateway's
 * Table Storage so the conversion API can resolve the APIM subscription ID
 * to a user and encryption key.
 */

import { TableClient } from "@azure/data-tables";
import type { ApiKey, KeyStore } from "./services";
import { TableName } from "./table-names";

function getClient() {
  const { ApiManagementClient } = require("@azure/arm-apimanagement") as typeof import("@azure/arm-apimanagement");
  const { DefaultAzureCredential } = require("@azure/identity") as typeof import("@azure/identity");
  return new ApiManagementClient(
    new DefaultAzureCredential(),
    process.env.AZURE_SUBSCRIPTION_ID!,
  );
}

function getGatewayUsersTable() {
  const connStr = process.env.TABLE_STORAGE_CONNECTION_STRING!;
  const opts = connStr.includes("http://") ? { allowInsecureConnection: true } : {};
  return TableClient.fromConnectionString(connStr, TableName.GW_SUBSCRIPTIONS, opts);
}

const RG = () => process.env.APIM_RESOURCE_GROUP!;
const SVC = () => process.env.APIM_SERVICE_NAME!;
const PRODUCT_ID = "paid";

export class ApimKeyStore implements KeyStore {
  async list(userId: string): Promise<ApiKey[]> {
    const apim = getClient();
    const results: ApiKey[] = [];
    for await (const sub of apim.subscription.list(RG(), SVC())) {
      if (sub.displayName?.startsWith(`user:${userId}:`)) {
        const secrets = await apim.subscription.listSecrets(RG(), SVC(), sub.name!);
        results.push({
          id: sub.name!,
          displayName: sub.displayName.replace(`user:${userId}:`, ""),
          keyHint: secrets.primaryKey?.slice(-4) ?? "",
          createdDate: sub.createdDate?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) ?? "",
          lastUsed: "—",
          usageKB: 0,
          quotaKB: null,
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
}
