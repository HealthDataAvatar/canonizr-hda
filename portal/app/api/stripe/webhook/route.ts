import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import {
  getCurrentPermissions,
  appendPermissions,
  getUserIdByStripeCustomerId,
  type BillingStatus,
} from "@/lib/data/tables";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

function getStripe() {
  const Stripe = require("stripe") as typeof import("stripe").default;
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

async function invalidateBillingCache(userId: string) {
  const redis = getRedis();
  if (redis) {
    await redis.del(`user:${userId}:billing_status`);
  }
}

async function updateBillingStatus(
  userId: string,
  billingStatus: BillingStatus,
  extra?: { hasPaymentMethod?: boolean },
) {
  const current = await getCurrentPermissions(userId);
  await appendPermissions(userId, {
    ...current,
    billingStatus,
    hasPaymentMethod: extra?.hasPaymentMethod ?? current.hasPaymentMethod,
    changedBy: "stripe-webhook",
  });
  await invalidateBillingCache(userId);
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    logger.error({ err }, "Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let customerId: string | null = null;
  switch (event.type) {
    case "invoice.payment_failed":
    case "invoice.paid":
      customerId = typeof event.data.object.customer === "string"
        ? event.data.object.customer
        : null;
      break;
    case "customer.subscription.deleted":
      customerId = typeof event.data.object.customer === "string"
        ? event.data.object.customer
        : null;
      break;
    case "payment_method.attached":
      customerId = typeof event.data.object.customer === "string"
        ? event.data.object.customer
        : null;
      break;
  }

  if (!customerId) {
    // Event type we don't need to handle or missing customer
    return NextResponse.json({ received: true });
  }

  const userId = await getUserIdByStripeCustomerId(customerId);
  if (!userId) {
    logger.warn({ customerId }, "Webhook: no user found for Stripe customer");
    return NextResponse.json({ received: true });
  }

  switch (event.type) {
    case "invoice.payment_failed":
      await updateBillingStatus(userId, "past_due");
      break;

    case "invoice.paid":
      await updateBillingStatus(userId, "active");
      break;

    case "customer.subscription.deleted":
      await updateBillingStatus(userId, "canceled");
      break;

    case "payment_method.attached":
      await updateBillingStatus(userId, "", { hasPaymentMethod: true });
      break;
  }

  return NextResponse.json({ received: true });
}
