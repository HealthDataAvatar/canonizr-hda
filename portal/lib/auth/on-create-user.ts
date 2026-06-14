import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-interface";
import type { KeyStore, BillingStore } from "@/lib/services";

export interface AppendConfig {
  (userId: string, changedBy: string): Promise<void>;
}

export interface AppendPermissions {
  (userId: string, stripeCustomerId: string, changedBy: string): Promise<void>;
}

/**
 * Called when a new user first signs in. Stripe customer creation is
 * mandatory -- if it fails, the whole signup fails (no key issued).
 *
 * 1. Creates a Stripe customer + subscription (fatal on failure)
 * 2. Writes GwBilling lookup (stripe_customer_id + billing_anchor_day)
 * 3. Appends initial UserConfig and UserPermissions
 * 4. Creates a default API key if the user has none
 */
export async function onCreateUser(
  user: { id?: string; email?: string | null },
  services: { keys: KeyStore; billing: BillingStore },
  appendInitialConfig: AppendConfig,
  appendInitialPermissions: AppendPermissions,
): Promise<{ customerId: string; keyId: string | null }> {
  if (!user.id || !user.email) {
    throw new Error("User ID and email are required for account setup");
  }

  // Stripe is mandatory — let this throw on failure
  const { customerId, subscriptionId } = await services.billing.createCustomer(user.email);

  // Derive billing anchor day from subscription creation (today)
  const billingAnchorDay = new Date().getUTCDate();

  // Write GwBilling lookup (gateway + usage reporter read this)
  const gwBilling = getTableClient(TableName.GW_BILLING);
  await gwBilling.upsertEntity({
    partitionKey: "billing",
    rowKey: user.id,
    stripe_customer_id: customerId,
    billing_anchor_day: billingAnchorDay,
  });

  await appendInitialConfig(user.id, "system");
  await appendInitialPermissions(user.id, customerId, "system");

  const existingKeys = await services.keys.list(user.id);
  let keyId: string | null = null;
  if (existingKeys.length === 0) {
    const result = await services.keys.create(user.id, "my-first-key");
    keyId = result.id;
  }

  return { customerId, keyId };
}
