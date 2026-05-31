import { formatKB } from "@/lib/pure/format";

export function UsageBar({
  usageKB,
  quotaKB,
}: {
  usageKB: number;
  quotaKB: number | null;
}) {
  if (quotaKB === null) {
    quotaKB = Number.MAX_VALUE
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
        aria-label={`${formatKB(usageKB)} of ${formatKB(quotaKB)}`}
      >
        <div
          className={`h-full rounded-full ${full ? "bg-destructive" : "bg-foreground"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono text-[0.8125rem] ${full ? "text-destructive" : "text-muted-foreground"}`}>
        {formatKB(usageKB)} / {formatKB(quotaKB)}
      </span>
    </div>
  );
}
