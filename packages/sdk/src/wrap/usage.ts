import type { Usage } from "../wire";

// Map AI SDK usage onto the wire-contract `Usage`, spanning v4→v7 field names.
// Read structurally (no `import … from "ai"`) so one mapper works regardless of
// the installed major: v4 used `promptTokens`/`completionTokens`; v5/v6 renamed
// them to `inputTokens`/`outputTokens`; v7 added nested `*TokenDetails`. Absence
// is meaningful (a missing count must stay absent, never coerced to 0).

interface UsageView {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  // v4 names.
  promptTokens?: number;
  completionTokens?: number;
  // flat detail fields (v5/v6 + deprecated v7 fallbacks).
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cachedPromptTokens?: number;
  // v7 nested detail objects.
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
}

function toInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

/** Convert AI SDK usage (any major) to contract usage, dropping unreported fields. */
export function mapUsageWrap(usage: UsageView | undefined): Usage | undefined {
  if (!usage) return undefined;

  const out: Usage = {};
  const set = (key: keyof Usage, value: number | undefined): void => {
    const n = toInt(value);
    if (n !== undefined) out[key] = n;
  };

  set("inputTokens", usage.inputTokens ?? usage.promptTokens);
  set("outputTokens", usage.outputTokens ?? usage.completionTokens);
  set("totalTokens", usage.totalTokens);
  set("reasoningTokens", usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens);
  set(
    "cachedInputTokens",
    usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? usage.cachedPromptTokens,
  );
  set("cacheWriteInputTokens", usage.inputTokenDetails?.cacheWriteTokens);

  return Object.keys(out).length > 0 ? out : undefined;
}
