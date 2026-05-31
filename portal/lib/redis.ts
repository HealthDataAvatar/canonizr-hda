/**
 * Shared Redis client for the portal.
 *
 * Used for write-through caching of quota limits so the gateway
 * picks them up immediately.
 *
 * Connection: REDIS_URL env var.
 * Azure Managed Redis uses clustering (port 10000); local dev uses standard Redis.
 */

import Redis, { Cluster } from "ioredis";

let _client: Redis | Cluster | null = null;

export function getRedis(): Redis | Cluster | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!_client) {
    if (url.includes(":10000")) {
      // Azure Managed Redis — clustered even on smallest tier
      const parsed = new URL(url);
      _client = new Cluster(
        [{ host: parsed.hostname, port: 10000 }],
        {
          redisOptions: {
            password: decodeURIComponent(parsed.password),
            tls: { servername: parsed.hostname },
          },
          dnsLookup: (address, callback) => callback(null, address),
        },
      );
    } else {
      _client = new Redis(url);
    }
  }

  return _client;
}
