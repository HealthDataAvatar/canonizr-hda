/**
 * Shared Redis client for the portal.
 *
 * Used for write-through caching of quota limits so the gateway
 * picks them up immediately.
 *
 * Connection: REDIS_URL env var.
 * Azure Managed Redis (port 10000) uses TLS; local dev uses plain Redis.
 *
 * Note: Azure Managed Redis is clustered internally but its proxy endpoint
 * handles slot routing — connect as a standard client, not ioredis Cluster.
 */

import Redis from "ioredis";

let _client: Redis | null = null;

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!_client) {
    _client = new Redis(url);
  }

  return _client;
}
