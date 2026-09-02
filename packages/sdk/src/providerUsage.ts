type Dict = Record<string, unknown>;

interface StepLike {
  providerMetadata?: unknown;
  experimental_providerMetadata?: unknown; // v5/v6 name
  content?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
}

function asDict(v: unknown): Dict | undefined {
  return v && typeof v === "object" ? (v as Dict) : undefined;
}

function posInt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
}

// --- provider-metadata signals (authoritative when present) ----------------

// Google grounding: billed per executed query; empty-string entries aren't billed.
function googleSearches(pm: Dict): number | undefined {
  const gm = asDict(asDict(pm.google)?.groundingMetadata);
  if (!gm) return undefined;
  const queries = gm.webSearchQueries;
  if (!Array.isArray(queries)) return 0;
  return queries.filter((q) => typeof q === "string" && q.trim().length > 0).length;
}

// Anthropic: usage.server_tool_use.web_search_requests (per request).
function anthropicSearches(pm: Dict): number | undefined {
  const a = asDict(pm.anthropic);
  if (!a) return undefined;
  const stu = asDict(asDict(a.usage)?.server_tool_use) ?? asDict(a.server_tool_use);
  if (!stu) return undefined;
  return posInt(stu.web_search_requests) ?? 0;
}

// Perplexity: usage.numSearchQueries (camel or snake; nested or top-level).
function perplexitySearches(pm: Dict): number | undefined {
  const p = asDict(pm.perplexity);
  if (!p) return undefined;
  const usage = asDict(p.usage) ?? p;
  return posInt(usage.numSearchQueries ?? usage.num_search_queries) ?? 0;
}

// --- provider-executed web-search tool counting (OpenAI/xAI/generic) --------

// `file_search`, `code_interpreter`, etc. must NOT match — only web/x search.
const WEB_SEARCH_NAME = /(web[ _-]?search|x[ _-]?search)/i;

function isWebSearchTool(item: unknown): boolean {
  const it = asDict(item);
  if (!it) return false;
  if (WEB_SEARCH_NAME.test(String(it.toolName ?? it.name ?? ""))) return true;
  // OpenAI Responses web-search result shape, even when unnamed.
  const out = asDict(it.output);
  if (it.providerExecuted && out) {
    if (asDict(out.action)?.query !== undefined) return true;
    if (Array.isArray(out.sources)) return true;
  }
  return false;
}

// Count one per search: prefer tool-call parts (the paired tool-result would
// double-count), then tool-results, then untyped items / the toolCalls array.
function toolSearchCount(step: StepLike): number {
  const content = step.content;
  if (Array.isArray(content)) {
    const calls = content.filter((p) => asDict(p)?.type === "tool-call" && isWebSearchTool(p));
    if (calls.length) return calls.length;
    const results = content.filter((p) => asDict(p)?.type === "tool-result" && isWebSearchTool(p));
    if (results.length) return results.length;
    return content.filter((p) => !asDict(p)?.type && isWebSearchTool(p)).length;
  }
  if (Array.isArray(step.toolCalls)) return step.toolCalls.filter(isWebSearchTool).length;
  if (Array.isArray(step.toolResults)) return step.toolResults.filter(isWebSearchTool).length;
  return 0;
}

/** Billable web searches for a model step, or undefined when none. */
export function extractWebSearchCount(step: unknown): number | undefined {
  const s = asDict(step) as StepLike | undefined;
  if (!s) return undefined;
  const pm = asDict(s.providerMetadata) ?? asDict(s.experimental_providerMetadata);

  let count: number | undefined;
  if (pm) count = googleSearches(pm) ?? anthropicSearches(pm) ?? perplexitySearches(pm);
  if (count === undefined) count = toolSearchCount(s);

  return count && count > 0 ? count : undefined;
}
