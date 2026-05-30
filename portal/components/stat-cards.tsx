import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
            Processed this period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-3xl font-semibold">
            {formatKB(processedKB)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
            Free tier remaining
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-3xl font-semibold">
            {freeRemainingKB !== null
              ? `${formatKB(freeRemainingKB)} / ${formatKB(freeTotalKB!)}`
              : "Unlimited"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[0.8125rem] font-medium text-muted-foreground">
            Estimated cost
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-3xl font-semibold">
            ${estimatedCost.toFixed(2)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
