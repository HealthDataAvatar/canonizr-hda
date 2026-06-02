import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListEntities = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();

vi.mock("@/lib/data/table-client", () => ({
  getTableClient: () => ({
    listEntities: mockListEntities,
  }),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ get: mockRedisGet, set: mockRedisSet }),
}));

import { getUserIdByStripeCustomerId } from "../user-permissions-lookup";

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
});

describe("getUserIdByStripeCustomerId", () => {
  it("returns userId from Table Storage when not cached", async () => {
    mockListEntities.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { partitionKey: "user_42" };
      },
    });

    const result = await getUserIdByStripeCustomerId("cus_abc");
    expect(result).toBe("user_42");
    expect(mockRedisSet).toHaveBeenCalledWith("stripe:cus_abc:user_id", "user_42", "EX", 3600);
  });

  it("returns cached userId from Redis", async () => {
    mockRedisGet.mockResolvedValue("user_cached");

    const result = await getUserIdByStripeCustomerId("cus_abc");
    expect(result).toBe("user_cached");
    expect(mockListEntities).not.toHaveBeenCalled();
  });

  it("returns null when no matching entity exists", async () => {
    mockListEntities.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        // empty
      },
    });

    const result = await getUserIdByStripeCustomerId("cus_unknown");
    expect(result).toBeNull();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });
});
