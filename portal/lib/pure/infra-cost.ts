/**
 * Estimate infrastructure costs for a job trace.
 * These are OUR costs, not what we charge the user.
 */

import type { SpanNode } from "./trace";

// ---------------------------------------------------------------------------
// Cost constants (Azure pricing, approximate)
// ---------------------------------------------------------------------------

/** Cost per vCPU-second (Azure Container Apps consumption). */
const VCPU_SECOND_COST = 0.000024;

/** Services with their own dedicated containers and vCPU allocations. */
const EXTERNAL_SERVICE_VCPUS: Record<string, number> = {
  docling: 2,
  gotenberg: 1,
};

/** Worker Container App: 2 vCPU. */
const WORKER_VCPUS = 2;

/** Services that run inside the worker (no separate compute cost). */
const WORKER_INTERNAL_SERVICES = new Set([
  "captioning", "markitdown", "passthrough", "extract_pages", "libreoffice", "normalise_image",
]);

/** Azure Communication Services email: $0.00025/email. */
const EMAIL_COST_PER_SEND = 0.00025;

/** Per-1K-token pricing by model. Input/output per 1M → divide by 1000 for per-1K. */
const MODEL_TOKEN_PRICING: Record<string, { prompt: number; completion: number }> = {
  "gpt-5.4-nano": { prompt: 0.0002, completion: 0.00125 },   // $0.20 / $1.25 per 1M
  "gpt-4o":       { prompt: 0.005,  completion: 0.015 },      // $5.00 / $15.00 per 1M
};
const DEFAULT_MODEL = "gpt-5.4-nano";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostLineItem {
  service: string;
  item: string;
  quantity: string;
  cost: number;
}

export interface InfraCostEstimate {
  totalCost: number;
  totalDurationMs: number;
  items: CostLineItem[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRetries: number;
  totalRetryDelayMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

// ---------------------------------------------------------------------------
// Estimation
// ---------------------------------------------------------------------------

export function estimateInfraCost(root: SpanNode): InfraCostEstimate {
  const items: CostLineItem[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalRetries = 0;
  let totalRetryDelayMs = 0;

  // Worker compute: the entire root duration
  const workerDurationMs = root.duration_ms ?? 0;
  const workerCost = (workerDurationMs / 1000) * WORKER_VCPUS * VCPU_SECOND_COST;
  items.push({
    service: "worker",
    item: `compute (${WORKER_VCPUS} vCPU)`,
    quantity: fmtDuration(workerDurationMs),
    cost: workerCost,
  });

  function walk(node: SpanNode) {
    const attrs = node.attributes ?? {};

    // External services with their own containers
    const externalVcpus = EXTERNAL_SERVICE_VCPUS[node.name];
    if (externalVcpus !== undefined) {
      const durationMs = node.duration_ms ?? 0;
      const computeCost = (durationMs / 1000) * externalVcpus * VCPU_SECOND_COST;
      items.push({
        service: node.name,
        item: `compute (${externalVcpus} vCPU)`,
        quantity: fmtDuration(durationMs),
        cost: computeCost,
      });
      items.push({
        service: node.name,
        item: `cold start (${externalVcpus} vCPU)`,
        quantity: "150s amortized",
        cost: 150 * externalVcpus * VCPU_SECOND_COST,
      });
    }

    // Token costs (captioning calls Azure OpenAI)
    const promptTokens = Number(attrs.prompt_tokens ?? 0);
    const completionTokens = Number(attrs.completion_tokens ?? 0);
    if (promptTokens > 0 || completionTokens > 0) {
      const model = String(attrs.model ?? DEFAULT_MODEL);
      const pricing = MODEL_TOKEN_PRICING[model] ?? MODEL_TOKEN_PRICING[DEFAULT_MODEL];
      const tokenCost =
        (promptTokens / 1000) * pricing.prompt +
        (completionTokens / 1000) * pricing.completion;
      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;

      if (WORKER_INTERNAL_SERVICES.has(node.name)) {
        items.push({
          service: node.name,
          item: `${model} tokens`,
          quantity: `${promptTokens} + ${completionTokens}`,
          cost: tokenCost,
        });
      }
    }

    // Retries
    totalRetries += Number(attrs.total_retries ?? 0);
    totalRetryDelayMs += Number(attrs.total_retry_delay_ms ?? 0);

    node.children?.forEach(walk);
  }

  walk(root);

  // Email authentication (one confirmation email per job)
  items.push({
    service: "email",
    item: "authentication send",
    quantity: "1",
    cost: EMAIL_COST_PER_SEND,
  });

  const totalCost = items.reduce((sum, i) => sum + i.cost, 0);

  return {
    totalCost,
    totalDurationMs: workerDurationMs,
    items,
    totalPromptTokens,
    totalCompletionTokens,
    totalRetries,
    totalRetryDelayMs,
  };
}
