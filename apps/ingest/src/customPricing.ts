import { type CustomPrice, modelIdCandidates } from "@watchtower/cost";
import { db } from "@watchtower/db";
import { customPricing } from "@watchtower/db/schema/pricing";
import { eq } from "drizzle-orm";

// Per-project price overrides (Postgres `custom_pricing`). These take precedence
// over OpenRouter pricing at ingest. Loaded per project and cached briefly; a
// project with no overrides caches an empty rule set so the lookup stays cheap.

type Rule = { pattern: string; price: CustomPrice };
type CacheEntry = { rules: Rule[]; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

type PricingRow = typeof customPricing.$inferSelect;

function rowToPrice(row: PricingRow): CustomPrice {
  // numeric columns come back as strings (or null). Only set a dimension when
  // the override is present; unset dimensions fall back to OpenRouter pricing.
  const price: CustomPrice = {};
  if (row.promptPrice != null) price.prompt = row.promptPrice;
  if (row.completionPrice != null) price.completion = row.completionPrice;
  if (row.requestPrice != null) price.request = row.requestPrice;
  if (row.imagePrice != null) price.image = row.imagePrice;
  if (row.webSearchPrice != null) price.webSearch = row.webSearchPrice;
  if (row.internalReasoningPrice != null)
    price.internalReasoning = row.internalReasoningPrice;
  if (row.cacheReadPrice != null) price.cacheRead = row.cacheReadPrice;
  if (row.cacheWritePrice != null) price.cacheWrite = row.cacheWritePrice;
  return price;
}

/** Load (and cache) the override rules for a project. */
export async function getProjectPricing(projectId: string): Promise<Rule[]> {
  const now = Date.now();
  const cached = cache.get(projectId);
  if (cached && cached.expiresAt > now) return cached.rules;

  const rows = await db
    .select()
    .from(customPricing)
    .where(eq(customPricing.projectId, projectId));

  // Exact patterns first so they win over globs of the same model family.
  const rules: Rule[] = rows
    .map((row) => ({ pattern: row.modelPattern.toLowerCase(), price: rowToPrice(row) }))
    .sort((a, b) => Number(a.pattern.includes("*")) - Number(b.pattern.includes("*")));

  cache.set(projectId, { rules, expiresAt: now + TTL_MS });
  return rules;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Find the override for a span's model. Patterns are matched against the same
 * normalized candidates the OpenRouter resolver uses, plus the raw model id, so
 * an override can be authored as `openai/gpt-4o`, `gpt-4o`, or `gpt-4*`.
 */
export function matchCustomPrice(
  rules: Rule[],
  provider: string | undefined,
  modelId: string | undefined,
): CustomPrice | undefined {
  if (rules.length === 0) return undefined;
  const targets = modelIdCandidates(provider, modelId);
  if (modelId) targets.push(modelId.trim().toLowerCase());
  if (targets.length === 0) return undefined;

  for (const rule of rules) {
    const re = globToRegExp(rule.pattern);
    if (targets.some((t) => re.test(t))) return rule.price;
  }
  return undefined;
}
