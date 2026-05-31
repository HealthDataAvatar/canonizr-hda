import { TriangleAlert } from "lucide-react";

function formatDollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function SpendBar({
  usageDollars,
  limitDollars,
}: {
  usageDollars: number;
  limitDollars: number | null;
}) {
  if (limitDollars === null) {
    return <span className="font-mono text-[0.8125rem] text-muted-foreground" title="No spend limit">∞</span>;
  }

  const pct = limitDollars > 0 ? Math.min(100, (usageDollars / limitDollars) * 100) : 0;
  const full = usageDollars >= limitDollars;

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 w-24 rounded-full bg-border"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${formatDollars(usageDollars)} of ${formatDollars(limitDollars)} used`}
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
          {formatDollars(usageDollars)} / {formatDollars(limitDollars)}
        </span>
      )}
    </div>
  );
}
