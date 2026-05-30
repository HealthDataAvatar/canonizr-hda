import { describe, it, expect, vi } from "vitest";
import { onCreateUser } from "@/lib/auth/on-create-user";
import { mockServices } from "@/lib/__tests__/mocks";

describe("onCreateUser", () => {
  it("creates customer, updates record, and provisions key", async () => {
    const svc = mockServices();
    const updateRecord = vi.fn().mockResolvedValue(undefined);

    const result = await onCreateUser(
      { id: "user-1", email: "test@example.com" },
      svc,
      updateRecord,
    );

    expect(svc.billing.createCustomer).toHaveBeenCalledWith("test@example.com");
    expect(updateRecord).toHaveBeenCalledWith("user-1", { stripeCustomerId: "cus_1" });
    expect(svc.keys.list).toHaveBeenCalledWith("user-1");
    expect(svc.keys.create).toHaveBeenCalledWith("user-1", "my-first-key");
    expect(result).toEqual({ customerId: "cus_1", keyId: "key-1" });
  });

  it("skips key creation if user already has keys (idempotent)", async () => {
    const svc = mockServices();
    svc.keys.list.mockResolvedValue([{ id: "existing-key", displayName: "my-first-key" }]);
    const updateRecord = vi.fn().mockResolvedValue(undefined);

    const result = await onCreateUser(
      { id: "user-1", email: "test@example.com" },
      svc,
      updateRecord,
    );

    expect(svc.keys.create).not.toHaveBeenCalled();
    expect(result).toEqual({ customerId: "cus_1", keyId: null });
  });

  it("runs in order: billing → update → list → key", async () => {
    const order: string[] = [];
    const svc = mockServices();
    svc.billing.createCustomer.mockImplementation(async () => {
      order.push("billing");
      return { customerId: "cus_1", subscriptionId: "sub_1", isReturning: false };
    });
    svc.keys.list.mockImplementation(async () => {
      order.push("list");
      return [];
    });
    svc.keys.create.mockImplementation(async () => {
      order.push("key");
      return { id: "k", primaryKey: "pk" };
    });
    const updateRecord = vi.fn().mockImplementation(async () => {
      order.push("update");
    });

    await onCreateUser({ id: "u", email: "a@b.com" }, svc, updateRecord);
    expect(order).toEqual(["billing", "update", "list", "key"]);
  });

  it("returns null if user has no id", async () => {
    const svc = mockServices();
    const result = await onCreateUser({ email: "a@b.com" }, svc, vi.fn());
    expect(result).toBeNull();
    expect(svc.billing.createCustomer).not.toHaveBeenCalled();
  });

  it("returns null if user has no email", async () => {
    const svc = mockServices();
    const result = await onCreateUser({ id: "u" }, svc, vi.fn());
    expect(result).toBeNull();
    expect(svc.billing.createCustomer).not.toHaveBeenCalled();
  });

  it("propagates billing errors without creating key", async () => {
    const svc = mockServices();
    svc.billing.createCustomer.mockRejectedValue(new Error("Stripe down"));
    const updateRecord = vi.fn();

    await expect(
      onCreateUser({ id: "u", email: "a@b.com" }, svc, updateRecord),
    ).rejects.toThrow("Stripe down");

    expect(updateRecord).not.toHaveBeenCalled();
    expect(svc.keys.create).not.toHaveBeenCalled();
  });
});
