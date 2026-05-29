/**
 * Ensure all required Azure Table Storage tables exist.
 * Runs once at container startup before the server starts.
 *
 * Table names must match portal/lib/table-names.ts and gateway/app/tables.py.
 */

import { TableClient } from "@azure/data-tables";

const TABLE_NAMES = [
  "Users", "Accounts", "Sessions", "VerificationTokens",
  "ApiKeys", "Billing",
  "GwSubscriptions", "GwEncryptionKeys", "GwJobs",
  "AdminAuditLog", "UserAuditLog",
];

const connStr = process.env.TABLE_STORAGE_CONNECTION_STRING;
if (!connStr) {
  console.warn("TABLE_STORAGE_CONNECTION_STRING not set — skipping table init");
  process.exit(0);
}

const opts = connStr.includes("http://") ? { allowInsecureConnection: true } : {};
await Promise.all(
  TABLE_NAMES.map((name) =>
    TableClient.fromConnectionString(connStr, name, opts)
      .createTable()
      .catch(() => {})
  )
);
console.log(`Tables ensured: ${TABLE_NAMES.join(", ")}`);

// In local dev (Azurite), seed admin@canonizr.com as admin user.
// Signs in via normal magic link flow — this pre-creates the user entity
// so getUserByEmail finds it and skips createUser.
if (connStr.includes("http://")) {
  const { randomBytes } = await import("crypto");
  const users = TableClient.fromConnectionString(connStr, "Users", opts);
  const gwKeys = TableClient.fromConnectionString(connStr, "GwEncryptionKeys", opts);

  const adminEmail = "admin@canonizr.com";
  const adminId = "admin-local";
  const encryptionKey = randomBytes(32).toString("hex");

  try {
    await users.getEntity("email", adminEmail);
  } catch {
    await users.createEntity({
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
    await users.createEntity({
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
