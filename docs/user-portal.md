# User Portal Spec — canonizr.com

## Stack

- **Next.js** (App Router) — frontend + server-side API routes in one project
- **Auth.js** — self-hosted auth library (not a service). OAuth + magic link. All PII stays in our infra.
- **Tailwind CSS** + shadcn/ui — utility-first styling with pre-built components
- **Azure Container Apps** — same infra as gateway/worker, managed identity for Key Vault access
- **TypeScript** throughout

## Pages

### 1. Landing / Marketing (`/`)

Pricing table, code example, "Get started free" CTA. No auth required.

### 2. Sign up / Sign in (`/auth`)

Auth.js — GitHub OAuth, Google OAuth, magic link email. On first sign-up:
- Create user record in Azure Table Storage (Auth.js adapter, ~100 lines)
- Generate per-user AES-256 encryption key, store in Table Storage
- Look up Stripe customer by email:
  - Exists (returning user) → reactivate, no free tier
  - Doesn't exist → create Stripe Customer with usage-based subscription (500 free units/month)
- Create first APIM subscription under `paid` product
- Redirect to dashboard with API key visible

### 3. Dashboard (`/dashboard`)

Default view after login. Shows:
- **Current period usage** — bar or sparkline, bytes processed, billable units, estimated cost
- **Free tier remaining** — "42 of 500 units used this month"
- **Recent requests** — last 20, showing timestamp, filename, detected type, input bytes, processing time, status
- **Quick test** — drag-and-drop file upload, shows converted result inline

Data sources: Stripe (usage records for billing), App Insights (request history via KQL).

### 4. API Keys (`/dashboard/keys`)

- List all keys (up to 5 per APIM `paid` product limit)
- Each key shows: name, created date, last used, usage this period
- **Create key** — name it (e.g. "production", "agent-1"), get the key once (shown then hidden)
- **Rotate key** — generates new primary, old key stays active for 24h
- **Delete key** — immediate, with confirmation
- **Per-key quota** — optional monthly byte limit. Shows usage vs. quota. Gateway enforces via Redis.

### 5. Billing (`/dashboard/billing`)

- Current month: usage, cost, free units remaining
- Invoice history (from Stripe)
- Payment method (Stripe Customer Portal link)
- "Manage billing" button opens Stripe's hosted portal (invoices, payment method, cancel)

### 6. Playground (`/playground`)

Full-page test interface (requires sign-in — uses the user's own API key):
- Upload a file (or paste a URL)
- See the raw API response: markdown output, metadata, billing headers
- Show request as curl command (copyable) for easy integration
- Uses the free tier — no payment needed to try it

### 7. Docs (`/docs`)

Static content or link to external docs site. Covers:
- Authentication (pass `Ocp-Apim-Subscription-Key` header)
- `POST /convert` — request/response format, query params
- Response headers — what each `X-*` header means
- Rate limits and quotas
- Error codes
- Code examples (Python, JavaScript, curl)

## API Routes (Next.js backend)

| Route | Method | Action |
|---|---|---|
| `/api/keys` | GET | List user's APIM subscriptions |
| `/api/keys` | POST | Create new APIM subscription, return key |
| `/api/keys/[id]` | DELETE | Delete APIM subscription |
| `/api/keys/[id]/rotate` | POST | Regenerate APIM subscription key |
| `/api/keys/[id]/quota` | PUT | Set per-key quota (writes to Table Storage + Redis) |
| `/api/usage` | GET | Current period usage (from Stripe usage records) |
| `/api/usage/history` | GET | Request history (from App Insights KQL) |
| `/api/billing/portal` | POST | Create Stripe Customer Portal session, return URL |

## Account deletion

On account deletion (in this order):
1. **Revoke API keys** — delete all APIM subscriptions immediately (no new requests)
2. **Final usage sync** — run the usage reporting logic for this user's subscriptions, pushing any unsynced meter events to Stripe
3. **Delete user record** from Azure Table Storage (removes PII)
4. **Delete per-user encryption key** (crypto-shreds any cached results)
5. **Do not delete Stripe customer** — needed for invoice history, legal compliance, and free tier abuse prevention

On re-signup with same email, Stripe customer lookup finds the existing record → no free tier granted

## Security

### Portal container
- Hosted on Azure Container Apps with HTTPS ingress
- Own user-assigned managed identity — access to Key Vault (Stripe keys, APIM credentials), Table Storage only
- No access to job queue, blob storage, or Redis quota counters (write path)
- Read-only access to App Insights (KQL queries for usage history)
- CORS locked to `canonizr.com`

### API route protection
- Auth.js session cookie validated server-side by Next.js middleware
- All `/api/*` and `/dashboard/*` routes require valid session
- APIM Management API calls use a service principal stored in Key Vault
- Stripe API calls use server-side secret key from Key Vault

### Auth.js adapter (Azure Table Storage)
- Implements: `createUser`, `getUser`, `getUserByEmail`, `getUserByAccount`, `updateUser`, `deleteUser`, `createSession`, `getSessionAndUser`, `updateSession`, `deleteSession`
- ~100-150 lines of TypeScript
- All user data in Azure Table Storage, UK South region
- Session tokens stored as encrypted cookies (no server-side session store needed for most flows)

## Data stores

| Store | Data | Accessed by |
|---|---|---|
| Azure Table Storage | User records, Stripe customer IDs, APIM subscription mappings, per-user encryption keys, per-key quotas | Portal API routes |
| Stripe | Customers (permanent), subscriptions, usage records, invoices, payment methods | Portal (read), Usage function (write) |
| App Insights | Request logs with billing headers | Portal (read-only KQL) |
| Redis | Per-key quota counters, real-time usage | Gateway (enforce), Portal (display, read-only) |
| APIM Management API | Subscription CRUD, key regeneration | Portal API routes |

## Admin overrides

Per-user fields in Table Storage, settable by admins (no UI in v1 — use Azure Portal or CLI script):

| Field | Default | Effect |
|---|---|---|
| `max_keys` | 100 | Max APIM subscriptions for this user |
| `free_units` | 500 | Included free units/month. `null` = unlimited free. `0` = no free tier. |
| `price_per_unit` | 0.003 | USD per 100KB. `0` = permanently free. Custom values for partners. |
| `notes` | "" | Admin notes (e.g. "partner rate", "internal") |

The usage reporting function reads `price_per_unit` per user when pushing meter events to Stripe. Different rates are implemented as separate Stripe prices assigned to each customer's subscription.

Examples:
- Default user: 500 free units, $0.003/unit, 100 keys
- Internal (HDA): unlimited free (`free_units: null`, `price_per_unit: 0`)
- Partner: 2000 free units, $0.001/unit, 200 keys

Admin panel is a Phase 4 concern.

## Non-goals (v1)

- Team/org accounts — single user per account
- Custom domains for API access
- Webhook management UI
- Admin dashboard (use Azure Portal / CLI scripts directly)
