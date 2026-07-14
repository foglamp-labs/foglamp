// Maps an AI SDK (provider, modelId) pair onto OpenRouter model id candidates
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
  meta: "meta-llama",
  amazon: "amazon",
  // Bedrock creator namespaces whose OpenRouter slug differs.
  moonshot: "moonshotai",
  zai: "z-ai",
  groq: "",
  togetherai: "",
  fireworks: "",
  openrouter: "",
  // Bedrock model ids embed their creator ("us.anthropic.claude-…") and are
  // resolved by bedrockCandidates(); a bedrock id that doesn't parse stays
  // unresolved rather than producing a bogus "amazon-bedrock/…" candidate.
  "amazon-bedrock": "",
  bedrock: "",
};

// Curated overrides keyed by a normalized candidate or raw "vendor/model".
// Add entries here when a provider's model id can't be derived mechanically.
const ALIAS_MAP: Record<string, string> = {
  // Bedrock's "us.deepseek.r1-v1:0" → OpenRouter's doubled-vendor id.
  "deepseek/r1": "deepseek/deepseek-r1",
};

// Trailing version markers OpenRouter usually omits from its canonical id.
const VERSION_SUFFIX_RE =
  /-(?:\d{4}-\d{2}-\d{2}|\d{8}|\d{6}|latest|preview|exp)$/;

// Bedrock model id: optional inference-profile region prefix ("us.", "eu.",
// "apac.", "global.", …), the model's creator, then the model name carrying an
// ARN-style version suffix — e.g. "us.anthropic.claude-haiku-4-5-20251001-v1:0".
const BEDROCK_ID_RE =
  /^(?:[a-z]{2,6}(?:-gov)?\.)?(anthropic|amazon|meta|mistral|cohere|ai21|deepseek|writer|openai|qwen|luma|stability|twelvelabs|minimax|google|moonshotai|moonshot|nvidia|xai|zai)\.(.+)$/;

function pushCandidate(out: string[], vendor: string, model: string): void {
  if (!vendor || !model) return;
  const id = `${vendor}/${model}`;
  const aliased = ALIAS_MAP[id] ?? id;
  if (!out.includes(aliased)) out.push(aliased);
}

// Expand one vendor/model pair into ordered lookup candidates: exact first,
// then date-stripped, then — for Anthropic and xAI — the dotted version
// OpenRouter uses (the Anthropic API says "claude-haiku-4-5", OpenRouter
// "claude-haiku-4.5"; Bedrock says "grok-4-3", OpenRouter "grok-4.3").
function expandModel(out: string[], vendor: string, model: string): void {
  pushCandidate(out, vendor, model);
  const dateless = model.replace(VERSION_SUFFIX_RE, "");
  pushCandidate(out, vendor, dateless);
  if (vendor === "anthropic" || vendor === "x-ai") {
    pushCandidate(out, vendor, dateless.replace(/(\d)-(\d)/g, "$1.$2"));
  }
}

function bedrockCandidates(out: string[], raw: string): void {
  const match = BEDROCK_ID_RE.exec(raw);
  if (!match) return;
  const creator = match[1]!;
  const vendor = creator in VENDOR_MAP ? VENDOR_MAP[creator]! : creator;
  // Drop the ":0" revision everywhere; try the model both with its version
  // segment (Amazon's own ids keep "-v1" on OpenRouter, e.g. amazon/nova-pro-v1)
  // and without it (Anthropic's don't; OpenAI's gpt-oss ids use a bare "-1").
  const base = match[2]!.replace(/:\d+$/, "");
  expandModel(out, vendor, base);
  const versionless = base.replace(/-v?\d+$/, "");
  if (versionless !== base) expandModel(out, vendor, versionless);
}

/** Produce the primary OpenRouter id candidate. Empty string if unmappable. */
export function normalizeModelId(
  provider: string | undefined,
  modelId: string | undefined,
): string {
  return modelIdCandidates(provider, modelId)[0] ?? "";
}

/**
 * Ordered list of OpenRouter ids to try for a (provider, modelId). Callers
 * look each up in the pricing table and use the first hit.
 */
export function modelIdCandidates(
  provider: string | undefined,
  modelId: string | undefined,
): string[] {
  const raw = (modelId ?? "").trim().toLowerCase();
  if (!raw) return [];
  const out: string[] = [];

  // Already in "vendor/model" form (gateways, OpenRouter itself).
  const slash = raw.indexOf("/");
  if (slash !== -1) {
    expandModel(out, raw.slice(0, slash), raw.slice(slash + 1));
    return out;
  }

  const prov = (provider ?? "").split(".")[0]?.toLowerCase() ?? "";
  if (prov === "amazon-bedrock" || prov === "bedrock" || BEDROCK_ID_RE.test(raw)) {
    bedrockCandidates(out, raw);
    return out;
  }

  const vendor = prov in VENDOR_MAP ? VENDOR_MAP[prov] : prov;
  if (!vendor) return []; // unmappable vendor → leave unresolved
  expandModel(out, vendor, raw);
  return out;
}
