import { TableClient } from "@azure/data-tables";

export const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3000";
export const AZURITE_CONN =
  process.env.AZURITE_TABLE_CONN ??
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;TableEndpoint=http://localhost:10002/devstoreaccount1";

export const TABLE_OPTS = { allowInsecureConnection: true };

// ---------------------------------------------------------------------------
// Azurite table helpers
// ---------------------------------------------------------------------------

export function table(name: string) {
  return TableClient.fromConnectionString(AZURITE_CONN, name, TABLE_OPTS);
}

export async function ensureTable(name: string) {
  const client = table(name);
  await client.createTable().catch(() => {});
  return client;
}

// ---------------------------------------------------------------------------
// Test user seeding
// ---------------------------------------------------------------------------

export const TEST_USER = {
  id: "test-user-001",
  email: "test@example.com",
  stripeCustomerId: "cus_test_001",
};

export async function seedTestUser() {
  const users = await ensureTable("Users");
  await users.upsertEntity({
    partitionKey: "user",
    rowKey: TEST_USER.id,
    email: TEST_USER.email,
    name: "Test User",
    encryptionKey: "0".repeat(64),
    stripeCustomerId: TEST_USER.stripeCustomerId,
    maxKeys: 100,
    freeUnits: 500,
    pricePerUnit: 0.003,
  });
  await users.upsertEntity({
    partitionKey: "email",
    rowKey: TEST_USER.email,
    userId: TEST_USER.id,
  });
}

// ---------------------------------------------------------------------------
// Auth — full magic link flow against real next-auth + Azurite
// ---------------------------------------------------------------------------

const MAIL_STUB_URL = process.env.MAIL_STUB_URL ?? "http://localhost:4300";

export async function authenticate(): Promise<string> {
  await seedTestUser();

  // 1. CSRF token
  const csrfRes = await fetch(`${PORTAL_URL}/api/auth/csrf`);
  const csrfCookies = csrfRes.headers.getSetCookie();
  const { csrfToken } = await csrfRes.json();

  // 2. Request magic link (portal POSTs the URL to the mail stub)
  const signinRes = await fetch(`${PORTAL_URL}/api/auth/signin/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookies.join("; "),
    },
    body: new URLSearchParams({
      email: TEST_USER.email,
      csrfToken,
      callbackUrl: `${PORTAL_URL}/dashboard`,
    }),
    redirect: "manual",
  });

  // 3. Read the magic link URL from the mail stub
  const mailRes = await fetch(`${MAIL_STUB_URL}/latest?email=${encodeURIComponent(TEST_USER.email)}`);
  if (!mailRes.ok) throw new Error(`Mail stub returned ${mailRes.status}: ${await mailRes.text()}`);
  const { url: magicLink } = await mailRes.json();

  // 4. Visit the magic link to exchange token for session
  const allCookies = [...csrfCookies, ...signinRes.headers.getSetCookie()];

  const callbackRes = await fetch(magicLink, {
    headers: { Cookie: allCookies.join("; ") },
    redirect: "manual",
  });

  return [...allCookies, ...callbackRes.headers.getSetCookie()].join("; ");
}

// ---------------------------------------------------------------------------
// Authenticated fetch
// ---------------------------------------------------------------------------

export function createFetcher(cookie: string) {
  return async function fetchPortal(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    if (cookie) headers.set("Cookie", cookie);
    return fetch(`${PORTAL_URL}${path}`, { redirect: "manual", ...init, headers });
  };
}

// ---------------------------------------------------------------------------
// Job seeding
// ---------------------------------------------------------------------------

export async function seedJob(
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  const client = await ensureTable("jobs");
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await client.upsertEntity({
    partitionKey: userId,
    rowKey: jobId,
    sub_id: "sub-001",
    key_name: "test-key",
    original_filename: "test.pdf",
    mime_type: "application/pdf",
    input_bytes: 150000,
    input_hash: "abc123",
    status: "ok",
    error_detail: "",
    actions: "docling",
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    retention_expires: "",
    deleted: false,
    ...overrides,
  });
  return jobId;
}
