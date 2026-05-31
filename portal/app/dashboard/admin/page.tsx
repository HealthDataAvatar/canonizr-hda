import Link from "next/link";
import { getAdminOverview } from "@/lib/data/admin-overview-data";
import { MetricCard } from "@/components/metric-card";
import { formatKB } from "@/lib/pure/format";
import { timeAgo } from "@/lib/pure/time";

export default async function AdminPage() {
  const overview = await getAdminOverview();

  const errorRate =
    overview.jobsToday > 0
      ? `${Math.round((overview.jobsErrorToday / overview.jobsToday) * 100)}%`
      : "—";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-[1.5rem] font-semibold">Admin</h1>
        <Link
          href="/dashboard/admin/users"
          className="text-[0.875rem] text-muted-foreground hover:text-foreground"
        >
          All users &rarr;
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-[0.875rem] font-medium text-muted-foreground uppercase tracking-wide">
          Queue
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Queued jobs"
            value={String(overview.queueLength)}
            detail={overview.queueLength > 0 ? `${formatKB(overview.queueSizeKB)} total` : undefined}
          />
          <MetricCard
            label="In flight"
            value={String(overview.inFlightJobs)}
          />
          <MetricCard
            label="Oldest waiting"
            value={
              overview.oldestWaitingSince
                ? timeAgo(overview.oldestWaitingSince)
                : "—"
            }
          />
          <MetricCard
            label="Jobs today"
            value={String(overview.jobsToday)}
            detail={overview.jobsErrorToday > 0 ? `${overview.jobsErrorToday} errors (${errorRate})` : undefined}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[0.875rem] font-medium text-muted-foreground uppercase tracking-wide">
          Platform
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total users"
            value={String(overview.totalUsers)}
          />
          <MetricCard
            label="Error rate today"
            value={errorRate}
          />
        </div>
      </section>
    </div>
  );
}
