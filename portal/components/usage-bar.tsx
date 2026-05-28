import { TriangleAlert } from "lucide-react";

function formatKB(kb: number): string {
  if (kb >= 1000) return `${(kb / 1000).toFixed(0)} MB`;
  return `${kb} KB`;
}

export function UsageBar({
  usageKB,
  quotaKB,
}: {
  usageKB: number;
  quotaKB: number | null;
}) {
  if (quotaKB === null) {
    return <span className="font-mono text-[0.8125rem] text-muted-foreground">∞</span>;
  }

  const pct = Math.min(100, (usageKB / quotaKB) * 100);
  const full = usageKB >= quotaKB;

  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-24 rounded-full bg-border">
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
