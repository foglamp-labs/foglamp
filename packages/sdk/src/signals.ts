import { serialize } from "./serialize";

type Dict = Record<string, unknown>;

function asDict(v: unknown): Dict | undefined {
  return v && typeof v === "object" ? (v as Dict) : undefined;
}

function providerMetadata(step: Dict): Dict | undefined {
  return asDict(step.providerMetadata) ?? asDict(step.experimental_providerMetadata);
}

// --- system fingerprint -----------------------------------------------------

// OpenAI exposes `system_fingerprint` under providerMetadata.openai (the AI SDK
// camelCases some keys, so accept both). A short, non-sensitive build id.
export function extractSystemFingerprint(step: unknown): string | undefined {
  const s = asDict(step);
  if (!s) return undefined;
  const pm = providerMetadata(s);
  if (!pm) return undefined;
  for (const key of ["openai", "azure", "xai"]) {
    const p = asDict(pm[key]);
    const fp = p?.systemFingerprint ?? p?.system_fingerprint;
    if (typeof fp === "string" && fp.length > 0) return fp.slice(0, 256);
  }
  return undefined;
}

// --- safety ratings ---------------------------------------------------------

// Google reports `safetyRatings` (category + probability) under
// providerMetadata.google. Capture the raw array verbatim as JSON — it carries
// no user content, just category labels and scores.
export function extractSafetyMetadata(step: unknown, maxChars: number): string | undefined {
  const s = asDict(step);
  if (!s) return undefined;
  const pm = providerMetadata(s);
  if (!pm) return undefined;
  const out: Dict = {};
  for (const key of ["google", "vertex", "anthropic", "bedrock"]) {
    const p = asDict(pm[key]);
    const ratings = p?.safetyRatings ?? p?.safety_ratings;
    if (Array.isArray(ratings) && ratings.length > 0) out[key] = ratings;
  }
  if (Object.keys(out).length === 0) return undefined;
  return serialize(out, maxChars);
}

// --- sources (RAG / grounding citations) ------------------------------------

// `StepResult.sources` is an array of url/document references the model
// grounded on. Output-capture gated by the caller. Serialized verbatim.
export function extractSources(step: unknown, maxChars: number): string | undefined {
  const s = asDict(step);
  if (!s) return undefined;
  const sources = s.sources;
  if (!Array.isArray(sources) || sources.length === 0) return undefined;
  return serialize(sources, maxChars);
}

// --- rate-limit headers (normalized) ----------------------------------------

export interface RateLimitInfo {
  requestsLimit?: number;
  requestsRemaining?: number;
  requestsResetMs?: number;
  tokensLimit?: number;
  tokensRemaining?: number;
  tokensResetMs?: number;
}

// Accept either a Headers-like object (has `.get`) or a plain string map; header
// names are case-insensitive.
function makeHeaderGetter(headers: unknown): ((name: string) => string | undefined) | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const h = headers as { get?: (name: string) => string | null };
  if (typeof h.get === "function") {
    return (name) => h.get!(name) ?? undefined;
  }
  // Plain object: build a lowercased lookup once.
  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(headers as Dict)) {
    if (typeof v === "string") lower.set(k.toLowerCase(), v);
  }
  return (name) => lower.get(name.toLowerCase());
}

function firstInt(
  get: (name: string) => string | undefined,
  names: readonly string[],
): number | undefined {
  for (const name of names) {
    const raw = get(name);
    if (raw === undefined) continue;
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

// OpenAI resets are durations ("6m0s", "880ms", "1.5s"); Anthropic resets are
// RFC3339 timestamps. Normalize both to milliseconds-until-reset.
function parseDurationMs(v: string): number | undefined {
  const re = /(\d+(?:\.\d+)?)\s*(ms|s|m|h)/g;
  let ms = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v)) !== null) {
    matched = true;
    const n = Number.parseFloat(m[1]!);
    switch (m[2]) {
      case "ms":
        ms += n;
        break;
      case "s":
        ms += n * 1_000;
        break;
      case "m":
        ms += n * 60_000;
        break;
      case "h":
        ms += n * 3_600_000;
        break;
    }
  }
  return matched ? Math.round(ms) : undefined;
}

function firstResetMs(
  get: (name: string) => string | undefined,
  names: readonly string[],
  now: number,
): number | undefined {
  for (const name of names) {
    const raw = get(name);
    if (raw === undefined) continue;
    const dur = parseDurationMs(raw);
    if (dur !== undefined) return dur;
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return Math.max(0, t - now);
  }
  return undefined;
}

const REQ_LIMIT = ["x-ratelimit-limit-requests", "anthropic-ratelimit-requests-limit"] as const;
const REQ_REMAIN = [
  "x-ratelimit-remaining-requests",
  "anthropic-ratelimit-requests-remaining",
] as const;
const REQ_RESET = ["x-ratelimit-reset-requests", "anthropic-ratelimit-requests-reset"] as const;
const TOK_LIMIT = [
  "x-ratelimit-limit-tokens",
  "anthropic-ratelimit-tokens-limit",
  "anthropic-ratelimit-input-tokens-limit",
] as const;
const TOK_REMAIN = [
  "x-ratelimit-remaining-tokens",
  "anthropic-ratelimit-tokens-remaining",
  "anthropic-ratelimit-input-tokens-remaining",
] as const;
const TOK_RESET = [
  "x-ratelimit-reset-tokens",
  "anthropic-ratelimit-tokens-reset",
  "anthropic-ratelimit-input-tokens-reset",
] as const;

/**
 * Normalize the rate-limit headers from a step's response into a cross-provider
 * shape, or `undefined` when none are present. Only rate-limit headers are read.
 */
export function extractRateLimit(headers: unknown, now: number): RateLimitInfo | undefined {
  const get = makeHeaderGetter(headers);
  if (!get) return undefined;
  const info: RateLimitInfo = {
    requestsLimit: firstInt(get, REQ_LIMIT),
    requestsRemaining: firstInt(get, REQ_REMAIN),
    requestsResetMs: firstResetMs(get, REQ_RESET, now),
    tokensLimit: firstInt(get, TOK_LIMIT),
    tokensRemaining: firstInt(get, TOK_REMAIN),
    tokensResetMs: firstResetMs(get, TOK_RESET, now),
  };
  const hasAny = Object.values(info).some((v) => v !== undefined);
  if (!hasAny) return undefined;
  // Drop undefined keys so the wire payload stays minimal (and `.strict()` happy).
  for (const key of Object.keys(info) as (keyof RateLimitInfo)[]) {
    if (info[key] === undefined) delete info[key];
  }
  return info;
}

/** The response object on a step (carries headers); shape-tolerant. */
export function stepResponseHeaders(step: unknown): unknown {
  const s = asDict(step);
  const response = asDict(s?.response);
  return response?.headers;
}
