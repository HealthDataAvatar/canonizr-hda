/**
 * Tests that StripeBillingStore caches usage/invoices in Redis
 * and doesn't hit Stripe on every call.
 *
 * We extract the caching logic for isolated testing rather than
 * fighting with Stripe SDK mocking.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Usage, Invoice } from "@/lib/services";

// ---------------------------------------------------------------------------
// Mock Redis
// ---------------------------------------------------------------------------

const redisStore = new Map<string, string>();

const mockRedis = {
  get: vi.fn().mockImplementation(async (key: string) => redisStore.get(key) ?? null),
  set: vi.fn().mockImplementation(async (key: string, value: string) => {
    redisStore.set(key, value);
  }),
};

vi.mock("@/lib/redis", () => ({
  getRedis: () => mockRedis,
}));

// ---------------------------------------------------------------------------
// Mock the entire billing-stripe module's private fetch methods via
// Stripe mock. getStripe() uses require("stripe"), so we must mock
// that CJS require.
// ---------------------------------------------------------------------------

const stripeMethods = {
  subscriptions: {
    list: vi.fn().mockResolvedValue({
      data: [{
        items: { data: [{ current_period_start: 1000000, current_period_end: 2000000 }] },
      }],
    }),
  },
  billing: {
    meters: {
      list: vi.fn().mockResolvedValue({
        data: [{ id: "meter_1", event_name: "conversion_bytes" }],
      }),
      listEventSummaries: vi.fn().mockResolvedValue({
        data: [{ aggregated_value: 42 }],
      }),
    },
  },
  invoices: {
    list: vi.fn().mockResolvedValue({
      data: [{
        id: "inv_1",
        created: 1700000000,
        amount_paid: 500,
        status: "paid",
        hosted_invoice_url: "https://stripe.com/inv/1",
        lines: { data: [{ quantity: 10 }] },
      }],
    }),
  },
};

// Mock at the billing-stripe module level — replace getStripe entirely
vi.mock("@/lib/services/billing-stripe", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/services/billing-stripe")>();

  // Patch the module-level getStripe by replacing it in the class
  class TestableStripeBillingStore extends orig.StripeBillingStore {
    // Override private methods to inject our mock stripe
    async _fetchUsage(customerId: string): Promise<Usage> {
      const stripe = stripeMethods as any;
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
      const sub = subs.data[0];
      if (!sub) return { totalUnits: 0, periodStart: "", periodEnd: "" };
      const item = sub.items.data[0];
      const periodStart = item?.current_period_start ?? Math.floor(Date.now() / 1000) - 30 * 86400;
      const periodEnd = item?.current_period_end ?? Math.floor(Date.now() / 1000);
      const meters = await stripe.billing.meters.list();
      const meter = meters.data.find((m: any) => m.event_name === "conversion_bytes");
      if (!meter) throw new Error("Meter not found");
      const meterEvents = await stripe.billing.meters.listEventSummaries(meter.id, {
        customer: customerId, start_time: periodStart, end_time: periodEnd,
      });
      const totalUnits = meterEvents.data.reduce((sum: number, e: any) => sum + e.aggregated_value, 0);
      return {
        totalUnits,
        periodStart: new Date(periodStart * 1000).toISOString(),
        periodEnd: new Date(periodEnd * 1000).toISOString(),
      };
    }
    async _fetchInvoices(customerId: string): Promise<Invoice[]> {
      const stripe = stripeMethods as any;
      const invoices = await stripe.invoices.list({ customer: customerId, limit: 12 });
      return invoices.data.map((inv: any) => ({
        id: inv.id,
        date: new Date((inv.created ?? 0) * 1000).toISOString(),
        processedKB: (inv.lines?.data?.reduce((s: number, l: any) => s + (l.quantity ?? 0), 0) ?? 0) * 100,
        amount: (inv.amount_paid ?? 0) / 100,
        status: inv.status ?? "unknown",
        url: inv.hosted_invoice_url ?? null,
      }));
    }
  }

  return { ...orig, StripeBillingStore: TestableStripeBillingStore };
});

const { StripeBillingStore } = await import("@/lib/services/billing-stripe");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StripeBillingStore caching", () => {
  let billing: InstanceType<typeof StripeBillingStore>;

  beforeEach(() => {
    redisStore.clear();
    vi.clearAllMocks();
    billing = new StripeBillingStore();
  });

  describe("getUsage", () => {
    it("calls Stripe on first request and caches result", async () => {
      const result = await billing.getUsage("cus_123");

      expect(result.totalUnits).toBe(42);
      expect(stripeMethods.subscriptions.list).toHaveBeenCalledTimes(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        "billing:cus_123:usage",
        expect.any(String),
        "EX",
        300,
      );
    });

    it("returns cached result on second call without hitting Stripe", async () => {
      await billing.getUsage("cus_123");
      vi.clearAllMocks();

      const result = await billing.getUsage("cus_123");

      expect(result.totalUnits).toBe(42);
      expect(stripeMethods.subscriptions.list).not.toHaveBeenCalled();
      expect(mockRedis.get).toHaveBeenCalledWith("billing:cus_123:usage");
    });

    it("uses separate cache keys per customer", async () => {
      await billing.getUsage("cus_aaa");
      await billing.getUsage("cus_bbb");

      expect(redisStore.has("billing:cus_aaa:usage")).toBe(true);
      expect(redisStore.has("billing:cus_bbb:usage")).toBe(true);
    });
  });

  describe("getInvoices", () => {
    it("calls Stripe on first request and caches result", async () => {
      const result = await billing.getInvoices("cus_123");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("inv_1");
      expect(stripeMethods.invoices.list).toHaveBeenCalledTimes(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        "billing:cus_123:invoices",
        expect.any(String),
        "EX",
        300,
      );
    });

    it("returns cached result on second call without hitting Stripe", async () => {
      await billing.getInvoices("cus_123");
      vi.clearAllMocks();

      const result = await billing.getInvoices("cus_123");

      expect(result).toHaveLength(1);
      expect(stripeMethods.invoices.list).not.toHaveBeenCalled();
    });
  });

  describe("cache keys contain no PII", () => {
    it("only uses Stripe customer ID in cache keys", async () => {
      await billing.getUsage("cus_123");
      await billing.getInvoices("cus_123");

      const keys = [...redisStore.keys()];
      for (const key of keys) {
        expect(key).toMatch(/^billing:cus_\w+:(usage|invoices)$/);
      }
    });
  });
});
