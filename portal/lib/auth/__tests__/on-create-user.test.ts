import { describe, it, expect, vi } from "vitest";
import { onCreateUser } from "@/lib/auth/on-create-user";
import { mockServices } from "@/lib/__tests__/mocks";

// Mock the table client used for the GwBilling write
const mockUpsertEntity = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/data/table-client", () => ({
  getTableClient: () => ({ upsertEntity: mockUpsertEntity }),
}));

// Permissions are appended directly (no longer injected)
vi.mock("@/lib/data/tables/user-permissions", () => ({
  appendPermissions: vi.fn().mockResolvedValue(undefined),
}));
import { appendPermissions } from "@/lib/data/tables/user-permissions";

describe("onCreateUser", () => {
  it("creates customer, writes GwBilling, and appends permissions with the customer id", async () => {
    const svc = mockServices();
    mockUpsertEntity.mockClear();
    vi.mocked(appendPermissions).mockClear();

    const result = await onCreateUser({ id: "user-1", email: "test@example.com" }, svc);

    expect(svc.billing.createCustomer).toHaveBeenCalledWith("test@example.com");
    expect(mockUpsertEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionKey: "billing",
        rowKey: "user-1",
        stripe_customer_id: "cus_1",
      }),
    );
    expect(appendPermissions).toHaveBeenCalledWith("user-1", {
      isAdmin: false,
      blocked: false,
      delinquent: false,
      stripeCustomerId: "cus_1",
      changedBy: "system",
    });
    expect(result).toEqual({ customerId: "cus_1" });
  });

  it("throws if user has no id", async () => {
    const svc = mockServices();
    await expect(onCreateUser({ email: "a@b.com" }, svc)).rejects.toThrow(
      "User ID and email are required",
    );
    expect(svc.billing.createCustomer).not.toHaveBeenCalled();
  });

  it("throws if user has no email", async () => {
    const svc = mockServices();
    await expect(onCreateUser({ id: "u" }, svc)).rejects.toThrow(
      "User ID and email are required",
    );
    expect(svc.billing.createCustomer).not.toHaveBeenCalled();
  });

  it("throws when Stripe fails (mandatory)", async () => {
    const svc = mockServices();
    svc.billing.createCustomer.mockRejectedValue(new Error("Stripe down"));
    await expect(onCreateUser({ id: "u", email: "a@b.com" }, svc)).rejects.toThrow("Stripe down");
  });
});
