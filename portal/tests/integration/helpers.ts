import { TableClient } from "@azure/data-tables";
import { ensureAllTables } from "@/lib/ensure-tables";
import { TableName } from "@/lib/table-names";

export const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3000";
export const APIM_STUB_URL = process.env.APIM_STUB_URL ?? "http://localhost:8080";
export const AZURITE_CONN =
  process.env.AZURITE_TABLE_CONN ??
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;TableEndpoint=http://localhost:10002/devstoreaccount1";

export const TABLE_OPTS = { allowInsecureConnection: true };

// ---------------------------------------------------------------------------
// Azurite table helpers
// ---------------------------------------------------------------------------

/** Ensure all tables exist. Call once before tests. */
export async function initTables() {
  await ensureAllTables(AZURITE_CONN);
}

export function table(name: string) {
  return TableClient.fromConnectionString(AZURITE_CONN, name, TABLE_OPTS);
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

export async function seedTestUser(user: TestUser) {
  await initTables();
  const users = table(TableName.USERS);
  await users.upsertEntity({
    partitionKey: "user",
    rowKey: user.id,
    email: user.email,
    name: "Test User",
    encryptionKey: "0".repeat(64),
    stripeCustomerId: user.stripeCustomerId,
    maxKeys: 100,
    freeUnits: 500,
    pricePerUnit: 0.003,
  });
  await users.upsertEntity({
    partitionKey: "email",
    rowKey: user.email,
    userId: user.id,
  });

  // Gateway tables
  const gwKeys = table(TableName.GW_ENCRYPTION_KEYS);
  await gwKeys.upsertEntity({
    partitionKey: TableName.GW_ENCRYPTION_KEYS,
    rowKey: user.id,
    key_hex: "0".repeat(64),
  });
}

// ---------------------------------------------------------------------------
// Auth — full magic link flow against real next-auth + Azurite
// ---------------------------------------------------------------------------

const MAIL_STUB_URL = process.env.MAIL_STUB_URL ?? "http://localhost:4300";

export async function authenticate(user?: TestUser): Promise<{ cookie: string; user: TestUser }> {
  const testUser = user ?? createTestUser();
  await seedTestUser(testUser);

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
  const client = table(TableName.GW_JOBS);
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

  const submit = await fetch(`${APIM_STUB_URL}/convert`, {
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
