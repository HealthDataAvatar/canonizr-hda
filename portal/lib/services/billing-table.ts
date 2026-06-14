/**
 * BillingStore backed by Azure Table Storage.
 * Used for local dev and integration tests (against Azurite).
 */

import { getTableClient } from "@/lib/data/table-client";
import { TableName } from "@/lib/data/table-interface";
import type { BillingStore, Invoice, Usage } from ".";

export class TableBillingStore implements BillingStore {
  async getUsage(customerId: string): Promise<Usage> {
    try {
      const client = getTableClient(TableName.BILLING);
      const e = await client.getEntity("usage", customerId);
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
    const client = getTableClient(TableName.BILLING);
    const entities = client.listEntities({
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
  ): Promise<{ customerId: string; subscriptionId: string; isReturning: boolean }> {
    const client = getTableClient(TableName.BILLING);
    const customerId = `cus_local_${Date.now()}`;
    const subscriptionId = `sub_local_${Date.now()}`;
    await client.upsertEntity({
      partitionKey: "customer",
      rowKey: customerId,
      email,
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
