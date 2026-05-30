import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Verification token adapter tests (mocked TableClient)
// ---------------------------------------------------------------------------

const store = new Map<string, Record<string, unknown>>();

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
  deleteEntity: vi.fn().mockImplementation(async (pk: string, rk: string) => {
    store.delete(`${pk}:${rk}`);
  }),
};

vi.mock("@azure/data-tables", () => ({
  TableClient: {
    fromConnectionString: () => mockTableClient,
  },
}));

const { AzureTableStorageAdapter } = await import("@/lib/services/auth-adapter");

describe("verification tokens", () => {
  let adapter: ReturnType<typeof AzureTableStorageAdapter>;

  beforeEach(() => {
    store.clear();
    adapter = AzureTableStorageAdapter("fake-connection-string");
  });

  it("creates and consumes a token", async () => {
    const token = {
      identifier: "user@example.com",
      token: "abc123",
      expires: new Date(Date.now() + 60_000),
    };

    await adapter.createVerificationToken!(token);

    const result = await adapter.useVerificationToken!({
      identifier: "user@example.com",
      token: "abc123",
    });

    expect(result).not.toBeNull();
    expect(result!.identifier).toBe("user@example.com");
    expect(result!.token).toBe("abc123");
  });

  it("returns null for wrong token value", async () => {
    await adapter.createVerificationToken!({
      identifier: "user@example.com",
      token: "abc123",
      expires: new Date(Date.now() + 60_000),
    });

    const result = await adapter.useVerificationToken!({
      identifier: "user@example.com",
      token: "wrong-token",
    });

    expect(result).toBeNull();
  });

  it("returns null when token does not exist", async () => {
    const result = await adapter.useVerificationToken!({
      identifier: "nobody@example.com",
      token: "abc123",
    });

    expect(result).toBeNull();
  });

  it("token can only be used once", async () => {
    await adapter.createVerificationToken!({
      identifier: "user@example.com",
      token: "abc123",
      expires: new Date(Date.now() + 60_000),
    });

    await adapter.useVerificationToken!({
      identifier: "user@example.com",
      token: "abc123",
    });

    const second = await adapter.useVerificationToken!({
      identifier: "user@example.com",
      token: "abc123",
    });

    expect(second).toBeNull();
  });

  it("requesting a new token overwrites the previous one", async () => {
    await adapter.createVerificationToken!({
      identifier: "user@example.com",
      token: "first-token",
      expires: new Date(Date.now() + 60_000),
    });

    await adapter.createVerificationToken!({
      identifier: "user@example.com",
      token: "second-token",
      expires: new Date(Date.now() + 60_000),
    });

    const old = await adapter.useVerificationToken!({
      identifier: "user@example.com",
      token: "first-token",
    });
    expect(old).toBeNull();

    const current = await adapter.useVerificationToken!({
      identifier: "user@example.com",
      token: "second-token",
    });
    expect(current).not.toBeNull();
    expect(current!.token).toBe("second-token");
  });
});
