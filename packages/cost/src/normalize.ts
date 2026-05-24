// Maps an AI SDK (provider, modelId) pair onto an OpenRouter model id
// ("vendor/model"). This is heuristic by nature — a miss simply leaves cost
// null, surfaced in the UI — so the maps below are conservative and meant to be
// community-contributable.

// AI SDK provider id (prefix before the first ".") → OpenRouter vendor slug.
// An empty value means "no reliable vendor mapping" (e.g. inference resellers
// that serve many creators' models); we leave such ids unresolved.
const VENDOR_MAP: Record<string, string> = {
  openai: "openai",
  azure: "openai",
  anthropic: "anthropic",
  google: "google",
  "google-vertex": "google",
  "google-generative-ai": "google",
  vertex: "google",
  mistral: "mistralai",
  xai: "x-ai",
  deepseek: "deepseek",
  cohere: "cohere",
  perplexity: "perplexity",
  groq: "",
  togetherai: "",
  fireworks: "",
  openrouter: "",
};

// Curated overrides keyed by a normalized candidate or raw "vendor/model".
// Add entries here when a provider's model id can't be derived mechanically.
const ALIAS_MAP: Record<string, string> = {};

// Trailing version markers OpenRouter usually omits from its canonical id.
const VERSION_SUFFIX_RE =
  /-(?:\d{4}-\d{2}-\d{2}|\d{8}|\d{6}|latest|preview|exp)$/;

/** Produce the primary OpenRouter id candidate. Empty string if unmappable. */
export function normalizeModelId(
  provider: string | undefined,
  modelId: string | undefined,
): string {
  const raw = (modelId ?? "").trim().toLowerCase();
  if (!raw) return "";
  // Already in "vendor/model" form.
  if (raw.includes("/")) return ALIAS_MAP[raw] ?? raw;

  const prov = (provider ?? "").split(".")[0]?.toLowerCase() ?? "";
  const vendor = prov in VENDOR_MAP ? VENDOR_MAP[prov] : prov;
  if (!vendor) return ""; // unmappable vendor → leave unresolved
  const candidate = `${vendor}/${raw}`;
  return ALIAS_MAP[candidate] ?? candidate;
}

/**
 * Ordered list of OpenRouter ids to try for a (provider, modelId): the exact
 * candidate first, then a version-suffix-stripped fallback. Callers look each
 * up in the pricing table and use the first hit.
 */
export function modelIdCandidates(
  provider: string | undefined,
  modelId: string | undefined,
): string[] {
  const primary = normalizeModelId(provider, modelId);
  if (!primary) return [];
  const candidates = [primary];
  const stripped = primary.replace(VERSION_SUFFIX_RE, "");
  if (stripped !== primary) candidates.push(ALIAS_MAP[stripped] ?? stripped);
  return candidates;
}
