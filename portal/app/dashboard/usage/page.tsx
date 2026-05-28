import Link from "next/link";
import { getUsageData } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestTable } from "@/components/request-table";

function formatKB(kb: number): string {
  if (kb >= 1000) return `${(kb / 1000).toFixed(kb >= 10000 ? 0 : 1)} MB`;
  return `${kb} KB`;
}

export default async function UsagePage() {
  const { processedKB, freeRemainingKB, freeTotalKB, estimatedCost, requests } =
    await getUsageData();

  return (
    <div className="space-y-8">
      <h1 className="text-[1.5rem] font-semibold">Usage</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
              Processed this period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">
              {formatKB(processedKB)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
              Free tier remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">
              {freeRemainingKB !== null
                ? `${formatKB(freeRemainingKB)} / ${formatKB(freeTotalKB!)}`
                : "Unlimited"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
              Estimated cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-3xl font-semibold">
              ${estimatedCost.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-[1.125rem] font-semibold">Request history</h2>
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
    </div>
  );
}
