import type { LanguageModelUsage } from "ai";

import type { Usage } from "./wire";

// Map the AI SDK v7 `LanguageModelUsage` onto the wire-contract `Usage`. The
// contract mirrors the eight OpenRouter cost dimensions; absence is meaningful
// (a missing count must stay absent, never coerced to 0 which would imply free).

// Read usage through a structural view: the v7 beta/canary moved reasoning/cache
// counts under `outputTokenDetails`/`inputTokenDetails` and dropped the legacy
// top-level `reasoningTokens`/`cachedInputTokens` from `LanguageModelUsage` —
// but those still arrive on the v4-v6 `wrap` path inside our broad peer range.
// Keeping both shapes optional lets one mapping serve every supported version
// without fighting the version-specific SDK type (same approach as collector).
interface UsageView {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  outputTokenDetails?: { reasoningTokens?: number };
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  // Deprecated top-level fields (v4-v6); absent on the v7 beta/canary type.
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

function toInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

/** Convert SDK usage to contract usage, dropping unreported fields. */
export function mapUsage(usage: LanguageModelUsage | undefined): Usage | undefined {
  if (!usage) return undefined;
  const u = usage as UsageView;

  const out: Usage = {};
  const set = (key: keyof Usage, value: number | undefined): void => {
    const n = toInt(value);
    if (n !== undefined) out[key] = n;
  };

  set("inputTokens", u.inputTokens);
  set("outputTokens", u.outputTokens);
  set("totalTokens", u.totalTokens);
  // Prefer the v7 detail fields; fall back to the deprecated top-level ones.
  set("reasoningTokens", u.outputTokenDetails?.reasoningTokens ?? u.reasoningTokens);
  set("cachedInputTokens", u.inputTokenDetails?.cacheReadTokens ?? u.cachedInputTokens);
  set("cacheWriteInputTokens", u.inputTokenDetails?.cacheWriteTokens);

  return Object.keys(out).length > 0 ? out : undefined;
}
