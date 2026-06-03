/**
 * Estimate infrastructure costs for a job trace.
 * These are OUR costs, not what we charge the user.
 */

import type { SpanNode } from "./trace";

// ---------------------------------------------------------------------------
// Cost constants (Azure pricing, approximate)
// ---------------------------------------------------------------------------

/** Container Apps: cost per vCPU-second. */
const VCPU_SECOND_COST = 0.000024;

/** Per-service vCPU allocations. */
const SERVICE_VCPUS: Record<string, number> = {
  docling: 2,
  gotenberg: 1,
  captioning: 0.25,
  markitdown: 0.5,
  passthrough: 0.25,
  extract_pages: 0.5,
  libreoffice: 1,
};

/** Azure OpenAI GPT-4o pricing per 1K tokens. */
const PROMPT_TOKEN_COST_PER_1K = 0.005;
const COMPLETION_TOKEN_COST_PER_1K = 0.015;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostBreakdown {
  service: string;
  computeCost: number;
  tokenCost: number;
  durationMs: number;
  totalCost: number;
}

export interface InfraCostEstimate {
  totalCost: number;
  totalDurationMs: number;
  breakdown: CostBreakdown[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRetries: number;
  totalRetryDelayMs: number;
}

// ---------------------------------------------------------------------------
// Estimation
// ---------------------------------------------------------------------------

export function estimateInfraCost(root: SpanNode): InfraCostEstimate {
  const breakdown: CostBreakdown[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalRetries = 0;
  let totalRetryDelayMs = 0;

  function walk(node: SpanNode) {
    const vcpus = SERVICE_VCPUS[node.name];
    if (vcpus !== undefined) {
      const durationMs = node.duration_ms ?? 0;
      const durationS = durationMs / 1000;
      const computeCost = durationS * vcpus * VCPU_SECOND_COST;

      const attrs = node.attributes ?? {};
      const promptTokens = Number(attrs.prompt_tokens ?? 0);
      const completionTokens = Number(attrs.completion_tokens ?? 0);
      const tokenCost =
        (promptTokens / 1000) * PROMPT_TOKEN_COST_PER_1K +
        (completionTokens / 1000) * COMPLETION_TOKEN_COST_PER_1K;

      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;
      totalRetries += Number(attrs.total_retries ?? 0);
      totalRetryDelayMs += Number(attrs.total_retry_delay_ms ?? 0);

      breakdown.push({
        service: node.name,
        computeCost,
        tokenCost,
        durationMs,
        totalCost: computeCost + tokenCost,
      });
    }

    node.children?.forEach(walk);
  }

  walk(root);

  const totalCost = breakdown.reduce((sum, b) => sum + b.totalCost, 0);
  const totalDurationMs = root.duration_ms ?? 0;

  return {
    totalCost,
    totalDurationMs,
    breakdown,
    totalPromptTokens,
    totalCompletionTokens,
    totalRetries,
    totalRetryDelayMs,
  };
}
