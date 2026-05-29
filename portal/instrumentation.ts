/**
 * Next.js instrumentation — runs once on server startup, before any requests.
 *
 * Creates Azure Table Storage tables and seeds local dev admin user.
 */

const TABLE_NAMES = [
  "Users", "Accounts", "Sessions", "VerificationTokens",
  "ApiKeys", "Billing",
  "GwSubscriptions", "GwEncryptionKeys", "GwJobs",
  "AdminAuditLog", "UserAuditLog",
];

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const connStr = process.env.TABLE_STORAGE_CONNECTION_STRING;
  if (!connStr) return;

  const { TableClient } = await import("@azure/data-tables");

  const opts = connStr.includes("http://")
    ? { allowInsecureConnection: true }
    : {};

  await Promise.all(
    TABLE_NAMES.map((name) =>
      TableClient.fromConnectionString(connStr, name, opts)
        .createTable()
        .catch(() => {})
    )
  );
  console.log(`Tables ensured: ${TABLE_NAMES.join(", ")}`);

  if (connStr.includes("http://")) {
    const users = TableClient.fromConnectionString(connStr, "Users", opts);
    const gwKeys = TableClient.fromConnectionString(connStr, "GwEncryptionKeys", opts);

    const adminEmail = "a@a";
    const adminId = "admin-local";
    const encryptionKey = "a".repeat(64);

    await users.upsertEntity({
      partitionKey: "user",
      rowKey: adminId,
      email: adminEmail,
      emailVerified: new Date().toISOString(),
      name: "Local Admin",
      image: "",
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
      partitionKey: "GwEncryptionKeys",
      rowKey: adminId,
      key_hex: encryptionKey,
    });

    console.log(`Seeded local admin: ${adminEmail}`);
  }
}
