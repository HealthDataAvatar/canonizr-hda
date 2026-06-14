import { describe, it, expect, vi } from "vitest";
import { onCreateUser } from "@/lib/auth/on-create-user";
import { mockServices } from "@/lib/__tests__/mocks";

// Mock the table client used for GwBilling writes
const mockUpsertEntity = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/data/table-client", () => ({
  getTableClient: () => ({ upsertEntity: mockUpsertEntity }),
}));

describe("onCreateUser", () => {
  const appendConfig = vi.fn().mockResolvedValue(undefined);
  const appendPerms = vi.fn().mockResolvedValue(undefined);

  it("creates customer, appends config + permissions, writes GwBilling, and provisions key", async () => {
    const svc = mockServices();
    appendConfig.mockClear();
    appendPerms.mockClear();
    mockUpsertEntity.mockClear();

    const result = await onCreateUser(
      { id: "user-1", email: "test@example.com" },
      svc,
      appendConfig,
      appendPerms,
    );

    expect(svc.billing.createCustomer).toHaveBeenCalledWith("test@example.com");
    expect(mockUpsertEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionKey: "billing",
        rowKey: "user-1",
        stripe_customer_id: "cus_1",
      }),
    );
    expect(appendConfig).toHaveBeenCalledWith("user-1", "system");
    expect(appendPerms).toHaveBeenCalledWith("user-1", "cus_1", "system");
    expect(svc.keys.list).toHaveBeenCalledWith("user-1");
    expect(svc.keys.create).toHaveBeenCalledWith("user-1", "my-first-key");
    expect(result).toEqual({ customerId: "cus_1", keyId: "key-1" });
  });

  it("skips key creation if user already has keys (idempotent)", async () => {
    const svc = mockServices();
    svc.keys.list.mockResolvedValue([{ id: "existing-key", displayName: "my-first-key" }]);

    const result = await onCreateUser(
      { id: "user-1", email: "test@example.com" },
      svc,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    expect(svc.keys.create).not.toHaveBeenCalled();
    expect(result).toEqual({ customerId: "cus_1", keyId: null });
  });

  it("runs in order: billing -> GwBilling -> config -> permissions -> list -> key", async () => {
    const order: string[] = [];
    const svc = mockServices();
    svc.billing.createCustomer.mockImplementation(async () => {
      order.push("billing");
      return { customerId: "cus_1", subscriptionId: "sub_1", isReturning: false };
    });
    mockUpsertEntity.mockImplementation(async () => { order.push("gwbilling"); });
    svc.keys.list.mockImplementation(async () => {
      order.push("list");
      return [];
    });
    svc.keys.create.mockImplementation(async () => {
      order.push("key");
      return { id: "k", primaryKey: "pk" };
    });
    const config = vi.fn().mockImplementation(async () => { order.push("config"); });
    const perms = vi.fn().mockImplementation(async () => { order.push("perms"); });

    await onCreateUser({ id: "u", email: "a@b.com" }, svc, config, perms);
    expect(order).toEqual(["billing", "gwbilling", "config", "perms", "list", "key"]);
  });

  it("throws if user has no id", async () => {
    const svc = mockServices();
    await expect(
      onCreateUser({ email: "a@b.com" }, svc, vi.fn(), vi.fn()),
    ).rejects.toThrow("User ID and email are required");
    expect(svc.billing.createCustomer).not.toHaveBeenCalled();
  });

  it("throws if user has no email", async () => {
    const svc = mockServices();
    await expect(
      onCreateUser({ id: "u" }, svc, vi.fn(), vi.fn()),
    ).rejects.toThrow("User ID and email are required");
    expect(svc.billing.createCustomer).not.toHaveBeenCalled();
  });

  it("throws when Stripe fails (mandatory)", async () => {
    const svc = mockServices();
    svc.billing.createCustomer.mockRejectedValue(new Error("Stripe down"));

    await expect(
      onCreateUser({ id: "u", email: "a@b.com" }, svc, vi.fn(), vi.fn()),
    ).rejects.toThrow("Stripe down");
  });
});
