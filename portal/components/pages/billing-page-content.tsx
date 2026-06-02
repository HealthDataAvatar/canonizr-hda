import { AlertBanner } from "@/components/alert-banner";
import { StatCards } from "@/components/stat-cards";
import { InvoiceTable } from "@/components/tables/invoice-table";
import { ManageBillingButton } from "@/components/manage-billing-button";
import type { BillingData } from "@/lib/data/user-page-data";

function BillingBanner({ billingStatus, freeUsagePercent, hasPaymentMethod }: Pick<BillingData, "billingStatus" | "freeUsagePercent" | "hasPaymentMethod">) {
  if (billingStatus === "past_due") {
    return <AlertBanner variant="error" message="Payment failed. Update your payment method to restore API access." action={<ManageBillingButton />} />;
  }
  if (billingStatus === "canceled") {
    return <AlertBanner variant="error" message="Subscription canceled. Contact support to resubscribe." />;
  }
  if (billingStatus === "free_exhausted") {
    return <AlertBanner variant="error" message="Free tier exhausted. Add a payment method to continue using the API." action={<ManageBillingButton />} />;
  }
  if (freeUsagePercent >= 80 && !hasPaymentMethod) {
    return <AlertBanner variant="warning" message={`You've used ${freeUsagePercent}% of your free tier. Add a payment method to avoid interruption.`} />;
  }
  return null;
}

export function BillingPageContent({
  processedKB,
  freeRemainingKB,
  freeTotalKB,
  estimatedCost,
  freeUsagePercent,
  pricePerUnit,
  invoices,
  billingStatus,
  hasPaymentMethod,
}: BillingData) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1>Billing</h1>
        <ManageBillingButton />
      </div>

      <BillingBanner billingStatus={billingStatus} freeUsagePercent={freeUsagePercent} hasPaymentMethod={hasPaymentMethod} />

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
