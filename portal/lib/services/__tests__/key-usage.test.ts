/**
 * Tests that KeyStore.list() returns actual usage from Redis,
 * not hardcoded zeros. Covers both TableKeyStore and the shared
 * read-from-Redis logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KeyStore.list() usage from Redis", () => {
  let keyStore: InstanceType<typeof TableKeyStore>;

  beforeEach(() => {
    store.clear();
    redisStore.clear();
    keyStore = new TableKeyStore();
  });

  it("returns usage from Redis when bytes are recorded", async () => {
    seedKey("user1", "key-1", "my-key");
    redisStore.set("sub:key-1:bytes", "512000"); // 500 KB

    const keys = await keyStore.list("user1");

    expect(keys).toHaveLength(1);
    expect(keys[0].usageKB).toBe(500);
  });

  it("returns 0 when no Redis usage exists", async () => {
    seedKey("user1", "key-1", "my-key");
    // No Redis entry

    const keys = await keyStore.list("user1");

    expect(keys).toHaveLength(1);
    expect(keys[0].usageKB).toBe(0);
  });

  it("returns per-key usage for multiple keys", async () => {
    seedKey("user1", "key-a", "first");
    seedKey("user1", "key-b", "second");
    redisStore.set("sub:key-a:bytes", "1048576"); // 1024 KB
    redisStore.set("sub:key-b:bytes", "2048");     // 2 KB

    const keys = await keyStore.list("user1");

    const byId = Object.fromEntries(keys.map((k) => [k.id, k]));
    expect(byId["key-a"].usageKB).toBe(1024);
    expect(byId["key-b"].usageKB).toBe(2);
  });

  it("rounds up partial KB", async () => {
    seedKey("user1", "key-1", "my-key");
    redisStore.set("sub:key-1:bytes", "1"); // 1 byte = ceil to 1 KB

    const keys = await keyStore.list("user1");

    expect(keys[0].usageKB).toBe(1);
  });

  it("reads the correct Redis key pattern (sub:{id}:bytes)", async () => {
    seedKey("user1", "key-42", "test");
    await keyStore.list("user1");

    expect(mockRedis.get).toHaveBeenCalledWith("sub:key-42:bytes");
  });
});
