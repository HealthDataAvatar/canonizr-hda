# Redis Cluster Client Migration

## Current State

Worker is crashing in a retry loop with `redis.exceptions.MovedError` on `XREADGROUP`. Azure Managed Redis B0 Balanced uses OSS cluster policy — MOVED redirections are expected behaviour and clients must be cluster-aware.

We currently use `redis.asyncio.Redis` (standard client) everywhere because early testing with `RedisCluster` caused SSL certificate failures when it discovered internal shard IPs. The standard client worked initially but breaks when Azure reshards (maintenance, scaling).

### Symptoms

- Worker stuck in 60s backoff loop, `MovedError: 2866 20.49.168.11:8502`
- Gateway may also hit this intermittently on any Redis command
- Portal (ioredis) may have the same issue

### Root Cause

OSS cluster policy sends `MOVED` responses to redirect clients to the correct shard. Standard Redis client doesn't follow redirections. `RedisCluster` does, but tries to connect directly to internal shard IPs which may have SSL cert mismatches.

## Research Findings

### Cluster policy is immutable

You cannot change an Azure Managed Redis instance from OSS to Enterprise cluster policy — you must delete and recreate. So we must use a cluster-aware client.

### Microsoft's own docs are contradictory

- The [quickstart](https://learn.microsoft.com/en-us/azure/redis/python-get-started) uses `redis.Redis` (standard client) — but this is likely wrong/simplified and only works until a reshard.
- The [redis.io AMR guide](https://redis.io/docs/latest/develop/clients/redis-py/amr/) explicitly says to use `RedisCluster` because "AMR databases have clustering enabled by default."
- The [architecture page](https://learn.microsoft.com/en-us/azure/redis/architecture) confirms OSS cluster policy "requires your client library to support the Redis Cluster API."

### SSL cert issue

The original cert failure with `RedisCluster` happens because:
1. `RedisCluster` discovers shard IPs (e.g. `20.49.168.11:8502`) via `CLUSTER NODES`
2. It connects to those IPs directly over TLS
3. The TLS cert is issued for the proxy hostname, not the internal IPs — so hostname verification fails

Options:
- **`ssl_cert_reqs="none"`** — disables cert verification entirely. Not recommended for production by Redis or Azure docs. Risk: MITM attacks. However, all traffic stays within Azure's internal VNET, so practical risk is very low.
- **Supply Azure's CA cert** — the redis.io AMR guide shows `ssl_certfile`, `ssl_keyfile`, `ssl_ca_certs`. This is for Entra ID mTLS auth, not access key auth. With access key auth we don't have client certs.
- **`ssl_check_hostname=False`** — keeps cert chain validation but skips hostname matching. This is the right fix: the cert is valid (signed by a real CA), it's just issued for the proxy hostname, not the shard IP. Disabling hostname check is sufficient.

### RedisCluster + streams

`redis.asyncio.RedisCluster` supports all standard commands including `XREADGROUP`, `XADD`, `XACK` etc. Streams work fine in cluster mode as long as all operations on a given stream key hit the same slot (which they do — it's one key).

### ioredis (portal)

ioredis standard client also doesn't follow MOVED. If the portal hits a resharded slot, it will fail too. ioredis has `new Redis.Cluster([{host, port}], options)` for cluster mode.

## Plan

### Option A: RedisCluster with ssl_check_hostname=False (recommended)

Keep cert chain validation (the cert is signed by a trusted CA) but skip hostname verification (cert is for proxy hostname, not shard IPs). This is the standard approach for Redis clusters behind a proxy.

### Gateway + Worker (Python, redis-py)

Switch from `redis.asyncio.Redis` to `redis.asyncio.RedisCluster`.

```python
# Azure
client = RedisCluster(
    host=host, port=10000, password=key,
    ssl=True, ssl_check_hostname=False,
    decode_responses=True,
)

# Local dev
client = Redis(host="localhost", port=6379, decode_responses=True)
```

Key files:
- `gateway/app/queue.py` — Redis connection construction
- `gateway/app/quota.py` — Redis connection construction
- `gateway/app/user_resolver.py` — takes Redis instance
- `gateway/app/worker.py` — constructs Redis at startup
- `gateway/app/app.py` — constructs Redis at startup

Conditional construction: detect Azure by port 10000 or `rediss://` scheme in REDIS_URL.

### Portal (TypeScript, ioredis)

Switch from `new Redis(url)` to `new Redis.Cluster()` for Azure.

```typescript
// Azure
new Redis.Cluster([{ host, port: 10000 }], {
  redisOptions: { password, tls: { checkServerIdentity: () => undefined } },
});

// Local dev
new Redis(url);
```

Key file: `portal/lib/redis.ts`

### Local Dev

Local dev uses plain Redis on port 6379 — use standard `Redis`/`new Redis()`. The conditional is already conceptually in place (detect by URL scheme or port).

### Tests

- `FakeRedis` in gateway tests is unaffected (it's an in-memory fake)
- Integration tests use real Redis in Docker — plain Redis, standard client is correct
- No test changes needed

### MEMORY.md

Update the Redis section: remove "Do NOT use RedisCluster client" and replace with the correct guidance.

## Status

DONE. Changes:

- `gateway/app/quota.py` — `get_redis()` detects Azure by port 10000, constructs `RedisCluster` with `ssl_check_hostname=False`. Local dev unchanged (standard `Redis`).
- `gateway/app/user_resolver.py` — type annotation widened to accept `Redis | RedisCluster`
- `portal/lib/redis.ts` — `getRedis()` detects Azure by port 10000, constructs `Redis.Cluster` with `checkServerIdentity: () => undefined`. Local dev unchanged.
- MEMORY.md updated with correct Redis client guidance.
