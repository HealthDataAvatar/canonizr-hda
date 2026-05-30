import Link from "next/link";
import { getHistoryData } from "@/lib/data/data";
import { RequestTable } from "@/components/request-table";

export default async function HistoryPage() {
  const { requests } = await getHistoryData();

  return (
    <div className="space-y-8">
      <h1 className="text-[1.5rem] font-semibold">History</h1>

      {requests.length === 0 ? (
        <p className="py-8 text-center text-[0.9375rem] text-muted-foreground">
          No requests yet.{" "}
          <Link
            href="/dashboard/keys"
            className="text-accent hover:underline"
          >
            Create an API key
          </Link>{" "}
          to start converting documents.
        </p>
      ) : (
        <RequestTable requests={requests} />
      )}
    </div>
  );
}
