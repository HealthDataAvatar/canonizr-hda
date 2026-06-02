# Stripe Billing Integration

## Current State

We have a working metering pipeline but no feedback loop from Stripe back to our system. Users can consume the service indefinitely without paying.

### What works

- **Customer creation** (`portal/lib/auth/on-create-user.ts`) — Stripe customer + subscription created at sign-up. Handles returning customers (email lookup). Non-fatal if Stripe is down.
- **Usage metering** (`gateway/app/usage_report.py`) — Hourly cron queries App Insights for successful conversions, pushes meter events to Stripe. Idempotent (deterministic event identifiers), with watermark-based catch-up after outages.
- **Billing page** (`portal/components/pages/billing-page-content.tsx`) — Shows usage stats (processed KB, free remaining, estimated cost), invoice history, and "Manage billing" button that opens the Stripe Billing Portal.
- **Redis caching** (`portal/lib/services/billing-stripe.ts`) — Usage and invoice data cached 5 min to avoid hammering Stripe on every page load.
- **Per-key quota** (`gateway/app/quota.py`) — Redis-backed byte quota per API key. User-configured, independent of billing.
- **Stripe infrastructure** (`infra/stripe/setup.py`) — Idempotent meter/product/price creation. $0.003 per 100KB, 500 free units/month.

### What's missing

1. **No webhooks** — Stripe has no way to notify us of payment failures, subscription cancellations, or card expiry. A user whose invoice fails continues using the service.
2. **No payment method collection** — We create subscriptions with no card on file. Free tier works, but there's no flow for users to start paying. The Billing Portal lets them add a card reactively, but we never prompt them.
3. **No billing-level access control** — The gateway enforces per-key quotas (user-set) but has no concept of billing status. Free tier exhaustion, payment failure, and subscription cancellation don't affect API access.
4. **No free tier exhaustion UX** — `freeRemainingKB` is calculated and displayed, but nothing happens when it hits zero. No portal warning, no API rejection.
5. **Silent Stripe failures** — If customer creation fails at sign-up, `stripeCustomerId` is stored as `""` with no retry. These users can never be billed. The usage reporter silently skips unmapped subscriptions (revenue leakage).
6. **No subscription status awareness** — `_fetchUsage()` filters for `status: "active"` and returns zeros if none found, but the UI doesn't distinguish "no usage" from "billing broken".

## Best Practice Target

```
Sign up
  Create Stripe customer (already done)
  Start on free tier (500 units / 50MB), no card required (already done)
  Show usage meter on billing page (already done)

Approaching free limit (80%)
  Portal banner: "You've used 80% of your free tier"
  CTA to add payment method via Stripe Checkout / Setup Intent

Free limit reached, no payment method
  API returns 402 with clear message
  Portal: "Free tier exhausted" state with payment setup CTA
  Gateway blocks at request level

Payment method added (webhook: checkout.session.completed)
  Update user record, clear any block
  Usage continues, billed per-unit

Invoice payment fails (webhook: invoice.payment_failed)
  Stripe sends dunning emails (automatic)
  Portal banner: "Payment failed - update your card"
  Grace period (configurable, e.g. 7 days), then soft-block API

Subscription canceled (webhook: customer.subscription.deleted)
  Revert to free-tier-only access
  Block API if already over free limit
```

## Implemented (WP1 + WP3 + WP4)

### WP1: Webhook Endpoint - DONE

Stripe webhook handler receives billing events and syncs state to UserPermissions.

- `portal/app/api/stripe/webhook/route.ts` - signature-verified handler
- Events handled: `invoice.payment_failed` (-> past_due), `invoice.paid` (-> active), `customer.subscription.deleted` (-> canceled), `payment_method.attached` (-> hasPaymentMethod)
- `portal/lib/data/tables/user-permissions-lookup.ts` - reverse lookup stripeCustomerId -> userId (Redis-cached, 1h TTL)
- Invalidates gateway's Redis billing status cache on every update (instant propagation)
- `STRIPE_WEBHOOK_SECRET` env var added to `infra/terraform/portal.tf`

### WP3: Billing-Level Access Control - DONE

Gateway blocks requests for users with bad billing status, returning 402.

- `portal/lib/data/tables/user-permissions.ts` - added `billingStatus` and `hasPaymentMethod` fields
- `gateway/app/user_resolver.py` - `_check_billing_status()` reads from Redis cache (5 min TTL) or Table Storage fallback
- `gateway/app/handlers.py` - `_reject_resolved()` routes `BILLING:`-prefixed errors to 402, others to 403
- `gateway/app/keys.py` - `billing_status()` Redis key
- Error messages: "Payment failed", "Subscription canceled", "Free tier exhausted"

### WP4: Free Tier Exhaustion - DONE

Portal detects free tier exhaustion on billing page load and sets/clears status automatically.

- `portal/lib/data/user-page-data.ts` - `getBillingData()` syncs `hasPaymentMethod` from Stripe, auto-sets `free_exhausted` when free tier is at 0 with no payment method, auto-clears when payment method added or usage drops
- `portal/lib/pure/billing-calc.ts` - added `freeUsagePercent` (0-100, capped)
- `portal/components/pages/billing-page-content.tsx` - billing banners:
  - Amber warning at 80% free tier usage (no payment method)
  - Red error for free_exhausted, past_due, canceled
  - "Manage billing" button on actionable states
- `portal/lib/services/billing-stripe.ts` - `hasPaymentMethod()` checks Stripe customer for default payment method (Redis-cached 5 min)
- `portal/lib/services/billing-table.ts` - stub returns false for local dev

### Payment method detection

Uses "both" approach: webhooks update eagerly (`payment_method.attached`), billing page load verifies against Stripe and corrects if they disagree.

## Manual Steps Required

1. **Add Key Vault secret**: `stripe-webhook-secret` — get the signing secret from Stripe after registering the webhook
2. **Register webhook in Stripe dashboard**:
   - URL: `https://<portal-domain>/api/stripe/webhook`
   - Events: `invoice.payment_failed`, `invoice.paid`, `customer.subscription.deleted`, `payment_method.attached`
3. **Deploy**: `make deploy` (Terraform will pick up the new env var)
4. **Test locally**: `stripe listen --forward-to localhost:3000/api/stripe/webhook` with Stripe CLI

## Remaining Work Packages

### WP2: Payment Method Collection (P1, deferred)

Currently users add payment methods via the existing "Manage billing" button (Stripe Billing Portal). Could add a more prominent dedicated CTA in future.

### WP5: Retry Failed Stripe Setup (P1, deferred)

Recover from transient Stripe failures at sign-up.

- Extend `ensureUserSetup` to retry when `stripeCustomerId` is `""`
- Add returning-customer check (email lookup) to avoid duplicates
- Consider: admin action to manually trigger setup for a user

### WP6: Subscription Status Display (P2, deferred)

Show users their actual billing state, not just usage numbers. Partially addressed by WP4 banners, but could show more detail (active/past_due/canceled status text on billing page).

### WP7: Approaching-Limit Notifications (P2, deferred)

Email at 80% free tier usage (requires tracking to avoid spamming). Portal banner is already implemented (WP4). Consider `X-Free-Remaining` API response header.
