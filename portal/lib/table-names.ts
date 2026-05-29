/**
 * Azure Table Storage table names. Single source of truth for the portal.
 *
 * Must match gateway/app/tables.py exactly — both services read/write
 * the same tables.
 */

export const TableName = {
  // Auth adapter (portal only)
  USERS: "Users",
  ACCOUNTS: "Accounts",
  SESSIONS: "Sessions",
  VERIFICATION_TOKENS: "VerificationTokens",

  // Portal services
  API_KEYS: "ApiKeys",
  BILLING: "Billing",

  // Gateway shared (portal writes, gateway reads)
  GW_SUBSCRIPTIONS: "GwSubscriptions",
  GW_ENCRYPTION_KEYS: "GwEncryptionKeys",
  GW_JOBS: "GwJobs",
} as const;
