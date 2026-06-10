/**
 * Service interfaces for the portal.
 *
 * Keys: TableKeyStore (all environments — writes GwApiKeys hash table for gateway auth)
 * Billing: StripeBillingStore (production) / TableBillingStore (local/test)
 */

// ---------------------------------------------------------------------------
// Key Store
// ---------------------------------------------------------------------------

export interface ApiKey {
  id: string;
  displayName: string;
  key: string;
  createdDate: string;
  lastUsed: string;
  usageKB: number;
  quotaKB: number | null;
}

export interface KeyStore {
  list(userId: string): Promise<ApiKey[]>;
  create(userId: string, name: string): Promise<{ id: string; primaryKey: string }>;
  get(subscriptionId: string): Promise<string>;
  rotate(subscriptionId: string): Promise<string>;
  delete(subscriptionId: string): Promise<void>;
  setQuota(subscriptionId: string, quotaKB: number | null): Promise<void>;
}

// ---------------------------------------------------------------------------
// Billing Store
// ---------------------------------------------------------------------------

export interface Invoice {
  id: string;
  date: string;
  processedKB: number;
  amount: number;
  status: string;
  url: string | null;
}

export interface Usage {
  totalUnits: number;
  periodStart: string;
  periodEnd: string;
}

export interface BillingStore {
  getUsage(customerId: string): Promise<Usage>;
  getInvoices(customerId: string): Promise<Invoice[]>;
  createCustomer(email: string): Promise<{ customerId: string; subscriptionId: string; isReturning: boolean }>;
  createBillingPortalSession(customerId: string, returnUrl: string): Promise<string>;
  hasPaymentMethod(customerId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Service container
// ---------------------------------------------------------------------------

export interface Services {
  keys: KeyStore;
  billing: BillingStore;
}

let _services: Services | null = null;

export function getServices(): Services {
  if (_services) return _services;

  const { TableKeyStore } = require("./keys-table") as typeof import("./keys-table");

  if (process.env.USE_LOCAL_SERVICES === "true") {
    const { TableBillingStore } = require("./billing-table") as typeof import("./billing-table");
    _services = {
      keys: new TableKeyStore(),
      billing: new TableBillingStore(),
    };
  } else {
    const { StripeBillingStore } = require("./billing-stripe") as typeof import("./billing-stripe");
    _services = {
      keys: new TableKeyStore(),
      billing: new StripeBillingStore(),
    };
  }

  return _services;
}
