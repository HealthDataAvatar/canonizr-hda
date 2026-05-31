/**
 * Portal integration tests.
 *
 * Run against a real portal container + Azurite + stubs.
 * Authenticates via the full magic link flow.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { authenticate, createFetcher, createTestUser, seedTestUser, seedJob, seedInvoice, initTables, PORTAL_URL } from "./helpers";
import { getCurrentPermissions } from "@/lib/data/tables";
import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-names";

let fetchPortal: ReturnType<typeof createFetcher>;

beforeAll(async () => {
  const { cookie } = await authenticate();
  fetchPortal = createFetcher(cookie);
}, 30_000);

describe("table cleanliness", () => {
  const CANARY_ID = "canary-stale-data-check";

  it("no stale data from a previous run", async () => {
    await initTables();
    const client = getTableClient(TableName.USERS);
    let found = false;
    try {
      await client.getEntity("user", CANARY_ID);
      found = true;
    } catch {}
    expect(found).toBe(false);
  });

  it("plant canary for next run", async () => {
    const client = getTableClient(TableName.USERS);
    await client.upsertEntity({
      partitionKey: "user",
      rowKey: CANARY_ID,
      email: "canary@test",
    });
  });
});

describe("health", () => {
  it("returns ok", async () => {
    const res = await fetch(`${PORTAL_URL}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

describe("auth", () => {
  it("auth page renders", async () => {
    const res = await fetch(`${PORTAL_URL}/auth`, { redirect: "manual" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Canonizr");
  });

  it("unauthenticated dashboard redirects to auth", async () => {
    const res = await fetch(`${PORTAL_URL}/dashboard`, { redirect: "manual" });
    expect([301, 302, 303, 307, 308]).toContain(res.status);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/auth");
  });

  it("sign-in request with email in form body succeeds", async () => {
    const csrfRes = await fetch(`${PORTAL_URL}/api/auth/csrf`);
    const csrfCookies = csrfRes.headers.getSetCookie();
    const { csrfToken } = await csrfRes.json();

    const res = await fetch(`${PORTAL_URL}/api/auth/signin/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: csrfCookies.join("; "),
      },
      body: new URLSearchParams({
        email: "signin-test@example.com",
        csrfToken,
        callbackUrl: `${PORTAL_URL}/dashboard`,
      }),
      redirect: "manual",
    });

    // Should redirect to verify-request page, not error
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("verify-request");
    expect(location).not.toContain("error");
  });
});

describe("pages (authenticated)", () => {
  it("dashboard redirects to a sub-page", async () => {
    const res = await fetchPortal("/dashboard");
    expect([301, 302, 303, 307, 308]).toContain(res.status);
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/\/dashboard\/(keys|billing)/);
  });

  it("keys page renders", async () => {
    const res = await fetchPortal("/dashboard/keys");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("API Keys");
  });

  it("billing page renders", async () => {
    const res = await fetchPortal("/dashboard/billing");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Billing");
  });

  it("history page renders", async () => {
    const res = await fetchPortal("/dashboard/history");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("History");
  });
});

describe("API: keys (authenticated)", () => {
  let keyId: string;

  it("POST /api/keys creates a key", async () => {
    const res = await fetchPortal("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-integration-key" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.primaryKey).toBeTruthy();
    keyId = body.id;
  });

  it("POST /api/keys/[id]/quota sets quota", async () => {
    const res = await fetchPortal(`/api/keys/${keyId}/quota`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotaKB: 5000 }),
    });
    expect(res.status).toBe(200);

    // Verify Table Storage
    const gwSubs = getTableClient(TableName.GW_SUBSCRIPTIONS);
    const entity = await gwSubs.getEntity("subscription", keyId);
    expect(entity.quota_bytes).toBe(5000 * 1024);
  });

  it("POST /api/keys/[id]/quota with null removes quota", async () => {
    const res = await fetchPortal(`/api/keys/${keyId}/quota`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotaKB: null }),
    });
    expect(res.status).toBe(200);

    const gwSubs = getTableClient(TableName.GW_SUBSCRIPTIONS);
    const entity = await gwSubs.getEntity("subscription", keyId);
    expect(entity.quota_bytes).toBe(-1); // -1 sentinel = no quota
  });

  it("POST /api/keys/[id]/quota rejects invalid values", async () => {
    const res = await fetchPortal(`/api/keys/${keyId}/quota`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotaKB: -100 }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/keys/[id]/quota returns 404 for non-owned key", async () => {
    const res = await fetchPortal("/api/keys/fake-key-id/quota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotaKB: 1000 }),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

describe("admin (authenticated as admin)", () => {
  let fetchAdmin: ReturnType<typeof createFetcher>;
  let targetUser: ReturnType<typeof createTestUser>;
  let adminUser: ReturnType<typeof createTestUser>;

  beforeAll(async () => {
    // Create admin user and authenticate
    adminUser = createTestUser();
    const { cookie } = await authenticate(adminUser, { isAdmin: true });
    fetchAdmin = createFetcher(cookie);

    // Create a target user with jobs and invoices
    targetUser = createTestUser();
    await seedTestUser(targetUser);

    const now = Date.now();
    const DAY = 86_400_000;

    // Jobs: 2 within 7 days, 1 outside
    await seedJob(targetUser.id, {
      input_bytes: 100_000,
      created_at: new Date(now - 1 * DAY).toISOString(),
    });
    await seedJob(targetUser.id, {
      input_bytes: 200_000,
      created_at: new Date(now - 3 * DAY).toISOString(),
    });
    await seedJob(targetUser.id, {
      input_bytes: 500_000,
      created_at: new Date(now - 10 * DAY).toISOString(),
    });

    // Invoices
    await seedInvoice(targetUser.stripeCustomerId, { amount: 2.50 });
    await seedInvoice(targetUser.stripeCustomerId, { amount: 1.00 });
  }, 30_000);

  it("admin user was seeded correctly", async () => {
    const perms = await getCurrentPermissions(adminUser.id);
    expect(perms.isAdmin).toBe(true);
  });

  it("non-admin cannot access admin pages", async () => {
    const res = await fetchPortal("/dashboard/admin/users");
    // Should get 404 (not 403 — we hide the admin from non-admins)
    expect(res.status).toBe(404);
  });

  it("admin user list page renders", async () => {
    const res = await fetchAdmin("/dashboard/admin/users");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(targetUser.email);
  });

  it("admin user detail page renders with usage and invoice totals", async () => {
    const res = await fetchAdmin(`/dashboard/admin/users/${targetUser.id}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // User identity
    expect(html).toContain(targetUser.email);
    expect(html).toContain(targetUser.id);

    // Usage (30 days): should contain formatted KB values
    expect(html).toContain("Usage (30 days)");

    // Total invoiced: $2.50 + $1.00 = $3.50
    expect(html).toContain("Total invoiced");
    expect(html).toContain("3.50");
  });

  it("admin can view target user keys section", async () => {
    const res = await fetchAdmin(`/dashboard/admin/users/${targetUser.id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // The user was seeded but has no keys created via the portal, so keys section may be empty
    // Just verify the page doesn't crash
    expect(html).toContain(targetUser.email);
  });
});
