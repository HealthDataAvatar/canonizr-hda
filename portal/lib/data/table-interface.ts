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
  pricePerUnit: number;
  spendCapKB: number | null;
  changedBy: string;
  timestamp: string;
}

export type BillingStatus = "active" | "past_due" | "canceled" | "free_exhausted" | "";

export interface UserPermissionsRecord {
  isAdmin: boolean;
  blocked: boolean;
  stripeCustomerId: string;
  billingStatus: BillingStatus;
  hasPaymentMethod: boolean;
  changedBy: string;
  timestamp: string;
}

export interface UserRecord {
  id: string;
  email: string;
}