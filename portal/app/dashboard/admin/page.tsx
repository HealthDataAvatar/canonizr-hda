import { getAdminOverview } from "@/lib/data/admin-overview-data";
import { AdminOverviewContent } from "@/components/pages/admin-overview-content";

export default async function AdminPage() {
  const overview = await getAdminOverview();
  return <AdminOverviewContent overview={overview} />;
}
