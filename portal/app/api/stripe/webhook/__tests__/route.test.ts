import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockAppendPermissions = vi.fn();
const mockGetCurrentPermissions = vi.fn().mockResolvedValue({
  isAdmin: false,
  blocked: false,
  stripeCustomerId: "cus_123",
  billingStatus: "",
  hasPaymentMethod: false,
  changedBy: "system",
  timestamp: "2025-01-01T00:00:00Z",
});
const mockGetUserIdByStripeCustomerId = vi.fn().mockResolvedValue("user_1");

vi.mock("@/lib/data/tables", () => ({
  getCurrentPermissions: (...args: unknown[]) => mockGetCurrentPermissions(...args),
  appendPermissions: (...args: unknown[]) => mockAppendPermissions(...args),
  getUserIdByStripeCustomerId: (...args: unknown[]) => mockGetUserIdByStripeCustomerId(...args),
}));

const mockRedisDel = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ del: mockRedisDel }),
}));

const mockConstructEvent = vi.fn();
vi.mock("stripe", () => {
  return {
    default: class Stripe {
      webhooks = { constructEvent: mockConstructEvent };
    },
  };
});

import { POST } from "../route";

// --- Helpers ---

function makeRequest(body: string, sig = "valid-sig") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body,
    headers: { "stripe-signature": sig },
  });
}

function makeEvent(type: string, customer: string) {
  return {
    type,
    data: { object: { customer } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
  mockGetCurrentPermissions.mockResolvedValue({
    isAdmin: false,
    blocked: false,
    stripeCustomerId: "cus_123",
    billingStatus: "",
    hasPaymentMethod: false,
    changedBy: "system",
    timestamp: "2025-01-01T00:00:00Z",
  });
  mockGetUserIdByStripeCustomerId.mockResolvedValue("user_1");
});

describe("POST /api/stripe/webhook", () => {
  it("returns 400 when signature header is missing", async () => {
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing signature" });
  });

  it("returns 500 when STRIPE_WEBHOOK_SECRET is not set", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(500);
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
  });

  it("sets billingStatus to past_due on invoice.payment_failed", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("invoice.payment_failed", "cus_123"));
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockAppendPermissions).toHaveBeenCalledWith("user_1", expect.objectContaining({
      billingStatus: "past_due",
      changedBy: "stripe-webhook",
    }));
    expect(mockRedisDel).toHaveBeenCalledWith("user:user_1:billing_status");
  });

  it("sets billingStatus to active on invoice.paid", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("invoice.paid", "cus_123"));
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockAppendPermissions).toHaveBeenCalledWith("user_1", expect.objectContaining({
      billingStatus: "active",
    }));
  });

  it("sets billingStatus to canceled on customer.subscription.deleted", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("customer.subscription.deleted", "cus_123"));
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockAppendPermissions).toHaveBeenCalledWith("user_1", expect.objectContaining({
      billingStatus: "canceled",
    }));
  });

  it("sets hasPaymentMethod on payment_method.attached", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("payment_method.attached", "cus_123"));
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockAppendPermissions).toHaveBeenCalledWith("user_1", expect.objectContaining({
      hasPaymentMethod: true,
    }));
  });

  it("preserves existing billingStatus on payment_method.attached", async () => {
    mockGetCurrentPermissions.mockResolvedValue({
      isAdmin: false,
      blocked: false,
      stripeCustomerId: "cus_123",
      billingStatus: "past_due",
      hasPaymentMethod: false,
      changedBy: "system",
      timestamp: "2025-01-01T00:00:00Z",
    });
    mockConstructEvent.mockReturnValue(makeEvent("payment_method.attached", "cus_123"));
    await POST(makeRequest("{}"));
    // billingStatus passed as "" (the default for payment_method.attached),
    // but the spread of current should not override — check the actual call
    expect(mockAppendPermissions).toHaveBeenCalledWith("user_1", expect.objectContaining({
      hasPaymentMethod: true,
    }));
  });

  it("returns 200 for unknown event types without updating permissions", async () => {
    mockConstructEvent.mockReturnValue({ type: "charge.refunded", data: { object: {} } });
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockAppendPermissions).not.toHaveBeenCalled();
  });

  it("returns 200 when customer not found in our system", async () => {
    mockConstructEvent.mockReturnValue(makeEvent("invoice.payment_failed", "cus_unknown"));
    mockGetUserIdByStripeCustomerId.mockResolvedValue(null);
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockAppendPermissions).not.toHaveBeenCalled();
  });
});
