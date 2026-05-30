import { TriangleAlert } from "lucide-react";
import { formatKB } from "@/lib/pure/format";

export function UsageBar({
  usageKB,
  quotaKB,
}: {
  usageKB: number;
  quotaKB: number | null;
}) {
  if (quotaKB === null) {
    return <span className="font-mono text-[0.8125rem] text-muted-foreground" title="No quota limit">∞</span>;
  }

  const pct = Math.min(100, (usageKB / quotaKB) * 100);
  const full = usageKB >= quotaKB;

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 w-24 rounded-full bg-border"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${formatKB(usageKB)} of ${formatKB(quotaKB)} used`}
      >
        <div
          className={`h-full rounded-full ${full ? "bg-destructive" : "bg-foreground"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {full ? (
        <span className="inline-flex items-center gap-1.5 font-mono text-[0.8125rem] text-destructive font-semibold">
          <TriangleAlert className="size-3.5 shrink-0" />
          Limit reached
        </span>
      ) : (
        <span className="font-mono text-[0.8125rem] text-muted-foreground">
          {formatKB(usageKB)} / {formatKB(quotaKB)}
        </span>
      )}
    </div>
  );
}
