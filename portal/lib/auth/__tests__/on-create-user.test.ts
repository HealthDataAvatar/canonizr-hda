import { describe, it, expect, vi } from "vitest";
import { onCreateUser } from "@/lib/auth/on-create-user";
import { mockServices } from "@/lib/__tests__/mocks";

describe("onCreateUser", () => {
  const appendConfig = vi.fn().mockResolvedValue(undefined);
  const appendPerms = vi.fn().mockResolvedValue(undefined);

  it("creates customer, appends config + permissions, and provisions key", async () => {
    const svc = mockServices();
    appendConfig.mockClear();
    appendPerms.mockClear();

    const result = await onCreateUser(
      { id: "user-1", email: "test@example.com" },
      svc,
      appendConfig,
      appendPerms,
    );

    expect(svc.billing.createCustomer).toHaveBeenCalledWith("test@example.com");
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

  it("runs in order: billing → config → permissions → list → key", async () => {
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
    const config = vi.fn().mockImplementation(async () => { order.push("config"); });
    const perms = vi.fn().mockImplementation(async () => { order.push("perms"); });

    await onCreateUser({ id: "u", email: "a@b.com" }, svc, config, perms);
    expect(order).toEqual(["billing", "config", "perms", "list", "key"]);
  });

  it("returns null if user has no id", async () => {
    const svc = mockServices();
    const result = await onCreateUser({ email: "a@b.com" }, svc, vi.fn(), vi.fn());
    expect(result).toBeNull();
    expect(svc.billing.createCustomer).not.toHaveBeenCalled();
  });

  it("returns null if user has no email", async () => {
    const svc = mockServices();
    const result = await onCreateUser({ id: "u" }, svc, vi.fn(), vi.fn());
    expect(result).toBeNull();
    expect(svc.billing.createCustomer).not.toHaveBeenCalled();
  });

  it("continues with empty customerId when Stripe fails", async () => {
    const svc = mockServices();
    svc.billing.createCustomer.mockRejectedValue(new Error("Stripe down"));
    const config = vi.fn().mockResolvedValue(undefined);
    const perms = vi.fn().mockResolvedValue(undefined);

    const result = await onCreateUser({ id: "u", email: "a@b.com" }, svc, config, perms);

    expect(config).toHaveBeenCalled();
    expect(perms).toHaveBeenCalledWith("u", "", "system");
    expect(svc.keys.create).toHaveBeenCalled();
    expect(result?.customerId).toBe("");
  });
});
