import { DEV_MODE } from "./dev";
import { randomUUID } from "crypto";

export interface ApimKey {
  id: string;
  displayName: string;
  createdDate: string;
  lastUsed: string;
  usageKB: number;
  quotaKB: number | null;
}

// ---------------------------------------------------------------------------
// Dev mode — in-memory store
// ---------------------------------------------------------------------------

const devKeys: ApimKey[] = [
  { id: "dev-sub-001", displayName: "agent-bold-crane", createdDate: "20 May 2026", lastUsed: "2 hours ago", usageKB: 3200, quotaKB: 10000 },
  { id: "dev-sub-002", displayName: "agent-quiet-raven", createdDate: "25 May 2026", lastUsed: "5 min ago", usageKB: 800, quotaKB: null },
];

// ---------------------------------------------------------------------------
// Real implementation
// ---------------------------------------------------------------------------

function getClient() {
  const { ApiManagementClient } = require("@azure/arm-apimanagement") as typeof import("@azure/arm-apimanagement");
  const { DefaultAzureCredential } = require("@azure/identity") as typeof import("@azure/identity");
  return new ApiManagementClient(
    new DefaultAzureCredential(),
    process.env.AZURE_SUBSCRIPTION_ID!
  );
}

const RESOURCE_GROUP = () => process.env.APIM_RESOURCE_GROUP!;
const SERVICE_NAME = () => process.env.APIM_SERVICE_NAME!;
const PRODUCT_ID = "paid";

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function listSubscriptions(userId: string): Promise<ApimKey[]> {
  if (DEV_MODE) return [...devKeys];

  const apim = getClient();
  const results: ApimKey[] = [];
  for await (const sub of apim.subscription.list(RESOURCE_GROUP(), SERVICE_NAME())) {
    if (sub.displayName?.startsWith(`user:${userId}:`)) {
      results.push({
        id: sub.name!,
        displayName: sub.displayName.replace(`user:${userId}:`, ""),
        createdDate: sub.createdDate?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) ?? "",
        lastUsed: "—",
        usageKB: 0,
        quotaKB: null,
      });
    }
  }
  return results;
}

export async function createSubscription(
  userId: string,
  keyName: string
): Promise<{ id: string; primaryKey: string }> {
  if (DEV_MODE) {
    const id = `dev-sub-${randomUUID().slice(0, 8)}`;
    const primaryKey = `dev_${randomUUID().replace(/-/g, "")}`;
    devKeys.push({
      id,
      displayName: keyName,
      createdDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      lastUsed: "Never",
      usageKB: 0,
      quotaKB: null,
    });
    return { id, primaryKey };
  }

  const apim = getClient();
  const sid = `user-${userId}-${Date.now()}`;
  await apim.subscription.createOrUpdate(
    RESOURCE_GROUP(),
    SERVICE_NAME(),
    sid,
    {
      displayName: `user:${userId}:${keyName}`,
      scope: `/products/${PRODUCT_ID}`,
      state: "active",
    }
  );
  const keys = await apim.subscription.listSecrets(RESOURCE_GROUP(), SERVICE_NAME(), sid);
  return { id: sid, primaryKey: keys.primaryKey! };
}

export async function deleteSubscription(subscriptionId: string): Promise<void> {
  if (DEV_MODE) {
    const idx = devKeys.findIndex((k) => k.id === subscriptionId);
    if (idx >= 0) devKeys.splice(idx, 1);
    return;
  }

  const apim = getClient();
  await apim.subscription.delete(RESOURCE_GROUP(), SERVICE_NAME(), subscriptionId, "*");
}

export async function rotateKey(subscriptionId: string): Promise<string> {
  if (DEV_MODE) {
    return `dev_${randomUUID().replace(/-/g, "")}`;
  }

  const apim = getClient();
  await apim.subscription.regeneratePrimaryKey(RESOURCE_GROUP(), SERVICE_NAME(), subscriptionId);
  const keys = await apim.subscription.listSecrets(RESOURCE_GROUP(), SERVICE_NAME(), subscriptionId);
  return keys.primaryKey!;
}
