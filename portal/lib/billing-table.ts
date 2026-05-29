/**
 * BillingStore backed by Azure Table Storage.
 * Used for local dev and integration tests (against Azurite).
 * Stores fixture-like billing data per user.
 */

import { TableClient } from "@azure/data-tables";
import type { BillingStore, Invoice, Usage } from "./services";
import { TableName } from "./table-names";

const TABLE = TableName.BILLING;

export class TableBillingStore implements BillingStore {
  private client: TableClient;

  constructor(connectionString: string) {
    const opts = connectionString.includes("http://") ? { allowInsecureConnection: true } : {};
    this.client = TableClient.fromConnectionString(connectionString, TABLE, opts);
    this.client.createTable().catch(() => {});
  }

  async getUsage(customerId: string): Promise<Usage> {
    try {
      const e = await this.client.getEntity("usage", customerId);
      return {
        totalUnits: (e.totalUnits as number) ?? 0,
        periodStart: (e.periodStart as string) ?? "",
        periodEnd: (e.periodEnd as string) ?? "",
      };
    } catch {
      return { totalUnits: 0, periodStart: "", periodEnd: "" };
    }
  }

  async getInvoices(customerId: string): Promise<Invoice[]> {
    const entities = this.client.listEntities({
      queryOptions: { filter: `PartitionKey eq 'invoice' and customerId eq '${customerId}'` },
    });
    const invoices: Invoice[] = [];
    for await (const e of entities) {
      invoices.push({
        id: e.rowKey as string,
        date: (e.date as string) ?? "",
        processedKB: (e.processedKB as number) ?? 0,
        amount: (e.amount as number) ?? 0,
        status: (e.status as string) ?? "unknown",
        url: (e.url as string) ?? null,
      });
    }
    return invoices;
  }

  async createCustomer(
    email: string,
    name?: string,
  ): Promise<{ customerId: string; subscriptionId: string; isReturning: boolean }> {
    const customerId = `cus_local_${Date.now()}`;
    const subscriptionId = `sub_local_${Date.now()}`;
    await this.client.upsertEntity({
      partitionKey: "customer",
      rowKey: customerId,
      email,
      name: name ?? "",
      subscriptionId,
    });
    return { customerId, subscriptionId, isReturning: false };
  }

  async createBillingPortalSession(
    _customerId: string,
    returnUrl: string,
  ): Promise<string> {
    return returnUrl;
  }
}
