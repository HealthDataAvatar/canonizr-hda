import { estimateInfraCost, type InfraCostEstimate } from "@/lib/pure/infra-cost";
import { colorForService, type SpanNode } from "@/lib/pure/trace";

interface TraceCostCardProps {
  trace: SpanNode;
  className?: string;
}

export function TraceCostCard({ trace, className }: TraceCostCardProps) {
  const est = estimateInfraCost(trace);

  return (
    <div className={className}>
      <div className="rounded border border-border bg-surface p-4 font-mono text-sm">
        <div className="flex items-baseline gap-4 mb-4">
          <span className="text-muted-foreground">Estimated infra cost</span>
          <span className="text-xl font-semibold">
            ${est.totalCost.toFixed(4)}
          </span>
          <span className="text-muted-foreground ml-auto">
            {formatDuration(est.totalDurationMs)} total
          </span>
        </div>

        {est.breakdown.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="pb-1 font-medium">Service</th>
                <th className="pb-1 font-medium text-right">Duration</th>
                <th className="pb-1 font-medium text-right">Compute</th>
                <th className="pb-1 font-medium text-right">Tokens</th>
                <th className="pb-1 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {est.breakdown.map((b, i) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="py-1 flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ background: colorForService(b.service) }}
                    />
                    {b.service}
                  </td>
                  <td className="py-1 text-right text-muted-foreground">
                    {formatDuration(b.durationMs)}
                  </td>
                  <td className="py-1 text-right">${b.computeCost.toFixed(5)}</td>
                  <td className="py-1 text-right">
                    {b.tokenCost > 0 ? `$${b.tokenCost.toFixed(5)}` : "—"}
                  </td>
                  <td className="py-1 text-right font-medium">
                    ${b.totalCost.toFixed(5)}
                  </td>
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
