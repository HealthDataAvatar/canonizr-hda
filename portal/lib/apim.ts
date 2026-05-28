import { ApiManagementClient } from "@azure/arm-apimanagement";
import { DefaultAzureCredential } from "@azure/identity";

const SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID!;
const RESOURCE_GROUP = process.env.APIM_RESOURCE_GROUP!;
const SERVICE_NAME = process.env.APIM_SERVICE_NAME!;
const PRODUCT_ID = "paid";

let client: ApiManagementClient | null = null;

function getClient(): ApiManagementClient {
  if (!client) {
    client = new ApiManagementClient(
      new DefaultAzureCredential(),
      SUBSCRIPTION_ID
    );
  }
  return client;
}

export interface ApimKey {
  id: string;
  displayName: string;
  createdDate: string;
  state: string;
}

/** List all APIM subscriptions owned by a user (filtered by displayName prefix). */
export async function listSubscriptions(userId: string): Promise<ApimKey[]> {
  const apim = getClient();
  const results: ApimKey[] = [];

  for await (const sub of apim.subscription.list(RESOURCE_GROUP, SERVICE_NAME)) {
    if (sub.displayName?.startsWith(`user:${userId}:`)) {
      results.push({
        id: sub.name!,
        displayName: sub.displayName.replace(`user:${userId}:`, ""),
        createdDate: sub.createdDate?.toISOString() ?? "",
        state: sub.state ?? "active",
      });
    }
  }
  return results;
}

/** Create a new APIM subscription for a user under the `paid` product. */
export async function createSubscription(
  userId: string,
  keyName: string
): Promise<{ id: string; primaryKey: string }> {
  const apim = getClient();
  const sid = `user-${userId}-${Date.now()}`;
  const result = await apim.subscription.createOrUpdate(
    RESOURCE_GROUP,
    SERVICE_NAME,
    sid,
    {
      displayName: `user:${userId}:${keyName}`,
      scope: `/products/${PRODUCT_ID}`,
      state: "active",
    }
  );

  const keys = await apim.subscription.listSecrets(
    RESOURCE_GROUP,
    SERVICE_NAME,
    sid
  );

  return {
    id: result.name!,
    primaryKey: keys.primaryKey!,
  };
}

/** Delete an APIM subscription. */
export async function deleteSubscription(subscriptionId: string): Promise<void> {
  const apim = getClient();
  await apim.subscription.delete(
    RESOURCE_GROUP,
    SERVICE_NAME,
    subscriptionId,
    "*"
  );
}

/** Rotate (regenerate) the primary key for a subscription. Returns the new key. */
export async function rotateKey(subscriptionId: string): Promise<string> {
  const apim = getClient();
  await apim.subscription.regeneratePrimaryKey(
    RESOURCE_GROUP,
    SERVICE_NAME,
    subscriptionId
  );
  const keys = await apim.subscription.listSecrets(
    RESOURCE_GROUP,
    SERVICE_NAME,
    subscriptionId
  );
  return keys.primaryKey!;
}
