/**
 * Shared Redis client for the portal.
 *
 * Used for write-through caching of quota limits so the gateway
 * picks them up immediately.
 *
 * Connection: REDIS_URL env var.
 * Azure Managed Redis (port 10000) uses TLS + OSS clustering.
 * Local dev uses plain Redis on port 6379.
 */

import Redis, { Cluster } from "ioredis";

let _client: Redis | Cluster | null = null;

function isAzureRedis(url: string): boolean {
  try {
    return new URL(url).port === "10000";
  } catch {
    return false;
  }
}

export function getRedis(): Redis | Cluster | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!_client) {
    if (isAzureRedis(url)) {
      const parsed = new URL(url);
      _client = new Cluster(
        [{ host: parsed.hostname, port: Number(parsed.port) }],
        {
          redisOptions: {
            password: decodeURIComponent(parsed.password),
            tls: { checkServerIdentity: () => undefined },
            maxRetriesPerRequest: 1,
          },
          scaleReads: "master",
        },
      );
    } else {
      _client = new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => Math.min(times * 500, 5000),
      });
    }
    _client.on("error", () => {});
  }

  return _client;
}
