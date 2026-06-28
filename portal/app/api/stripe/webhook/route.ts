/**
 * Stripe webhook — toggles the `delinquent` permission flag from subscription
 * state. Minimal by design: it does NOT mirror full billing state (the old
 * deleted webhook did; we don't need it).
 *
 * Trigger (per the live dunning config — "all retries fail → mark subscription
 * unpaid"): on customer.subscription.updated we re-fetch LIVE status and
 *   unpaid  -> set delinquent (gateway 403s the user)
 *   active  -> clear delinquent
 * Every other status (incl. canceled = voluntary downgrade) is ignored.
 *
 * Re-fetching live status — not trusting the event payload — makes out-of-order
 * / replayed events safe: the flag always reflects Stripe's current truth.
 *
 * Operational signals go to PostHog (emit), not logger: a lookup-miss means a
 * non-payer silently keeps spending, which must be alertable.
 */

import { NextResponse } from "next/server";
import { getUserIdByStripeCustomerId, setUserDelinquent } from "@/lib/data/tables";
import { getStripe } from "@/lib/services/stripe-client";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";

// No route() wrapper: the webhook is unauthenticated (Stripe calls it), needs
// the raw body, and owns its own error responses — the auth envelope would only
// drag in next-auth. ponytail: bare handler is the right size here.

export async function POST(request: Request): Promise<Response> {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await request.text(); // raw body required for signature verification
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    emit("webhook_signature_invalid");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // We only act on subscription updates. Ack everything else so Stripe stops retrying.
  if (event.type !== "customer.subscription.updated") {
    return NextResponse.json({ received: true });
  }

  const sub = event.data.object as import("stripe").default.Subscription;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const lookup = await getUserIdByStripeCustomerId(customerId);
  if (!lookup.ok) {
    // 0 = customer we never wrote; >1 = duplicate signup. Don't guess — surface it.
    emit(`webhook_customer_${lookup.reason}`, { customerId, count: lookup.count });
    return NextResponse.json({ received: true }); // ack: retrying won't fix a lookup miss
  }

  // Re-fetch live status rather than trust the (possibly stale) event payload.
  const live = await stripe.subscriptions.retrieve(sub.id);
  let delinquent: boolean | null = null;
  if (live.status === "unpaid") delinquent = true;
  else if (live.status === "active") delinquent = false;

  if (delinquent === null) {
    return NextResponse.json({ received: true }); // status we don't act on (canceled, past_due, ...)
  }

  await setUserDelinquent(lookup.userId, delinquent, "stripe-webhook");
  emit("webhook_delinquency_changed", { userId: lookup.userId, delinquent, status: live.status });
  return NextResponse.json({ received: true });
}
