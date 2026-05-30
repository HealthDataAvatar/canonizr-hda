import type { KeyStore, BillingStore } from "@/lib/services";

/**
 * Called when a new user first signs in. Idempotent — safe to re-run
 * if a previous attempt partially failed.
 *
 * 1. Creates (or finds) a Stripe customer by email
 * 2. Links the Stripe customer ID to the user record
 * 3. Creates a default API key if the user has none
 */
export async function onCreateUser(
  user: { id?: string; email?: string | null },
  services: { keys: KeyStore; billing: BillingStore },
  updateUserRecord: (userId: string, fields: Record<string, unknown>) => Promise<void>,
): Promise<{ customerId: string; keyId: string | null } | null> {
  if (!user.id || !user.email) return null;

  const { customerId } = await services.billing.createCustomer(user.email);

  await updateUserRecord(user.id, { stripeCustomerId: customerId });

  const existingKeys = await services.keys.list(user.id);
  let keyId: string | null = null;
  if (existingKeys.length === 0) {
    const result = await services.keys.create(user.id, "my-first-key");
    keyId = result.id;
  }

  return { customerId, keyId };
}
