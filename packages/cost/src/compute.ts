import type { Usage } from "@watchtower/contracts";

import { formatScaled, scaledCost } from "./decimal";
import { EMPTY_BREAKDOWN, type CostBreakdown, type ModelPrice } from "./dimensions";

// Cost a dimension only when both a price and a positive count are present.
// Returns the scaled BigInt (for summing) and the formatted string.
function dim(
  price: string | null,
  count: number,
): { scaled: bigint | null; str: string | null } {
  if (price == null || count <= 0) return { scaled: null, str: null };
  const scaled = scaledCost(price, count);
  if (scaled == null) return { scaled: null, str: null };
  return { scaled, str: formatScaled(scaled) };
}

/**
 * Compute the per-dimension cost breakdown for a span's usage under a resolved
 * model price. Modeling decisions (documented because providers report usage
 * inconsistently):
 *  - `prompt` is billed over (inputTokens − cachedInputTokens): AI SDK reports
 *    inputTokens as the full input incl. the cached portion, which is billed
 *    separately at the cache-read rate.
 *  - When the model lists an `internal_reasoning` price, reasoning tokens are
 *    billed there and removed from `completion` (avoids double counting). When
 *    it does not, reasoning stays folded into the output token price.
 *  - `request` defaults to 1 per call when the model prices per-request.
 *
 * Pass `price = null` (unknown model) to get an all-null breakdown — never $0.
 */
export function computeCost(
  usage: Usage | undefined,
  price: ModelPrice | null,
): CostBreakdown {
  if (!price) return { ...EMPTY_BREAKDOWN };
  const u = usage ?? {};

  const cachedInput = u.cachedInputTokens ?? 0;
  const reasoning = u.reasoningTokens ?? 0;
  const promptBillable = Math.max(0, (u.inputTokens ?? 0) - cachedInput);
  const completionBillable =
    price.internalReasoning != null
      ? Math.max(0, (u.outputTokens ?? 0) - reasoning)
      : (u.outputTokens ?? 0);

  const prompt = dim(price.prompt, promptBillable);
  const completion = dim(price.completion, completionBillable);
  const request = dim(price.request, u.requestCount ?? 1);
  const image = dim(price.image, u.imageCount ?? 0);
  const webSearch = dim(price.webSearch, u.webSearchCount ?? 0);
  const internalReasoning = dim(price.internalReasoning, reasoning);
  const cacheRead = dim(price.cacheRead, cachedInput);
  const cacheWrite = dim(price.cacheWrite, u.cacheWriteInputTokens ?? 0);

  const total = [
    prompt,
    completion,
    request,
    image,
    webSearch,
    internalReasoning,
    cacheRead,
    cacheWrite,
  ].reduce((sum, d) => (d.scaled != null ? sum + d.scaled : sum), 0n);

  return {
    promptCost: prompt.str,
    completionCost: completion.str,
    requestCost: request.str,
    imageCost: image.str,
    webSearchCost: webSearch.str,
    internalReasoningCost: internalReasoning.str,
    cacheReadCost: cacheRead.str,
    cacheWriteCost: cacheWrite.str,
    // Model is known, so a total always exists (≥ 0), even if every dimension
    // was unused.
    totalCost: formatScaled(total),
  };
}
