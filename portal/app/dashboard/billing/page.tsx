import { getBillingData } from "@/lib/data/user-page-data";
import { BillingPageContent } from "@/components/pages/billing-page-content";

export default async function BillingPage() {
  const data = await getBillingData();
  return <BillingPageContent {...data} />;
}
