import { TriangleAlert } from "lucide-react";
import { StatCards } from "@/components/stat-cards";
import { InvoiceTable } from "@/components/tables/invoice-table";
import { ManageBillingButton } from "@/components/manage-billing-button";
import type { BillingData } from "@/lib/data/user-page-data";

function BillingBanner({ billingStatus, freeUsagePercent, hasPaymentMethod }: Pick<BillingData, "billingStatus" | "freeUsagePercent" | "hasPaymentMethod">) {
  let variant: "warning" | "error" | null = null;
  let message = "";

  if (billingStatus === "past_due") {
    variant = "error";
    message = "Payment failed. Update your payment method to restore API access.";
  } else if (billingStatus === "canceled") {
    variant = "error";
    message = "Subscription canceled. Contact support to resubscribe.";
  } else if (billingStatus === "free_exhausted") {
    variant = "error";
    message = "Free tier exhausted. Add a payment method to continue using the API.";
  } else if (freeUsagePercent >= 80 && !hasPaymentMethod) {
    variant = "warning";
    message = `You've used ${freeUsagePercent}% of your free tier. Add a payment method to avoid interruption.`;
  }

  if (!variant) return null;

  const isError = variant === "error";
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-4 ${isError ? "border-destructive/30" : "border-amber-500/30 bg-amber-500/5"}`}>
      <TriangleAlert className={`mt-0.5 size-4 shrink-0 ${isError ? "text-destructive" : "text-amber-500"}`} />
      <p className={`flex-1 text-sm font-medium ${isError ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
        {message}
      </p>
      {(billingStatus === "past_due" || billingStatus === "free_exhausted") && <ManageBillingButton />}
    </div>
  );
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
