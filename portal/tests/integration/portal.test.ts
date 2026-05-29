/**
 * Portal integration tests.
 *
 * Run against a real portal container + Azurite + stubs.
 * Authenticates via the full magic link flow.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { authenticate, createFetcher, PORTAL_URL } from "./helpers";

let fetchPortal: ReturnType<typeof createFetcher>;

beforeAll(async () => {
  const cookie = await authenticate();
  fetchPortal = createFetcher(cookie);
}, 30_000);

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
  it("POST /api/keys creates a key", async () => {
    const res = await fetchPortal("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-integration-key" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.primaryKey).toBeTruthy();
  });
});
