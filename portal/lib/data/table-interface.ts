/**
 * Azure Table Storage table names. Single source of truth for the portal.
 *
 * Must match gateway/app/tables.py exactly — both services read/write
 * the same tables.
 */

export const TableName = {
  // Auth adapter (portal only) — JWT strategy + email provider, so no Accounts/Sessions tables
  USERS: "Users",
  VERIFICATION_TOKENS: "VerificationTokens",

  // User data (append-only)
  USER_CONFIG: "UserConfig",
  USER_PERMISSIONS: "UserPermissions",

  // Portal services
  API_KEYS: "ApiKeys",
  BILLING: "Billing",

  // Gateway shared (portal writes, gateway reads)
  GW_SUBSCRIPTIONS: "GwSubscriptions",
  GW_ENCRYPTION_KEYS: "GwEncryptionKeys",
  GW_JOBS: "GwJobs",
  GW_USER_JOBS: "GwUserJobs",
  GW_API_KEYS: "GwApiKeys",
  GW_BILLING: "GwBilling",
} as const;

export type JobType = "canonize" | "describe" | "";

export interface JobRecord {
  id: string;
  timestamp: string;
  completedAt?: string;
  keyId: string;
  jobType: JobType;
  billableKB: number;
  status: "ok" | "processing" | "error" | "deleted";
  retentionExpires?: string;
  detail?: string;
  originalFilename?: string;
  mimeType?: string;
  inputBytes: number;
  artefacts?: string;
  pricePerUnit?: number;
}

export interface JobPage {
  jobs: JobRecord[];
  nextCursor: string | null;
}


export interface UserConfigRecord {
  freeUnits: number | null;
  maxKeys: number;
  // Caps in 100KB units. Effective hard cap = min(spendCapUnits, adminCapUnits).
  // spendCapUnits is user-set (self-protection); adminCapUnits is admin-only (anti-abuse).
  spendCapUnits: number | null;
  adminCapUnits: number | null;
  // User opt-in: process past the free allowance (incurs charges).
  paidEnabled: boolean;
  // Admin comp: truly unlimited usage, never metered to Stripe. Usage is still
  // recorded in GwJobs. Bypasses free line + caps in the gateway; the usage
  // reporter skips meter events for comp users.
  comp: boolean;
  changedBy: string;
  timestamp: string;
}

export interface UserPermissionsRecord {
  isAdmin: boolean;
  blocked: boolean;
  stripeCustomerId: string;
  changedBy: string;
  timestamp: string;
}

export interface UserRecord {
  id: string;
  email: string;
}