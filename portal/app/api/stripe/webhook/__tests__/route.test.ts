import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: mock fns must exist before the hoisted vi.mock factories run.
const { constructEvent, retrieve, getUserIdByStripeCustomerId, setUserDelinquent, emit } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  getUserIdByStripeCustomerId: vi.fn(),
  setUserDelinquent: vi.fn().mockResolvedValue(undefined),
  emit: vi.fn(),
}));

// Mock the getStripe seam directly — no require("stripe") interop to fight.
vi.mock("@/lib/services/stripe-client", () => ({
  getStripe: () => ({ webhooks: { constructEvent }, subscriptions: { retrieve } }),
}));
vi.mock("@/lib/data/tables", () => ({ getUserIdByStripeCustomerId, setUserDelinquent }));
vi.mock("@/lib/telemetry", () => ({ emit }));

import { POST } from "../route";

const SECRET = "whsec_test";

function req(): Request {
  return new Request("http://x/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig" },
    body: "{}",
  });
}

function subEvent(subId = "sub_1", customer = "cus_1") {
  constructEvent.mockReturnValue({
    type: "customer.subscription.updated",
    data: { object: { id: subId, customer } },
  });
}

describe("stripe webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test";
    getUserIdByStripeCustomerId.mockResolvedValue({ ok: true, userId: "user-1" });
  });

  it("sets delinquent when live status is unpaid", async () => {
    subEvent();
    retrieve.mockResolvedValue({ id: "sub_1", status: "unpaid" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(setUserDelinquent).toHaveBeenCalledWith("user-1", true, "stripe-webhook");
  });

  it("clears delinquent when live status is active", async () => {
    subEvent();
    retrieve.mockResolvedValue({ id: "sub_1", status: "active" });
    await POST(req());
    expect(setUserDelinquent).toHaveBeenCalledWith("user-1", false, "stripe-webhook");
  });

  it("trusts live status, not the event payload (out-of-order safe)", async () => {
    // Event might say unpaid, but live status is active -> clear, not set.
    subEvent();
    retrieve.mockResolvedValue({ id: "sub_1", status: "active" });
    await POST(req());
    expect(setUserDelinquent).toHaveBeenCalledWith("user-1", false, "stripe-webhook");
  });

  it("ignores canceled (voluntary downgrade) — no flag change", async () => {
    subEvent();
    retrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(setUserDelinquent).not.toHaveBeenCalled();
  });

  it("acks + emits telemetry on lookup miss, never blocks", async () => {
    subEvent();
    getUserIdByStripeCustomerId.mockResolvedValue({ ok: false, reason: "not_found", count: 0 });
    const res = await POST(req());
    expect(res.status).toBe(200); // ack so Stripe stops retrying
    expect(setUserDelinquent).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("webhook_customer_not_found", { customerId: "cus_1", count: 0 });
  });

  it("ignores non-subscription events", async () => {
    constructEvent.mockReturnValue({ type: "invoice.paid", data: { object: {} } });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(setUserDelinquent).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("rejects + emits on bad signature", async () => {
    constructEvent.mockImplementation(() => { throw new Error("bad sig"); });
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(emit).toHaveBeenCalledWith("webhook_signature_invalid");
    expect(setUserDelinquent).not.toHaveBeenCalled();
  });
});
