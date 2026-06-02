/**
 * BillingStore backed by Stripe.
 * Production implementation.
 *
 * Usage and invoice data is cached in Redis (5 min TTL) to avoid
 * hitting Stripe on every page load. Cache keys use only the Stripe
 * customer ID (not PII).
 */

import { getRedis } from "@/lib/redis";
import { BillingStore, Invoice, Usage } from ".";


const PRICE_LOOKUP_KEY = "canonizr_per_100kb";
const METER_EVENT_NAME = "conversion_bytes";
const CACHE_TTL = 300; // 5 minutes

function getStripe() {
  const Stripe = require("stripe") as typeof import("stripe").default;
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

async function cached<T>(key: string, fetch: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (redis) {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  }
  const result = await fetch();
  if (redis) {
    await redis.set(key, JSON.stringify(result), "EX", CACHE_TTL);
  }
  return result;
}

export class StripeBillingStore implements BillingStore {
  async getUsage(customerId: string): Promise<Usage> {
    return cached(`billing:${customerId}:usage`, () => this._fetchUsage(customerId));
  }

  async getInvoices(customerId: string): Promise<Invoice[]> {
    return cached(`billing:${customerId}:invoices`, () => this._fetchInvoices(customerId));
  }

  private async _fetchUsage(customerId: string): Promise<Usage> {
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

  private async _fetchInvoices(customerId: string): Promise<Invoice[]> {
    const stripe = getStripe();
    const invoices = await stripe.invoices.list({ customer: customerId, limit: 12 });
    return invoices.data.map((inv) => {
      const totalUnits = inv.lines?.data?.reduce((sum, line) => sum + (line.quantity ?? 0), 0) ?? 0;
      return {
        id: inv.id,
        date: new Date((inv.created ?? 0) * 1000).toISOString(),
        processedKB: totalUnits * 100,
        amount: (inv.amount_paid ?? 0) / 100,
        status: inv.status ?? "unknown",
        url: inv.hosted_invoice_url ?? null,
      };
    });
  }

  async createCustomer(
    email: string,
  ): Promise<{ customerId: string; subscriptionId: string; isReturning: boolean }> {
    const stripe = getStripe();
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data[0]) {
      const subs = await stripe.subscriptions.list({ customer: existing.data[0].id, limit: 1 });
      return { customerId: existing.data[0].id, subscriptionId: subs.data[0]?.id ?? "", isReturning: true };
    }

    const customer = await stripe.customers.create({ email });
    const prices = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], limit: 1 });
    const price = prices.data[0];
    if (!price) throw new Error(`Stripe price '${PRICE_LOOKUP_KEY}' not found`);

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
    });

    return { customerId: customer.id, subscriptionId: subscription.id, isReturning: false };
  }

  async createBillingPortalSession(customerId: string, returnUrl: string): Promise<string> {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  async hasPaymentMethod(customerId: string): Promise<boolean> {
    return cached(`billing:${customerId}:has_pm`, async () => {
      const stripe = getStripe();
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) return false;
      return !!(customer.invoice_settings?.default_payment_method || customer.default_source);
    });
  }
}
