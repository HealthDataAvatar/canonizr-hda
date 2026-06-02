import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/pure/time";
import { AlertBanner } from "@/components/alert-banner";

export interface RecentError {
  id: string;
  keyName: string;
  status: number;
  timestamp: string;
}

export function ErrorBanner({ error }: { error: RecentError }) {
  return (
    <AlertBanner
      variant="error"
      action={
        <Link
          href={`/dashboard/usage#${error.id}`}
          title="View details"
          className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="size-4" />
        </Link>
      }
    >
      <div className="space-y-1">
        <p className="font-semibold text-destructive">Request failed</p>
        <p className="text-sm text-muted-foreground">
          {timeAgo(error.timestamp)},{" "}
          <span className="font-mono text-accent">{error.keyName}</span> returned{" "}
          <span className="font-mono text-accent">{error.status}</span>.
        </p>
      </div>
    </AlertBanner>
  );
}
