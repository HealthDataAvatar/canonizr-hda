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
  Billing page reads real-time usage from Redis, invoices from Stripe

Month end
  Stripe generates invoice
  Within free tier -> $0 invoice, nothing happens
  Over free tier -> Stripe invoices overage at $0.003/100KB
  User receives email, pays via Stripe-hosted page
  If payment fails, Stripe handles dunning automatically
```

The gateway has no concept of billing status, free tier exhaustion, or payment methods. If a user doesn't pay, that's between them and Stripe.

## Implementation

### GwBilling lookup table

Single user-level table holding the Stripe mapping and billing period anchor.

- **Table**: `GwBilling`
- **PartitionKey**: `"billing"`
- **RowKey**: `user_id`
- **Fields**: `stripe_customer_id`, `billing_anchor_day` (1-31)
- **Written by**: portal at signup (`on-create-user.ts`)
- **Read by**: gateway (quota period calculation, cached via `user_resolver.py`), usage reporter (customer mapping via `load_subscription_map()`)
- **Immutable** after creation. Aggressively cacheable.

### Signup flow

Stripe customer creation is mandatory. If Stripe is down, signup fails -- no key is issued.

- `portal/lib/auth/on-create-user.ts` -- `createCustomer()` failure is fatal (throws)
- Writes `GwBilling` entry with `stripe_customer_id` + `billing_anchor_day` (UTC day of signup)
- Then appends UserConfig, UserPermissions, creates default API key

### Period-scoped quotas

Per-key quotas are aligned to the user's Stripe billing period via `billing_anchor_day`. All keys for a user share the same anchor.

- **Redis key**: `sub:{sub_id}:bytes:{period_start}` (e.g. `sub:key-123:bytes:2026-06-15`)
- **Period start**: computed by `current_period_start(anchor_day, now)` in `gateway/app/quota.py`. Accepts an explicit UTC date for testability. Clamps anchor day to last day of month (e.g. anchor 31 in Feb -> 28).
- **TTL**: set to remaining days in the current period. Old keys expire naturally.
- **All period calculations use UTC** to match Stripe's billing cycle anchor.

### Cache miss fallback

If the Redis usage key is missing (flush, new period, cold start), usage is reconstructed from Table Storage and seeded back into Redis:

- **Gateway** (`quota.py`): `_reconstruct_usage_from_table()` queries GwJobs for `sub_id` where `status=ok` and `completed_at >= period_start`. Deduplicates by `job_id` (GwJobs is append-only). Runs once per cache miss, subsequent reads are fast.
- **Portal** (`user-page-data.ts`): `reconstructUsageFromTable()` queries GwUserJobs for `user_id` where `status=ok` and `completed_at >= period_start`. Accumulates per-key, seeds Redis per-key.

### Billing page

Shows real-time usage from Redis (not Stripe meter summaries, which lag up to an hour behind the usage reporter cron). Falls back to Table Storage on Redis miss.

- `portal/lib/data/user-page-data.ts` -- `getCurrentUsageUnits()` sums `sub:{sub_id}:bytes:{period_start}` across all keys
- Invoices still read from Stripe (historical data)
- "Manage billing" button opens Stripe Billing Portal (existing `ManageBillingButton` component)

### Usage reporter

Hourly Container App Job that pushes meter events to Stripe.

- `gateway/app/usage_report.py` -- `load_subscription_map()` resolves `sub_id -> user_id` (GwSubscriptions) then `user_id -> stripe_customer_id` (GwBilling)
- Queries GwJobs for completed jobs in the time window, pushes billable units to Stripe
- Idempotent: deterministic event identifiers + watermark tracking + append-only dedup

### User resolver

`gateway/app/user_resolver.py` reads `billing_anchor_day` from GwBilling (cached in Redis, 1h TTL) and populates `UserContext.billing_anchor_day`. The quota service and worker use this for period-scoped operations.

## Stripe Metering: How It Works

- Usage reporter pushes meter events with timestamps throughout the month
- Stripe aggregates them per subscription billing period
- At period end: invoice = `(total_units - 500 free) * $0.003`
- Next period starts at zero automatically
- Meter events are permanent records; aggregation is per-period

## Test Coverage

### Gateway unit tests (264 passing)

- `test_quota.py` -- period-scoped check/record/refund, anchor day cycle (different dates passed via `now` param), period boundary resets, cache miss triggers table reconstruction, sparse history dedup (duplicates, errors, zero-byte, wrong sub, before-period all excluded), cache hit skips reconstruction
- `test_keys.py` -- period-scoped key format, billing anchor cache key
- `test_handlers.py` -- quota enforcement through full accept flow
- `test_usage_report.py` -- subscription mapping, meter event push, watermark

### Portal unit tests (133 passing)

- `on-create-user.test.ts` -- mandatory Stripe, GwBilling write, idempotent key creation, fatal on missing user/email
- `key-usage.test.ts` -- period-scoped Redis keys, billing anchor lookup, zero/multi-key/partial-KB cases
- `billing-calc.test.ts` -- pure billing calculations

### Integration tests

- `gateway/tests/integration/test_quota.py` -- period-scoped Redis keys against real gateway + Redis + Azurite
- `portal/tests/integration/portal.test.ts` -- billing page shows 0 with no usage, shows real-time usage from Redis, reconstructs from Table Storage on Redis cache miss

## Remaining Work

### P2: Approaching-limit notifications

Portal could show usage percentage on the billing page. Consider `X-Free-Remaining` API response header. Email notifications would need tracking to avoid spam.
