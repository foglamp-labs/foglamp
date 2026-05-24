// The eight cost dimensions Watchtower prices, mirrored across the OpenRouter
// pricing payload, the Postgres custom_pricing override, and the ClickHouse
// cost columns. (OpenRouter's `audio` dimension is intentionally out of scope —
// the wire usage contract carries no audio token counts.)

export const COST_DIMENSIONS = [
  "prompt",
  "completion",
  "request",
  "image",
  "webSearch",
  "internalReasoning",
  "cacheRead",
  "cacheWrite",
] as const;

export type CostDimension = (typeof COST_DIMENSIONS)[number];

/** Per-token (or per-unit) price for each dimension; null = unknown/unpriced. */
export type ModelPrice = Record<CostDimension, string | null>;

/** Maps OpenRouter pricing keys → our dimension names. */
export const OPENROUTER_PRICE_KEYS: Record<string, CostDimension> = {
  prompt: "prompt",
  completion: "completion",
  request: "request",
  image: "image",
  web_search: "webSearch",
  internal_reasoning: "internalReasoning",
  input_cache_read: "cacheRead",
  input_cache_write: "cacheWrite",
};

export type PricingSource = "openrouter" | "custom" | "mixed";

/** Computed cost per dimension + total, as Decimal(.,10) strings or null. */
export type CostBreakdown = {
  promptCost: string | null;
  completionCost: string | null;
  requestCost: string | null;
  imageCost: string | null;
  webSearchCost: string | null;
  internalReasoningCost: string | null;
  cacheReadCost: string | null;
  cacheWriteCost: string | null;
  totalCost: string | null;
};

export const EMPTY_BREAKDOWN: CostBreakdown = {
  promptCost: null,
  completionCost: null,
  requestCost: null,
  imageCost: null,
  webSearchCost: null,
  internalReasoningCost: null,
  cacheReadCost: null,
  cacheWriteCost: null,
  totalCost: null,
};
