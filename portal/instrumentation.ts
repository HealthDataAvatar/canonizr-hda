/**
 * Next.js instrumentation — runs once on server startup, before any requests.
 *
 * Ensures Azure Table Storage tables exist and seeds a local dev admin user.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { getNodeAutoInstrumentations } = await import(
      "@opentelemetry/auto-instrumentations-node"
    );
    const { AzureMonitorTraceExporter } = await import(
      "@azure/monitor-opentelemetry-exporter"
    );

    const sdk = new NodeSDK({
      traceExporter: new AzureMonitorTraceExporter({
        connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    console.log("OpenTelemetry started (Azure Monitor).");
  }

  // Table Storage available via either endpoint (prod) or connection string (local)
  if (!process.env.TABLE_STORAGE_URL && !process.env.TABLE_STORAGE_CONNECTION_STRING) return;

  const { ensureAllTables } = await import("@/lib/data/ensure-tables");
  await ensureAllTables();
  console.log("Tables ensured.");

  // In local dev (Azurite), seed an admin user for portal-dev
  const connStr = process.env.TABLE_STORAGE_CONNECTION_STRING;
  if (connStr && connStr.includes("http://")) {
    const { getTableClient } = await import("@/lib/data/table-client");
    const { TableName } = await import("@/lib/data/table-names");
    const { appendConfig } = await import("@/lib/data/tables/user-config");
    const { appendPermissions } = await import("@/lib/data/tables/user-permissions");

    const users = getTableClient(TableName.USERS);
    const gwKeys = getTableClient(TableName.GW_ENCRYPTION_KEYS);

    const adminEmail = "a@a";
    const adminId = "admin-local";
    const encryptionKey = "a".repeat(64);

    await users.upsertEntity({
      partitionKey: "user",
      rowKey: adminId,
      email: adminEmail,
      emailVerified: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    await users.upsertEntity({
      partitionKey: "email",
      rowKey: adminEmail,
      userId: adminId,
    });

    await gwKeys.upsertEntity({
      partitionKey: "key",
      rowKey: adminId,
      key_hex: encryptionKey,
    });

    await appendConfig(adminId, {
      freeUnits: 500,
      maxKeys: 100,
      pricePerUnit: 0.003,
      spendCapKB: null,
      changedBy: "system",
    });

    await appendPermissions(adminId, {
      isAdmin: true,
      blocked: false,
      stripeCustomerId: "",
      billingStatus: "",
      hasPaymentMethod: false,
      changedBy: "system",
    });

    console.log(`Seeded local admin: ${adminEmail}`);
  }
}
