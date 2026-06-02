/** Reverse lookup: stripeCustomerId -> userId. */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";
import { getRedis } from "@/lib/redis";

const CACHE_TTL = 3600; // 1 hour

export async function getUserIdByStripeCustomerId(
  customerId: string,
): Promise<string | null> {
  const cacheKey = `stripe:${customerId}:user_id`;

  const redis = getRedis();
  if (redis) {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
  }

  const client = getTableClient(TableName.USER_PERMISSIONS);
  const entities = client.listEntities({
    queryOptions: {
      filter: `stripeCustomerId eq '${customerId}'`,
    },
  });

  for await (const entity of entities) {
    const userId = entity.partitionKey as string;
    if (redis) {
      await redis.set(cacheKey, userId, "EX", CACHE_TTL);
    }
    return userId;
  }

  return null;
}
