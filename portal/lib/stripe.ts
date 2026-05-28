import { DEV_MODE } from "./dev";

// ---------------------------------------------------------------------------
// Dev mode fixtures
// ---------------------------------------------------------------------------

const devUsage = {
  totalUnits: 42,
  periodStart: "2026-05-01T00:00:00Z",
  periodEnd: "2026-06-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Real implementation
// ---------------------------------------------------------------------------

function getStripe() {
  const Stripe = require("stripe") as typeof import("stripe").default;
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

const PRICE_LOOKUP_KEY = "canonizr_per_100kb";
const METER_EVENT_NAME = "conversion_bytes";

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function lookupCustomerByEmail(
  email: string
): Promise<import("stripe").Stripe.Customer | null> {
  if (DEV_MODE) return null;

  const stripe = getStripe();
  const result = await stripe.customers.list({ email, limit: 1 });
  return result.data[0] ?? null;
}

export async function createCustomerWithSubscription(
  email: string,
  name?: string
): Promise<{ customerId: string; subscriptionId: string; isReturning: boolean }> {
  if (DEV_MODE) {
    return { customerId: "cus_dev_001", subscriptionId: "sub_dev_001", isReturning: false };
  }

  const stripe = getStripe();
  const existing = await lookupCustomerByEmail(email);
  if (existing) {
    const subs = await stripe.subscriptions.list({ customer: existing.id, limit: 1 });
    return { customerId: existing.id, subscriptionId: subs.data[0]?.id ?? "", isReturning: true };
  }

  const customer = await stripe.customers.create({ email, name: name ?? undefined });
  const prices = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`Stripe price '${PRICE_LOOKUP_KEY}' not found`);

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
  });

  return { customerId: customer.id, subscriptionId: subscription.id, isReturning: false };
}

export async function getUsage(customerId: string): Promise<{
  totalUnits: number;
  periodStart: string;
  periodEnd: string;
}> {
  if (DEV_MODE) return { ...devUsage };

  const stripe = getStripe();
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
  const sub = subs.data[0];
  if (!sub) return { totalUnits: 0, periodStart: "", periodEnd: "" };

  const item = sub.items.data[0];
  const periodStart = item?.current_period_start ?? Math.floor(Date.now() / 1000) - 30 * 86400;
  const periodEnd = item?.current_period_end ?? Math.floor(Date.now() / 1000);

  const meters = await stripe.billing.meters.list();
  const meter = meters.data.find((m) => m.event_name === METER_EVENT_NAME);
  if (!meter) throw new Error(`Stripe meter '${METER_EVENT_NAME}' not found`);

  const meterEvents = await stripe.billing.meters.listEventSummaries(meter.id, {
    customer: customerId,
    start_time: periodStart,
    end_time: periodEnd,
  });

  const totalUnits = meterEvents.data.reduce((sum, e) => sum + e.aggregated_value, 0);
  return {
    totalUnits,
    periodStart: new Date(periodStart * 1000).toISOString(),
    periodEnd: new Date(periodEnd * 1000).toISOString(),
  };
}
