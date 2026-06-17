import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-interface";
import { appendPermissions } from "@/lib/data/tables/user-permissions";
import type { BillingStore } from "@/lib/services";

/**
 * Called when a new user first signs in. Owns the one-time billing setup that
 * nothing else can do (it's the only place holding the Stripe customer id):
 *
 * 1. Creates a Stripe customer (fatal on failure — no account without billing)
 * 2. Writes the GwBilling lookup (gateway + usage reporter read this)
 * 3. Appends initial UserPermissions carrying the Stripe customer id
 *
 * UserConfig and the default API key are provisioned by `ensureUserSetup`.
 */
export async function onCreateUser(
  user: { id?: string; email?: string | null },
  services: { billing: BillingStore },
): Promise<{ customerId: string }> {
  if (!user.id || !user.email) {
    throw new Error("User ID and email are required for account setup");
  }

  // Stripe is mandatory — let this throw on failure
  const { customerId } = await services.billing.createCustomer(user.email);

  // Write GwBilling lookup (gateway + usage reporter read this)
  const gwBilling = getTableClient(TableName.GW_BILLING);
  await gwBilling.upsertEntity({
    partitionKey: "billing",
    rowKey: user.id,
    stripe_customer_id: customerId,
    billing_anchor_day: new Date().getUTCDate(),
  });

  await appendPermissions(user.id, {
    isAdmin: false,
    blocked: false,
    stripeCustomerId: customerId,
    changedBy: "system",
  });

  return { customerId };
}
