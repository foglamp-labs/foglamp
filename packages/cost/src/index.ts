// @watchtower/cost — OpenRouter pricing fetch/cache, model-id normalization,
// and exact per-dimension cost calculation. Pure & side-effect-free except for
// the in-memory pricing cache in pricing.ts.

import type { Usage } from "@watchtower/contracts";

import { computeCost } from "./compute";
import type { CostBreakdown, PricingSource } from "./dimensions";
import {
  type CustomPrice,
  type PricingTable,
  resolveModelPrice,
} from "./pricing";

export * from "./dimensions";
export * from "./decimal";
export * from "./normalize";
export * from "./pricing";
export * from "./compute";

export type PricedSpan = {
  costs: CostBreakdown;
  /** Null when the model could not be resolved against any pricing source. */
  source: PricingSource | null;
  /** The OpenRouter id the price was resolved from (empty if unresolved). */
  resolvedId: string;
};

/**
 * One-shot pricing for an ingest span: resolve the model price (custom over
 * OpenRouter) and compute the cost breakdown. An unresolved model yields an
 * all-null breakdown with `source: null`.
 */
export function priceSpan(args: {
  table: PricingTable;
  provider: string | undefined;
  modelId: string | undefined;
  usage: Usage | undefined;
  custom?: CustomPrice;
}): PricedSpan {
  const resolved = resolveModelPrice(
    args.table,
    args.provider,
    args.modelId,
    args.custom,
  );
  return {
    costs: computeCost(args.usage, resolved?.price ?? null),
    source: resolved?.source ?? null,
    resolvedId: resolved?.resolvedId ?? "",
  };
}
