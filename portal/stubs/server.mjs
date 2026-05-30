/**
 * Mail stub — captures magic link URLs into Azurite Table Storage.
 *
 * The portal POSTs { email, url } here when MAIL_STUB_ENDPOINT is set.
 * Integration tests read the captured URL via GET /latest?email=...
 */

import { createServer } from "node:http";
import { TableClient } from "@azure/data-tables";

const AZURITE_CONN = process.env.AZURITE_TABLE_CONN;
if (!AZURITE_CONN) { console.error("AZURITE_TABLE_CONN required"); process.exit(1); }

const mailTable = TableClient.fromConnectionString(AZURITE_CONN, "MailStub", { allowInsecureConnection: true });
await mailTable.createTable().catch(() => {});

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok" });
  }

  // POST / — portal sends { email, subject, html }
  if (req.method === "POST" && path === "/") {
    const body = JSON.parse(await readBody(req));
    const linkMatch = body.html?.match(/href="([^"]+)"/);
    const magicLink = linkMatch?.[1] ?? "";
    await mailTable.upsertEntity({
      partitionKey: "mail",
      rowKey: body.email,
      url: magicLink,
    });
    console.log(`\n✉ Magic link for ${body.email}:\n  ${magicLink}\n`);
    return json(res, 200, { ok: true });
  }

  // GET /latest?email=... — test reads the captured URL
  if (req.method === "GET" && path === "/latest") {
    const email = url.searchParams.get("email");
    if (!email) return json(res, 400, { error: "email required" });
    try {
      const entity = await mailTable.getEntity("mail", email);
      return json(res, 200, { email, url: entity.url });
    } catch {
      return json(res, 404, { error: "no mail captured" });
    }
  }

  json(res, 404, { error: `unhandled ${req.method} ${path}` });
});

const PORT = parseInt(process.env.MAIL_STUB_PORT ?? "4300");
server.listen(PORT, "0.0.0.0", () => console.log(`Mail stub listening on :${PORT}`));
