/**
 * Ensure a user has all required data (config, permissions, default key).
 * Idempotent — safe to call on every request. Caches in memory per user.
 *
 * Only creates a default key if config is also missing — meaning onCreateUser
 * never ran. If config exists, the user was fully set up and any missing keys
 * are intentional (user deleted them).
 */

import { getCurrentConfig, appendConfig, getDefaults } from "@/lib/data/tables/user-config";
import { getCurrentPermissions, appendPermissions } from "@/lib/data/tables/user-permissions";
import { getServices } from "@/lib/services";

const setupComplete = new Set<string>();

export async function ensureUserSetup(userId: string, email: string): Promise<void> {
  if (setupComplete.has(userId)) return;

  const [config, perms] = await Promise.all([
    getCurrentConfig(userId),
    getCurrentPermissions(userId),
  ]);

  const isFirstSetup = !config.timestamp;
  const tasks: Promise<void>[] = [];

  if (isFirstSetup) {
    tasks.push(
      appendConfig(userId, {
        ...getDefaults(),
        changedBy: "system",
      }),
    );
  }

  if (!perms.timestamp) {
    tasks.push(
      appendPermissions(userId, {
        isAdmin: false,
        blocked: false,
        stripeCustomerId: "",
        billingStatus: "",
        hasPaymentMethod: false,
        changedBy: "system",
      }),
    );
  }

  if (isFirstSetup) {
    const { keys } = getServices();
    const existingKeys = await keys.list(userId);
    if (existingKeys.length === 0) {
      tasks.push(
        keys.create(userId, "my-first-key").then(() => {}),
      );
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }

  // Retry Stripe customer creation if it failed during sign-up
  if (!perms.stripeCustomerId && perms.timestamp) {
    try {
      const { billing } = getServices();
      const { customerId } = await billing.createCustomer(email);
      if (customerId) {
        await appendPermissions(userId, {
          ...perms,
          stripeCustomerId: customerId,
          changedBy: "system",
        });
      }
    } catch {
      // Non-fatal — retries on next process restart
    }
  }

  setupComplete.add(userId);
}
