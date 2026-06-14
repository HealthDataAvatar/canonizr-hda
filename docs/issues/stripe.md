# Stripe Billing Integration

## Model

Stripe owns the billing lifecycle entirely. Free tier, invoicing, payment collection, and dunning are all Stripe's concern. The gateway only enforces user-configured per-key quotas.

```
Sign up
  Create Stripe customer + subscription (mandatory, blocks signup on failure)
  Store stripe_customer_id + billing_anchor_day in GwBilling
  Start on free tier (500 units / 50MB per month), no card required

Normal usage
  Gateway enforces per-key quota only (period-scoped Redis counter)
  Usage reporter (hourly) pushes meter events to Stripe
  Billing page reads Stripe meter summaries, shows usage

Month end
  Stripe generates invoice
  Within free tier -> $0 invoice, nothing happens
  Over free tier -> Stripe invoices overage at $0.003/100KB
  User receives email, pays via Stripe-hosted page
  If payment fails, Stripe handles dunning automatically
```

The gateway has no concept of billing status, free tier exhaustion, or payment methods. If a user doesn't pay, that's between them and Stripe.

## Current State

### What works

- **Customer creation** (`portal/lib/auth/on-create-user.ts`) -- Stripe customer + subscription created at sign-up. Handles returning customers (email lookup).
- **Usage metering** (`gateway/app/usage_report.py`) -- Hourly cron queries GwJobs table for successful conversions, pushes meter events to Stripe. Idempotent (deterministic event identifiers), with watermark-based catch-up after outages.
- **Billing page** (`portal/components/pages/billing-page-content.tsx`) -- Shows usage stats (processed KB, free remaining, estimated cost), invoice history, and "Manage billing" button for Stripe Billing Portal.
- **Redis caching** (`portal/lib/services/billing-stripe.ts`) -- Usage and invoice data cached 5 min.
- **Per-key quota** (`gateway/app/quota.py`) -- Redis-backed byte quota per API key. User-configured.
- **Stripe infrastructure** (`infra/stripe/setup.py`) -- Idempotent meter/product/price creation. $0.003 per 100KB, 500 free units/month.

### What's broken

**Usage reporter cannot map subscriptions to Stripe customers.** The reporter calls `load_subscription_map()` which reads `stripe_customer_id` from `GwSubscriptions`. But `TableKeyStore.create()` never writes `stripe_customer_id` to that table -- it only writes `user_id` and `key_name`. The mapping is always empty. Every record is logged as "unmapped subscription" and skipped. Zero meter events reach Stripe. The billing page shows 0 usage.

**Per-key quotas are lifetime counters, not monthly.** The Redis key `sub:{sub_id}:bytes` has a 31-day TTL from first write, not aligned to billing periods. Users expect "10GB per month", not "10GB total".

**Stripe customer creation is non-fatal.** If it fails, `stripeCustomerId` is stored as `""` and the user still gets an API key. These users can never be billed.

### Dead code to remove

The following were built around a billing-status-gating model we're no longer using:

- **Webhook endpoint** (`portal/app/api/stripe/webhook/route.ts`) -- Syncs billing status to UserPermissions. No longer needed since the gateway doesn't check billing status.
- **Billing-level access control** (`gateway/app/user_resolver.py` `_check_billing_status()`) -- Gateway 402 blocks for `past_due`, `canceled`, `free_exhausted`. Remove.
- **Free tier exhaustion detection** (`portal/lib/data/user-page-data.ts`) -- Auto-sets/clears `free_exhausted` status, syncs `hasPaymentMethod` from Stripe. Remove.
- **`billingStatus` and `hasPaymentMethod` fields** in UserPermissions -- No longer used for access control.
- **`billing_status()` Redis key** (`gateway/app/keys.py`) -- Gateway billing status cache. Remove.
- **Retry failed Stripe setup** (`portal/lib/auth/ensure-user-setup.ts`) -- Replaced by mandatory Stripe at signup.

## Fix: GwBilling Lookup Table

Introduce a single user-level lookup table that holds the Stripe mapping and billing period anchor.

### Schema

- **Table**: `GwBilling`
- **PartitionKey**: `"billing"`
- **RowKey**: `user_id`
- **Fields**: `stripe_customer_id`, `billing_anchor_day` (1-31)
- **Written by**: portal at signup (when Stripe customer is created)
- **Read by**: gateway (quota period calculation), usage reporter (customer mapping)
- **Immutable** after creation. Aggressively cacheable.

### Changes required

**Portal -- mandatory Stripe at signup:**
- `on-create-user.ts`: Make `createCustomer` failure fatal (no key issued without Stripe)
- Write `stripe_customer_id` + `billing_anchor_day` to `GwBilling` at signup

**Gateway -- period-scoped quotas:**
- `user_resolver.py`: Read `billing_anchor_day` from `GwBilling` (cached alongside user resolution)
- `quota.py`: Compute current period start from anchor day. Use period-scoped Redis key: `sub:{sub_id}:bytes:{period_start}` (e.g. `sub:key-123:bytes:2026-06-15`)
- Old keys expire naturally via TTL set to remaining period duration. No reset logic needed.

**Usage reporter -- resolve via user_id:**
- `usage_report.py`: Replace `load_subscription_map()`. Resolve `sub_id -> user_id` (from `GwSubscriptions`) then `user_id -> stripe_customer_id` (from `GwBilling`).
- Remove `stripe_customer_id` field from `GwSubscriptions` (never populated, not needed).

**Backfill:**
- One-time script to populate `GwBilling` for existing users from `UserPermissions.stripeCustomerId` + Stripe subscription `billing_cycle_anchor`.

### Billing period alignment

All keys for a user share the same billing anchor (the day of month the Stripe subscription was created). This aligns per-key quota resets with Stripe's billing period, so the billing page and key quotas always agree.

Stripe's metered billing resets per billing period automatically. The 500 free units/month are handled entirely by Stripe's pricing tier -- the gateway doesn't track free tier usage.

## Stripe Metering: How It Works

- Usage reporter pushes meter events with timestamps throughout the month
- Stripe aggregates them per subscription billing period
- At period end: invoice = `(total_units - 500 free) * $0.003`
- Next period starts at zero automatically
- Meter events are permanent records; aggregation is per-period
- Portal reads `listEventSummaries(meter_id, { start_time, end_time })` for current period usage

## Remaining Work

### P0: Fix metering pipeline (GwBilling table + period-scoped quotas)

See "Fix: GwBilling Lookup Table" above. Without this, no usage reaches Stripe and billing is completely broken.

### P1: Remove dead billing-status code

See "Dead code to remove" above. Strip out webhook handler, billing status checks, free tier exhaustion logic, `hasPaymentMethod` syncing.

### P1: Simplify billing page

Remove billing status banners (past_due, canceled, free_exhausted warnings). The page just shows usage from Stripe and a "Manage billing" link. Stripe handles everything else.

### P2: Approaching-limit notifications

Portal could show usage percentage on the billing page. Consider `X-Free-Remaining` API response header. Email notifications would need tracking to avoid spam.
