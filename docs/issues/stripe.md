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

## Work Packages

### WP1: Webhook Endpoint (P0)

Add a Stripe webhook handler to receive billing events and sync state back.

- New route: `portal/app/api/stripe/webhook/route.ts`
- Verify signatures using `stripe.webhooks.constructEvent`
- Handle events:
  - `invoice.payment_failed` - set `billingStatus: "past_due"` on UserPermissions
  - `invoice.paid` - clear `billingStatus` back to `"active"`
  - `customer.subscription.updated` - sync status (active / past_due / canceled)
  - `customer.subscription.deleted` - set `billingStatus: "canceled"`
  - `checkout.session.completed` - mark payment method on file, clear blocks
- Write to UserPermissions (append-only, fits existing pattern)
- Add `STRIPE_WEBHOOK_SECRET` env var to portal deployment
- Register webhook in Stripe dashboard / Terraform

### WP2: Payment Method Collection (P0)

Give users a way to add a payment method before they hit the wall.

- New route: `portal/app/api/billing/setup/route.ts` - creates a Stripe Checkout Session in `setup` mode (collects card, no charge)
- New component: payment setup CTA on billing page when no payment method is on file
- Track `hasPaymentMethod` in UserPermissions (updated by WP1 webhook)
- Consider: should the Billing Portal link be enough, or do we need an embedded flow?

### WP3: Billing-Level Access Control (P0)

Connect billing status to API gateway so exhausted/failed users are blocked.

- Add `billingStatus` field to UserPermissions (values: `active`, `past_due`, `canceled`, `free_exhausted`)
- Portal writes billing status changes (from webhooks in WP1)
- Gateway reads billing status from Redis (cache) or Table Storage (fallback), similar to existing blocked-user pattern
- Return 402 with descriptive message when blocked for billing reasons
- Distinct from per-key quota (which remains user-configured)

### WP4: Free Tier Exhaustion (P1)

Handle the transition from free to paid gracefully.

- Portal: calculate proximity to free limit in `getBillingData()`
- Banner component at 80% / 100% thresholds
- At 100% with no payment method: set `billingStatus: "free_exhausted"` (blocks API via WP3)
- At 100% with payment method: no block, charges begin (usage reporter already handles this)
- Where to enforce: portal can set the flag on billing page load, or usage reporter can check and set it hourly

### WP5: Retry Failed Stripe Setup (P1)

Recover from transient Stripe failures at sign-up.

- `ensureUserSetup` already runs on each login - extend it to retry Stripe customer creation when `stripeCustomerId` is `""`
- Add the same returning-customer check (email lookup) to avoid duplicates
- Log/alert when retries also fail (admin visibility)
- Consider: admin action to manually trigger setup for a user

### WP6: Subscription Status Display (P2)

Show users their actual billing state, not just usage numbers.

- Fetch subscription status in `getBillingData()` (already querying subscriptions)
- Display on billing page: active / past_due / canceled / no payment method
- Past due: show warning with link to update card (Billing Portal)
- Canceled: show "resubscribe" flow
- No Stripe account: show "set up billing" CTA

### WP7: Approaching-Limit Notifications (P2)

Proactive communication before users hit limits.

- Email at 80% free tier usage (requires tracking, avoid spamming)
- Portal banner (simpler - calculate on page load, no persistence needed)
- Consider: in-API response header (`X-Free-Remaining`) so integrators can react programmatically

## Dependencies

```
WP1 (webhooks) --> WP3 (access control) --> WP4 (free tier exhaustion)
WP1 (webhooks) --> WP2 (payment collection)
WP5 (retry) is independent
WP6 (status display) depends loosely on WP1
WP7 (notifications) depends on WP4
```

WP1 is the foundation - most other packages depend on having webhook-driven state sync.
