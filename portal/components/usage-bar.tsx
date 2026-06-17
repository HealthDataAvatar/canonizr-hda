import { formatKB } from "@/lib/pure/format";

export function UsageBar({
  usageKB,
  quotaKB,
}: {
  usageKB: number;
  quotaKB: number | null;
}) {
  const pct = quotaKB === null ? 0 : Math.min(100, (usageKB / quotaKB) * 100);
  const full = quotaKB !== null && usageKB >= quotaKB;
  const quotaLabel = quotaKB === null ? "∞" : formatKB(quotaKB);

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 w-24 rounded-full bg-border"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${formatKB(usageKB)} of ${quotaKB === null ? "no limit" : formatKB(quotaKB)}`}
      >
        <div
          className={`h-full rounded-full ${full ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono text-sm ${full ? "text-destructive" : "text-muted-foreground"}`}>
        {formatKB(usageKB)} / {quotaLabel}
      </span>
    </div>
  );
}
