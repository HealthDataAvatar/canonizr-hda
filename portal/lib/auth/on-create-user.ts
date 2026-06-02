import { logger } from "@/lib/logger";
import type { KeyStore, BillingStore } from "@/lib/services";

export interface AppendConfig {
  (userId: string, changedBy: string): Promise<void>;
}

export interface AppendPermissions {
  (userId: string, stripeCustomerId: string, changedBy: string): Promise<void>;
}

/**
 * Called when a new user first signs in. Idempotent — safe to re-run
 * if a previous attempt partially failed.
 *
 * 1. Tries to create a Stripe customer (non-fatal if it fails)
 * 2. Appends initial UserConfig and UserPermissions
 * 3. Creates a default API key if the user has none
 */
export async function onCreateUser(
  user: { id?: string; email?: string | null },
  services: { keys: KeyStore; billing: BillingStore },
  appendInitialConfig: AppendConfig,
  appendInitialPermissions: AppendPermissions,
): Promise<{ customerId: string; keyId: string | null } | null> {
  if (!user.id || !user.email) return null;

  let customerId = "";
  try {
    const result = await services.billing.createCustomer(user.email);
    customerId = result.customerId;
  } catch (e) {
    logger.error({ err: e, email: user.email }, "Failed to create Stripe customer");
  }

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
