import { AlertBanner } from "@/components/alert-banner";
import { ManageBillingButton } from "@/components/manage-billing-button";

/** Top-of-dashboard banner for hard-block account states. Mirrors the gateway's
 * two 403 codes: delinquent (payment, self-serve) vs blocked (admin, support).
 * blocked wins if somehow both are set — same precedence as the gateway. */
export function AccountStatusBanner({ blocked, delinquent }: { blocked: boolean; delinquent: boolean }) {
  if (blocked) {
    return <AlertBanner variant="error" message="Account blocked — contact support to restore access." />;
  }
  if (delinquent) {
    return (
      <AlertBanner
        variant="error"
        message="Payment overdue — access is paused. Update your payment to restore it."
        action={<ManageBillingButton />}
      />
    );
  }
  return null;
}
