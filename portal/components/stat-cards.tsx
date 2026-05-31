import { MetricCard } from "@/components/metric-card";
import { formatKB } from "@/lib/pure/format";

export interface StatCardsProps {
  processedKB: number;
  freeRemainingKB: number | null;
  freeTotalKB: number | null;
  estimatedCost: number;
}

export function StatCards({
  processedKB,
  freeRemainingKB,
  freeTotalKB,
  estimatedCost,
}: StatCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard
        label="Processed this period"
        value={formatKB(processedKB)}
      />
      <MetricCard
        label="Free tier remaining"
        value={
          freeRemainingKB !== null
            ? `${formatKB(freeRemainingKB)} / ${formatKB(freeTotalKB!)}`
            : "Unlimited"
        }
      />
      <MetricCard
        label="Estimated cost"
        value={`$${estimatedCost.toFixed(2)}`}
      />
    </div>
  );
}
