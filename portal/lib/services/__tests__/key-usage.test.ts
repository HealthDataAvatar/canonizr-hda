/**
 * Tests that KeyStore.list() returns actual usage from Redis,
 * not hardcoded zeros. Covers both TableKeyStore and the shared
 * read-from-Redis logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { currentPeriodStart, quotaUsageKey } from "@/lib/pure/billing-period";

// ---------------------------------------------------------------------------
// Mock Table Storage
// ---------------------------------------------------------------------------

const store = new Map<string, Record<string, unknown>>();

function listEntities(opts?: { queryOptions?: { filter?: string } }) {
  const filter = opts?.queryOptions?.filter ?? "";
  const entries = [...store.values()].filter((e) => {
    if (!filter) return true;
    // Simple PK filter: PartitionKey eq 'value'
    const match = filter.match(/PartitionKey eq '([^']+)'/);
    return match ? e.partitionKey === match[1] : true;
  });
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const e of entries) yield e;
    },
  };
}

const mockTableClient = {
  createTable: vi.fn().mockResolvedValue(undefined),
  upsertEntity: vi.fn().mockImplementation(async (entity: Record<string, unknown>) => {
    store.set(`${entity.partitionKey}:${entity.rowKey}`, entity);
  }),
  getEntity: vi.fn().mockImplementation(async (pk: string, rk: string) => {
    const entity = store.get(`${pk}:${rk}`);
    if (!entity) throw new Error("Not found");
    return entity;
  }),
  deleteEntity: vi.fn(),
  listEntities,
};

vi.mock("@/lib/data/table-client", () => ({
  getTableClient: () => mockTableClient,
}));

// ---------------------------------------------------------------------------
// Mock Redis
// ---------------------------------------------------------------------------

const redisStore = new Map<string, string>();

const mockRedis = {
  get: vi.fn().mockImplementation(async (key: string) => redisStore.get(key) ?? null),
  set: vi.fn(),
  del: vi.fn(),
};

vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedis,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { TableKeyStore } = await import("@/lib/services/keys-table");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ANCHOR = 1;
const PS = currentPeriodStart(ANCHOR);

function seedKey(userId: string, keyId: string, name: string) {
  store.set(`${userId}:${keyId}`, {
    partitionKey: userId,
    rowKey: keyId,
    displayName: name,
    primaryKey: "pk_test",
    createdDate: new Date().toISOString(),
  });
  store.set(`subscription:${keyId}`, {
    partitionKey: "subscription",
    rowKey: keyId,
    user_id: userId,
    key_name: name,
  });
}

function seedBillingAnchor(userId: string, anchorDay: number = ANCHOR) {
  store.set(`billing:${userId}`, {
    partitionKey: "billing",
    rowKey: userId,
    billing_anchor_day: anchorDay,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KeyStore.list() usage from Redis", () => {
  let keyStore: InstanceType<typeof TableKeyStore>;

  beforeEach(() => {
    store.clear();
    redisStore.clear();
    mockRedis.get.mockClear();
    keyStore = new TableKeyStore();
  });

  it("returns usage from Redis when bytes are recorded", async () => {
    seedKey("user1", "key-1", "my-key");
    seedBillingAnchor("user1");
    redisStore.set(quotaUsageKey("key-1", PS), "512000"); // 600 KB (rounded up to 100KB unit)

    const keys = await keyStore.list("user1");

    expect(keys).toHaveLength(1);
    expect(keys[0].usageKB).toBe(600);
  });

  it("returns 0 when no Redis usage exists", async () => {
    seedKey("user1", "key-1", "my-key");
    seedBillingAnchor("user1");
    // No Redis entry

    const keys = await keyStore.list("user1");

    expect(keys).toHaveLength(1);
    expect(keys[0].usageKB).toBe(0);
  });

  it("returns per-key usage for multiple keys", async () => {
    seedKey("user1", "key-a", "first");
    seedKey("user1", "key-b", "second");
    seedBillingAnchor("user1");
    redisStore.set(quotaUsageKey("key-a", PS), "1048576"); // 1100 KB (rounded up to 100KB unit)
    redisStore.set(quotaUsageKey("key-b", PS), "2048");     // 100 KB (minimum billable unit)

    const keys = await keyStore.list("user1");

    const byId = Object.fromEntries(keys.map((k) => [k.id, k]));
    expect(byId["key-a"].usageKB).toBe(1100);
    expect(byId["key-b"].usageKB).toBe(100);
  });

  it("rounds up to minimum billable unit", async () => {
    seedKey("user1", "key-1", "my-key");
    seedBillingAnchor("user1");
    redisStore.set(quotaUsageKey("key-1", PS), "1"); // 1 byte = minimum 100 KB billable unit

    const keys = await keyStore.list("user1");

    expect(keys[0].usageKB).toBe(100);
  });

  it("reads the correct period-scoped Redis key", async () => {
    seedKey("user1", "key-42", "test");
    seedBillingAnchor("user1");
    await keyStore.list("user1");

    expect(mockRedis.get).toHaveBeenCalledWith(quotaUsageKey("key-42", PS));
  });
});
