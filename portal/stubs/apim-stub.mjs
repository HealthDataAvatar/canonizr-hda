/**
 * APIM stub — resolves API keys to subscription IDs, proxies to gateway.
 *
 * In production, Azure APIM does this. In tests, this stub reads the
 * ApiKeys table from Azurite to find the subscription ID for a given key,
 * injects the X-Subscription-Id header, and forwards to the real gateway.
 */

import { createServer } from "node:http";
import { TableClient } from "@azure/data-tables";

const AZURITE_CONN = process.env.AZURITE_TABLE_CONN;
if (!AZURITE_CONN) { console.error("AZURITE_TABLE_CONN required"); process.exit(1); }

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://gateway:8000";
const PORT = parseInt(process.env.APIM_STUB_PORT ?? "8080");

const keysTable = TableClient.fromConnectionString(AZURITE_CONN, "ApiKeys", { allowInsecureConnection: true });

async function resolveKey(apiKey) {
  const entities = keysTable.listEntities();
  for await (const e of entities) {
    if (e.primaryKey === apiKey) {
      return { subId: e.rowKey, userId: e.partitionKey };
    }
  }
  return null;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Ocp-Apim-Subscription-Key",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }

  // Resolve API key → subscription ID
  const apiKey = req.headers["ocp-apim-subscription-key"];
  if (!apiKey) {
    res.writeHead(401, { "Content-Type": "application/json", ...CORS });
    return res.end(JSON.stringify({ error: "Missing Ocp-Apim-Subscription-Key" }));
  }

  const resolved = await resolveKey(apiKey);
  if (!resolved) {
    res.writeHead(403, { "Content-Type": "application/json", ...CORS });
    return res.end(JSON.stringify({ error: "Invalid API key" }));
  }

  // Read request body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  // Forward to gateway with X-Subscription-Id injected
  const headers = { ...req.headers, "x-subscription-id": resolved.subId };
  delete headers["ocp-apim-subscription-key"];
  delete headers["host"];

  try {
    const gwRes = await fetch(`${GATEWAY_URL}${req.url}`, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });

    // Forward response
    const respBody = await gwRes.arrayBuffer();
    const respHeaders = {};
    gwRes.headers.forEach((v, k) => { respHeaders[k] = v; });
    res.writeHead(gwRes.status, { ...respHeaders, ...CORS });
    res.end(Buffer.from(respBody));
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify({ error: `Gateway unreachable: ${err.message}` }));
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`APIM stub listening on :${PORT}, proxying to ${GATEWAY_URL}`));
