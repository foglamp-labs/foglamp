import { readFile } from "node:fs/promises";

import {
  COST_DIMENSIONS,
  OPENROUTER_PRICE_KEYS,
  type CostDimension,
  type ModelPrice,
  type PricingSource,
} from "./dimensions";
import { modelIdCandidates } from "./normalize";

export type PricingTable = Map<string, ModelPrice>;

// A subset of dimensions (per-token strings) overriding the resolved price.
export type CustomPrice = Partial<ModelPrice>;

const REFRESH_MS = 24 * 60 * 60 * 1000;

let cache: { table: PricingTable; fetchedAt: number } | null = null;
let inflight: Promise<PricingTable> | null = null;

function emptyPrice(): ModelPrice {
  return {
    prompt: null,
    completion: null,
    request: null,
    image: null,
    webSearch: null,
    internalReasoning: null,
    cacheRead: null,
    cacheWrite: null,
  };
}

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/** Build a pricing table from a raw OpenRouter `/models` response object. */
export function parsePricingResponse(body: unknown): PricingTable {
  const table: PricingTable = new Map();
  const models = Array.isArray(body)
    ? body
    : ((body as { data?: unknown[] })?.data ?? []);
  if (!Array.isArray(models)) return table;

  for (const model of models) {
    if (!model || typeof model !== "object") continue;
    const m = model as { id?: unknown; canonical_slug?: unknown; pricing?: unknown };
    const pricing = m.pricing;
    if (!pricing || typeof pricing !== "object") continue;

    const price = emptyPrice();
    for (const [rawKey, dim] of Object.entries(OPENROUTER_PRICE_KEYS)) {
      const value = (pricing as Record<string, unknown>)[rawKey];
      if (typeof value === "string" && DECIMAL_RE.test(value.trim())) {
        price[dim] = value.trim();
      }
    }

    for (const key of [m.id, m.canonical_slug]) {
      if (typeof key === "string" && key) table.set(key.toLowerCase(), price);
    }
  }
  return table;
}

async function loadPricing(): Promise<PricingTable> {
  // Imported lazily so the pure pricing/cost helpers stay importable without
  // a validated server env (e.g. in unit tests).
  const { env } = await import("@watchtower/env/server");
  if (env.WATCHTOWER_PRICING_FILE) {
    const raw = await readFile(env.WATCHTOWER_PRICING_FILE, "utf8");
    return parsePricingResponse(JSON.parse(raw));
  }
  const res = await fetch(env.OPENROUTER_MODELS_URL, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`OpenRouter pricing fetch failed: ${res.status}`);
  return parsePricingResponse(await res.json());
}

/**
 * Returns the cached pricing table, refreshing in the background once stale.
 * Never throws: on a cold-start failure it returns an empty table (so ingest
 * keeps accepting spans with null cost) and retries on the next call.
 */
export async function getPricingTable(): Promise<PricingTable> {
  const fresh = cache && Date.now() - cache.fetchedAt < REFRESH_MS;
  if (cache && fresh) return cache.table;

  if (cache) {
    // Stale: refresh in the background, serve stale immediately.
    void refresh();
    return cache.table;
  }
  return refresh();
}

function refresh(): Promise<PricingTable> {
  if (inflight) return inflight;
  inflight = loadPricing()
    .then((table) => {
      cache = { table, fetchedAt: Date.now() };
      return table;
    })
    .catch((err) => {
      console.warn("[watchtower/cost] pricing refresh failed:", err);
      return cache?.table ?? new Map<string, ModelPrice>();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Test/seed hook: install a pricing table directly, bypassing the network. */
export function setPricingTable(table: PricingTable): void {
  cache = { table, fetchedAt: Date.now() };
}

/**
 * Resolve the effective per-dimension price for a model. Custom (per-project)
 * dimensions take precedence over OpenRouter; unset custom dimensions fall back.
 * Returns null only when the model is unknown to *both* sources (→ null cost,
 * never $0).
 */
export function resolveModelPrice(
  table: PricingTable,
  provider: string | undefined,
  modelId: string | undefined,
  custom?: CustomPrice,
): { price: ModelPrice; source: PricingSource; resolvedId: string } | null {
  let base: ModelPrice | undefined;
  let resolvedId = "";
  for (const candidate of modelIdCandidates(provider, modelId)) {
    const hit = table.get(candidate);
    if (hit) {
      base = hit;
      resolvedId = candidate;
      break;
    }
  }

  const hasCustom = !!custom && COST_DIMENSIONS.some((d) => custom[d] != null);
  if (!base && !hasCustom) return null;

  const price = base ? { ...base } : emptyPrice();
  if (hasCustom && custom) {
    for (const dim of COST_DIMENSIONS) {
      const override = custom[dim];
      if (override != null) (price as Record<CostDimension, string | null>)[dim] = override;
    }
  }

  const source: PricingSource = base && hasCustom ? "mixed" : base ? "openrouter" : "custom";
  return { price, source, resolvedId };
}
