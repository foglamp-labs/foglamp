import { parsePricingResponse, priceSpan, type PricingTable } from "@foglamp/cost";

import type { Span } from "../wire";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

let table: PricingTable | null = null;
let warming = false;

/** Test seed: install a table so warmPricing() short-circuits (no network). */
export function seedPricingTable(t: PricingTable | null): void {
  table = t;
}

/** Kick off (once) the background fetch of the OpenRouter pricing table. */
export function warmPricing(): void {
  if (table || warming) return;
  warming = true;
  fetch(OPENROUTER_MODELS_URL, { headers: { accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`pricing ${res.status}`))))
    .then((body) => {
      table = parsePricingResponse(body);
    })
    .catch(() => {
      // Offline / fetch failed — cost stays "—". Retried on the next warm.
    })
    .finally(() => {
      warming = false;
    });
}

/**
 * Sum a trace's priced span costs (USD). Returns null when the table hasn't
 * loaded yet or no span could be priced (unknown model) — so the HUD shows "—"
 * rather than understating the spend.
 */
export function priceTraceUsd(spans: Span[]): number | null {
  if (!table) return null;
  let total = 0;
  let priced = false;
  for (const span of spans) {
    if (span.spanType !== "llm" && span.spanType !== "embedding") continue;
    const { costs } = priceSpan({
      table,
      provider: span.provider,
      modelId: span.modelId,
      usage: span.usage,
    });
    if (costs.totalCost == null) continue;
    const n = Number(costs.totalCost);
    if (Number.isFinite(n)) {
      total += n;
      priced = true;
    }
  }
  return priced ? total : null;
}
