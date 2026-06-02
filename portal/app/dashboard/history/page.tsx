import { getHistoryData } from "@/lib/data/user-page-data";
import { HistoryPageContent } from "@/components/pages/history-page-content";

export default async function HistoryPage() {
  const { requests } = await getHistoryData();
  return <HistoryPageContent requests={requests} />;
}
