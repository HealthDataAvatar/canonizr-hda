/**
 * Estimate infrastructure costs for a job trace.
 * These are OUR costs, not what we charge the user.
 */

import type { SpanNode } from "./trace";

// ---------------------------------------------------------------------------
// Cost constants (Azure pricing, approximate)
// ---------------------------------------------------------------------------

/** Worker Container App: 2 vCPU, cost per vCPU-second. */
const WORKER_VCPUS = 2;
const VCPU_SECOND_COST = 0.000024;

/** Gotenberg Container App: 1 vCPU. Separate container, billed independently. */
const GOTENBERG_VCPUS = 1;

/** Docling Container App: 2 vCPU. Separate container, billed independently. */
const DOCLING_VCPUS = 2;

/** Services that run inside the worker (no separate compute cost). */
const WORKER_INTERNAL_SERVICES = new Set([
  "captioning", "markitdown", "passthrough", "extract_pages", "libreoffice",
]);

/** Services with their own dedicated containers. */
const EXTERNAL_SERVICE_VCPUS: Record<string, number> = {
  docling: DOCLING_VCPUS,
  gotenberg: GOTENBERG_VCPUS,
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

  // Worker compute: the entire root duration, since the worker container
  // is running for the full job regardless of which service is active.
  const workerDurationMs = root.duration_ms ?? 0;
  const workerComputeCost = (workerDurationMs / 1000) * WORKER_VCPUS * VCPU_SECOND_COST;
  breakdown.push({
    service: "worker",
    computeCost: workerComputeCost,
    tokenCost: 0,
    durationMs: workerDurationMs,
    totalCost: workerComputeCost,
  });

  // Walk the tree for external service compute + token costs
  function walk(node: SpanNode) {
    const attrs = node.attributes ?? {};

    // External services with their own containers
    const externalVcpus = EXTERNAL_SERVICE_VCPUS[node.name];
    if (externalVcpus !== undefined) {
      const durationMs = node.duration_ms ?? 0;
      const computeCost = (durationMs / 1000) * externalVcpus * VCPU_SECOND_COST;
      breakdown.push({
        service: node.name,
        computeCost,
        tokenCost: 0,
        durationMs,
        totalCost: computeCost,
      });
    }

    // Token costs (captioning calls Azure OpenAI)
    const promptTokens = Number(attrs.prompt_tokens ?? 0);
    const completionTokens = Number(attrs.completion_tokens ?? 0);
    if (promptTokens > 0 || completionTokens > 0) {
      const tokenCost =
        (promptTokens / 1000) * PROMPT_TOKEN_COST_PER_1K +
        (completionTokens / 1000) * COMPLETION_TOKEN_COST_PER_1K;
      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;

      // Only add a separate captioning row if it's not already an external service
      if (WORKER_INTERNAL_SERVICES.has(node.name)) {
        breakdown.push({
          service: `${node.name} (tokens)`,
          computeCost: 0,
          tokenCost,
          durationMs: node.duration_ms ?? 0,
          totalCost: tokenCost,
        });
      }
    }

    // Retries
    totalRetries += Number(attrs.total_retries ?? 0);
    totalRetryDelayMs += Number(attrs.total_retry_delay_ms ?? 0);

    node.children?.forEach(walk);
  }

  walk(root);

  const totalCost = breakdown.reduce((sum, b) => sum + b.totalCost, 0);

  return {
    totalCost,
    totalDurationMs: workerDurationMs,
    breakdown,
    totalPromptTokens,
    totalCompletionTokens,
    totalRetries,
    totalRetryDelayMs,
  };
}
