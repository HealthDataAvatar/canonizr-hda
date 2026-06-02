import { vi } from "vitest";

export function mockServices() {
  return {
    keys: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "key-1", primaryKey: "pk_1" }),
      get: vi.fn().mockResolvedValue("pk_1"),
      rotate: vi.fn().mockResolvedValue("pk_rotated"),
      delete: vi.fn().mockResolvedValue(undefined),
      setQuota: vi.fn().mockResolvedValue(undefined),
    },
    billing: {
      getUsage: vi.fn().mockResolvedValue({ totalUnits: 0, periodStart: "", periodEnd: "" }),
      getInvoices: vi.fn().mockResolvedValue([]),
      createCustomer: vi.fn().mockResolvedValue({ customerId: "cus_1", subscriptionId: "sub_1", isReturning: false }),
      createBillingPortalSession: vi.fn().mockResolvedValue("https://billing.example.com"),
      hasPaymentMethod: vi.fn().mockResolvedValue(false),
    },
  };
}
