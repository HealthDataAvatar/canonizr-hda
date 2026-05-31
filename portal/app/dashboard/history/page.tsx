import Link from "next/link";
import { getHistoryData } from "@/lib/data/user-page-data";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestTable } from "@/components/request-table";

export default async function HistoryPage() {
  const { requests } = await getHistoryData();

  return (
    <div className="space-y-8">
      <h1>History</h1>

      {requests.length === 0 ? (
        <EmptyState>
          No requests yet.{" "}
          <Link
            href="/dashboard/keys"
            className="text-accent hover:underline"
          >
            Create an API key
          </Link>{" "}
          to start converting documents.
        </EmptyState>
      ) : (
        <RequestTable requests={requests} />
      )}
    </div>
  );
}
