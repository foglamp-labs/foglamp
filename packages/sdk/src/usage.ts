import type { LanguageModelUsage } from "ai";

import type { Usage } from "./wire";

// Map the AI SDK v7 `LanguageModelUsage` onto the wire-contract `Usage`. The
// contract mirrors the eight OpenRouter cost dimensions; absence is meaningful
// (a missing count must stay absent, never coerced to 0 which would imply free).

function toInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

/** Convert SDK usage to contract usage, dropping unreported fields. */
export function mapUsage(usage: LanguageModelUsage | undefined): Usage | undefined {
  if (!usage) return undefined;

  const out: Usage = {};
  const set = (key: keyof Usage, value: number | undefined): void => {
    const n = toInt(value);
    if (n !== undefined) out[key] = n;
  };

  set("inputTokens", usage.inputTokens);
  set("outputTokens", usage.outputTokens);
  set("totalTokens", usage.totalTokens);
  // Prefer the v7 detail fields; fall back to the deprecated top-level ones.
  set("reasoningTokens", usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens);
  set("cachedInputTokens", usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens);
  set("cacheWriteInputTokens", usage.inputTokenDetails?.cacheWriteTokens);

  return Object.keys(out).length > 0 ? out : undefined;
}
