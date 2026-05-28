import { TriangleAlert, ArrowRight } from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/time";

export interface RecentError {
  id: string;
  keyName: string;
  status: number;
  timestamp: string;
}

export function ErrorBanner({ error }: { error: RecentError }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-background p-4">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex-1 space-y-1">
        <p className="text-[0.9375rem] font-semibold text-destructive">
          Request failed
        </p>
        <p className="text-[0.8125rem] text-muted-foreground">
          {timeAgo(error.timestamp)},{" "}
          <span className="font-mono text-accent">{error.keyName}</span> returned{" "}
          <span className="font-mono text-accent">{error.status}</span>.
        </p>
      </div>
      <Link
        href={`/dashboard/usage#${error.id}`}
        title="View details"
        className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
