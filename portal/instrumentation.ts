/**
 * Next.js instrumentation — runs once on server startup, before any requests.
 *
 * Ensures Azure Table Storage tables exist and seeds a local dev admin user.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (!process.env.TABLE_STORAGE_CONNECTION_STRING) return;

  const { ensureAllTables } = await import("@/lib/data/ensure-tables");
  await ensureAllTables();
  console.log("Tables ensured.");

  // In local dev (Azurite), seed an admin user for portal-dev
  if (process.env.TABLE_STORAGE_CONNECTION_STRING.includes("http://")) {
    const { getTableClient } = await import("@/lib/data/table-client");
    const { TableName } = await import("@/lib/data/table-names");

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
      encryptionKey,
      stripeCustomerId: "",
      maxKeys: 100,
      freeUnits: 500,
      pricePerUnit: 0.003,
      notes: "",
      isAdmin: true,
      blocked: false,
    });

    await users.upsertEntity({
      partitionKey: "email",
      rowKey: adminEmail,
      userId: adminId,
    });

    await gwKeys.upsertEntity({
      partitionKey: TableName.GW_ENCRYPTION_KEYS,
      rowKey: adminId,
      key_hex: encryptionKey,
    });

    console.log(`Seeded local admin: ${adminEmail}`);
  }
}
