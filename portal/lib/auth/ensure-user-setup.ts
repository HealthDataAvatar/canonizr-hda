/**
 * Ensure a user has their config and default key. Idempotent — safe to call on
 * every request. Caches in memory per user.
 *
 * Only provisions when config is missing (meaning the user is brand new). A
 * missing key on an already-configured user is intentional (they deleted it).
 *
 * Stripe customer + permissions are written once by `onCreateUser`.
 */

import { getCurrentConfig, appendConfig, getDefaults } from "@/lib/data/tables/user-config";
import { getServices } from "@/lib/services";

const setupComplete = new Set<string>();

export async function ensureUserSetup(userId: string): Promise<void> {
  if (setupComplete.has(userId)) return;

  const config = await getCurrentConfig(userId);

  if (!config.timestamp) {
    await appendConfig(userId, { ...getDefaults(), changedBy: "system" });

    const { keys } = getServices();
    const existingKeys = await keys.list(userId);
    if (existingKeys.length === 0) {
      await keys.create(userId, "my-first-key");
    }
  }

  setupComplete.add(userId);
}
