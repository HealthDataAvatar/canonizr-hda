import { StatCards } from "@/components/stat-cards";
import { InvoiceTable } from "@/components/tables/invoice-table";
import { ManageBillingButton } from "@/components/manage-billing-button";
import { PaidUsageSettings } from "@/components/paid-usage-settings";
import type { BillingData } from "@/lib/data/user-page-data";

export function BillingPageContent({
  processedKB,
  freeRemainingKB,
  freeTotalKB,
  estimatedCost,
  pricePerUnit,
  paidEnabled,
  spendCapUnits,
  invoices,
}: BillingData) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1>Billing</h1>
        <ManageBillingButton />
      </div>

      <StatCards
        processedKB={processedKB}
        freeRemainingKB={freeRemainingKB}
        freeTotalKB={freeTotalKB}
        estimatedCost={estimatedCost}
      />

      <p className="text-sm text-muted-foreground">
        Pricing: <span className="font-mono">${pricePerUnit}</span> per 100 KB
      </p>

      <PaidUsageSettings paidEnabled={paidEnabled} spendCapUnits={spendCapUnits} />

      <div>
        <h2 className="mb-4">Invoices</h2>
        <InvoiceTable invoices={invoices} />
      </div>
    </div>
  );
}
