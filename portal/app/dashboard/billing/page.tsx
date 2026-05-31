import { getBillingData } from "@/lib/data/user-page-data";
import { StatCards } from "@/components/stat-cards";
import { InvoiceTable } from "@/components/invoice-table";
import { ManageBillingButton } from "@/components/manage-billing-button";

export default async function BillingPage() {
  const {
    processedKB,
    freeRemainingKB,
    freeTotalKB,
    estimatedCost,
    pricePerUnit,
    invoices,
  } = await getBillingData();

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

      <div>
        <h2 className="mb-4">Invoices</h2>
        <InvoiceTable invoices={invoices} />
      </div>
    </div>
  );
}
