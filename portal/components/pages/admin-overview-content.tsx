import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { Section } from "@/components/ui/section";
import { formatKB } from "@/lib/pure/format";
import { timeAgo } from "@/lib/pure/time";
import type { AdminOverview } from "@/lib/data/admin-overview-data";

export function AdminOverviewContent({ overview }: { overview: AdminOverview }) {
  const errorRate =
    overview.jobsToday > 0
      ? `${Math.round((overview.jobsErrorToday / overview.jobsToday) * 100)}%`
      : "—";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1>Admin</h1>
        <Link
          href="/dashboard/admin/users"
          className="text-sm text-muted-foreground hover:text-primary"
        >
          All users &rarr;
        </Link>
      </div>

      <Section title="Queue">
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
      </Section>

      <Section title="Platform">
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
      </Section>
    </div>
  );
}
