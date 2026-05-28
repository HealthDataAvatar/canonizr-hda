import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeClient;
}

const PRICE_LOOKUP_KEY = "canonizr_per_100kb";
const METER_EVENT_NAME = "conversion_bytes";

/** Look up an existing Stripe customer by email. Returns null if not found. */
export async function lookupCustomerByEmail(
  email: string
): Promise<Stripe.Customer | null> {
  const stripe = getStripe();
  const result = await stripe.customers.list({ email, limit: 1 });
  return result.data[0] ?? null;
}

/**
 * Create a Stripe customer with a usage-based subscription.
 * If a customer with this email already exists, returns them without a free tier.
 */
export async function createCustomerWithSubscription(
  email: string,
  name?: string
): Promise<{ customerId: string; subscriptionId: string; isReturning: boolean }> {
  const stripe = getStripe();

  const existing = await lookupCustomerByEmail(email);
  if (existing) {
    // Returning user — reactivate, find existing subscription
    const subs = await stripe.subscriptions.list({
      customer: existing.id,
      limit: 1,
    });
    return {
      customerId: existing.id,
      subscriptionId: subs.data[0]?.id ?? "",
      isReturning: true,
    };
  }

  const customer = await stripe.customers.create({ email, name: name ?? undefined });

  // Look up the price by lookup key
  const prices = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`Stripe price '${PRICE_LOOKUP_KEY}' not found`);

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
  });

  return {
    customerId: customer.id,
    subscriptionId: subscription.id,
    isReturning: false,
  };
}

/** Get current billing period usage from Stripe meter. */
export async function getUsage(customerId: string): Promise<{
  totalUnits: number;
  periodStart: string;
  periodEnd: string;
}> {
  const stripe = getStripe();

  // Get the customer's active subscription
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });
  const sub = subs.data[0];
  if (!sub) {
    return { totalUnits: 0, periodStart: "", periodEnd: "" };
  }

  // Period bounds are on the subscription item in newer Stripe API versions
  const item = sub.items.data[0];
  const periodStart = item?.current_period_start ?? Math.floor(Date.now() / 1000) - 30 * 86400;
  const periodEnd = item?.current_period_end ?? Math.floor(Date.now() / 1000);

  const meterEvents = await stripe.billing.meters.listEventSummaries(
    (await findMeter()).id,
    {
      customer: customerId,
      start_time: periodStart,
      end_time: periodEnd,
    }
  );

  const totalUnits = meterEvents.data.reduce(
    (sum, e) => sum + e.aggregated_value,
    0
  );

  return {
    totalUnits,
    periodStart: new Date(periodStart * 1000).toISOString(),
    periodEnd: new Date(periodEnd * 1000).toISOString(),
  };
}

async function findMeter(): Promise<Stripe.Billing.Meter> {
  const stripe = getStripe();
  const meters = await stripe.billing.meters.list();
  const meter = meters.data.find((m) => m.event_name === METER_EVENT_NAME);
  if (!meter) throw new Error(`Stripe meter '${METER_EVENT_NAME}' not found`);
  return meter;
}
