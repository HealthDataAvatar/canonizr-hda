import { setConnectionString, getTableClient } from "@/lib/data/table-client";
import { ensureAllTables } from "@/lib/data/ensure-tables";
import { TableName } from "@/lib/data/table-names";

export const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3000";
export const APIM_STUB_URL = process.env.APIM_STUB_URL ?? "http://localhost:8080";

const AZURITE_CONN =
  process.env.AZURITE_TABLE_CONN ??
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;TableEndpoint=http://localhost:10002/devstoreaccount1";

// Point all table access at Azurite for tests
setConnectionString(AZURITE_CONN);
process.env.TABLE_STORAGE_CONNECTION_STRING = AZURITE_CONN;

// ---------------------------------------------------------------------------
// Azurite table helpers
// ---------------------------------------------------------------------------

export async function initTables() {
  await ensureAllTables();
}

// ---------------------------------------------------------------------------
// Test user seeding
// ---------------------------------------------------------------------------

export interface TestUser {
  id: string;
  email: string;
  stripeCustomerId: string;
}

export function createTestUser(): TestUser {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `test-user-${suffix}`,
    email: `test-${suffix}@example.com`,
    stripeCustomerId: `cus_test_${suffix}`,
  };
}

export async function seedTestUser(user: TestUser, opts?: { isAdmin?: boolean }) {
  await initTables();
  const { appendConfig } = await import("@/lib/data/tables/user-config");
  const { appendPermissions } = await import("@/lib/data/tables/user-permissions");

  // Auth identity
  const users = getTableClient(TableName.USERS);
  await users.upsertEntity({
    partitionKey: "user",
    rowKey: user.id,
    email: user.email,
    emailVerified: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  await users.upsertEntity({
    partitionKey: "email",
    rowKey: user.email,
    userId: user.id,
  });

  // Config
  await appendConfig(user.id, {
    freeUnits: 500,
    maxKeys: 100,
    pricePerUnit: 0.003,
    spendCapKB: null,
    changedBy: "system",
  });

  // Permissions
  await appendPermissions(user.id, {
    isAdmin: opts?.isAdmin ?? false,
    blocked: false,
    stripeCustomerId: user.stripeCustomerId,
    changedBy: "system",
  });

  // Gateway encryption key
  const gwKeys = getTableClient(TableName.GW_ENCRYPTION_KEYS);
  await gwKeys.upsertEntity({
    partitionKey: "key",
    rowKey: user.id,
    key_hex: "0".repeat(64),
  });
}

// ---------------------------------------------------------------------------
// Invoice seeding
// ---------------------------------------------------------------------------

export async function seedInvoice(
  customerId: string,
  overrides: Record<string, unknown> = {},
) {
  await initTables();
  const client = getTableClient(TableName.BILLING);
  const invoiceId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await client.upsertEntity({
    partitionKey: "invoice",
    rowKey: invoiceId,
    customerId,
    date: new Date().toISOString(),
    processedKB: 10000,
    amount: 1.50,
    status: "paid",
    url: null,
    ...overrides,
  });
  return invoiceId;
}

// ---------------------------------------------------------------------------
// Auth — full magic link flow against real next-auth + Azurite
// ---------------------------------------------------------------------------

const MAIL_STUB_URL = process.env.MAIL_STUB_URL ?? "http://localhost:4300";

export async function authenticate(user?: TestUser, seedOpts?: { isAdmin?: boolean }): Promise<{ cookie: string; user: TestUser }> {
  const testUser = user ?? createTestUser();
  await seedTestUser(testUser, seedOpts);

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
      email: testUser.email,
      csrfToken,
      callbackUrl: `${PORTAL_URL}/dashboard`,
    }),
    redirect: "manual",
  });

  // 3. Read the magic link URL from the mail stub
  const mailRes = await fetch(`${MAIL_STUB_URL}/latest?email=${encodeURIComponent(testUser.email)}`);
  if (!mailRes.ok) throw new Error(`Mail stub returned ${mailRes.status}: ${await mailRes.text()}`);
  const { url: magicLink } = await mailRes.json();

  // 4. Visit the magic link to exchange token for session
  const allCookies = [...csrfCookies, ...signinRes.headers.getSetCookie()];

  const callbackRes = await fetch(magicLink, {
    headers: { Cookie: allCookies.join("; ") },
    redirect: "manual",
  });

  const cookie = [...allCookies, ...callbackRes.headers.getSetCookie()].join("; ");
  return { cookie, user: testUser };
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
  await initTables();
  const client = getTableClient(TableName.GW_JOBS);
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

// ---------------------------------------------------------------------------
// Gateway — submit via APIM stub and poll for result
// ---------------------------------------------------------------------------

export async function submitAndPoll(
  apiKey: string,
  file: { name: string; content: string; type: string },
  timeoutMs = 60_000,
): Promise<{ submitBody: Record<string, unknown>; submitStatus: number; result: Response | null }> {
  const formData = new FormData();
  formData.append("file", new Blob([file.content], { type: file.type }), file.name);

  const submit = await fetch(`${APIM_STUB_URL}/v1/jobs`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
    body: formData,
  });

  const submitBody = await submit.json();
  if (submit.status !== 202) return { submitBody, submitStatus: submit.status, result: null };

  const poll_url = submitBody.poll_url as string;
  if (!poll_url) return { submitBody, submitStatus: submit.status, result: null };

  const deadline = Date.now() + timeoutMs;
  let result: Response | null = null;
  while (Date.now() < deadline) {
    result = await fetch(`${APIM_STUB_URL}${poll_url}`, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
    });
    if (result.status !== 202) return { submitBody, submitStatus: submit.status, result };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { submitBody, submitStatus: submit.status, result };
}
