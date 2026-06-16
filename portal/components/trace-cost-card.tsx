import { estimateInfraCost } from "@/lib/pure/infra-cost";
import { colorForService, type SpanNode } from "@/lib/pure/trace";
import { toBillableKB } from "@/lib/pure/format";

const KB_PER_UNIT = 100;

interface TraceCostCardProps {
  trace: SpanNode;
  pricePerUnit: number;
  className?: string;
}

export function TraceCostCard({ trace, pricePerUnit, className }: TraceCostCardProps) {
  const est = estimateInfraCost(trace);
  const inputBytes = Number(trace.attributes?.file_size_bytes ?? 0);
  const billableKB = toBillableKB(inputBytes);
  const units = billableKB / KB_PER_UNIT;
  const revenue = units * pricePerUnit;
  const margin = revenue > 0 ? ((revenue - est.totalCost) / revenue) * 100 : 0;

  return (
    <div className={className}>
      <div className="rounded border border-border bg-muted p-4 font-mono text-sm">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-4">
          <div>
            <span className="text-muted-foreground">Infra cost </span>
            <span className="text-xl font-semibold">${est.totalCost.toFixed(4)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Revenue </span>
            <span className="text-xl font-semibold">${revenue.toFixed(4)}</span>
            {inputBytes > 0 && (
              <span className="text-xs text-muted-foreground ml-1.5">
                ({units} units)
              </span>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Margin </span>
            <span className={`text-xl font-semibold ${margin < 0 ? "text-destructive" : ""}`}>
              {margin.toFixed(1)}%
            </span>
          </div>
          <span className="text-muted-foreground ml-auto">
            {formatDuration(est.totalDurationMs)} total
          </span>
        </div>

        {est.items.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="pb-1 font-medium">Service</th>
                <th className="pb-1 font-medium">Item</th>
                <th className="pb-1 font-medium text-right">Quantity</th>
                <th className="pb-1 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {est.items.map((item, i) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="py-1 flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ background: colorForService(item.service) }}
                    />
                    {item.service}
                  </td>
                  <td className="py-1 text-muted-foreground">{item.item}</td>
                  <td className="py-1 text-right text-muted-foreground">{item.quantity}</td>
                  <td className="py-1 text-right font-medium">${item.cost.toFixed(5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(est.totalPromptTokens > 0 || est.totalRetries > 0) && (
          <div className="mt-3 flex gap-6 text-xs text-muted-foreground border-t border-border pt-2">
            {est.totalPromptTokens > 0 && (
              <span>
                {est.totalPromptTokens.toLocaleString()} prompt +{" "}
                {est.totalCompletionTokens.toLocaleString()} completion tokens
              </span>
            )}
            {est.totalRetries > 0 && (
              <span>
                {est.totalRetries} retries ({formatDuration(est.totalRetryDelayMs)}{" "}
                delay)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}
