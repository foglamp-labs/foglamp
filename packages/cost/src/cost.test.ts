import { describe, expect, test } from "bun:test";

import { computeCost } from "./compute";
import { formatScaled, scaledCost } from "./decimal";
import { modelIdCandidates, normalizeModelId } from "./normalize";
import {
  parsePricingResponse,
  priceSpan,
  resolveModelPrice,
} from "./index";

const FIXTURE = {
  data: [
    {
      id: "openai/gpt-4o",
      pricing: { prompt: "0.0000025", completion: "0.00001" },
    },
    {
      id: "google/gemini-3.5-flash",
      pricing: {
        prompt: "0.0000015",
        completion: "0.000009",
        internal_reasoning: "0.000009",
        input_cache_read: "0.00000015",
        input_cache_write: "0.00000008333333333333334",
        web_search: "0.014",
      },
    },
  ],
};

const table = parsePricingResponse(FIXTURE);

describe("decimal", () => {
  test("exact fixed-point multiply, round half-up", () => {
    // 0.00000008333333333333334 * 1_000_000 = 0.08333333333333334
    expect(formatScaled(scaledCost("0.00000008333333333333334", 1_000_000)!)).toBe(
      "0.0833333333",
    );
    expect(formatScaled(scaledCost("0.0000025", 1000)!)).toBe("0.0025000000");
    expect(scaledCost("not-a-number", 5)).toBeNull();
  });
});

describe("normalize", () => {
  test("provider + bare model → vendor/model", () => {
    expect(normalizeModelId("openai", "gpt-4o")).toBe("openai/gpt-4o");
    expect(normalizeModelId("openai.chat", "gpt-4o")).toBe("openai/gpt-4o");
    expect(normalizeModelId("anthropic", "claude-sonnet-4")).toBe(
      "anthropic/claude-sonnet-4",
    );
  });
  test("already-qualified ids pass through; unmappable vendor → empty", () => {
    expect(normalizeModelId("whatever", "meta-llama/llama-3.1-70b")).toBe(
      "meta-llama/llama-3.1-70b",
    );
    expect(normalizeModelId("groq", "llama-3.1-70b")).toBe("");
  });
  test("version suffix fallback candidate", () => {
    expect(modelIdCandidates("openai", "gpt-4o-2024-08-06")).toEqual([
      "openai/gpt-4o-2024-08-06",
      "openai/gpt-4o",
    ]);
  });
});

describe("resolveModelPrice", () => {
  test("resolves via version-stripped fallback", () => {
    const r = resolveModelPrice(table, "openai", "gpt-4o-2024-08-06");
    expect(r?.resolvedId).toBe("openai/gpt-4o");
    expect(r?.source).toBe("openrouter");
  });
  test("unknown model → null", () => {
    expect(resolveModelPrice(table, "acme", "mystery-model")).toBeNull();
  });
  test("custom override takes precedence; source becomes mixed", () => {
    const r = resolveModelPrice(table, "openai", "gpt-4o", {
      prompt: "0.000001",
    });
    expect(r?.price.prompt).toBe("0.000001");
    expect(r?.price.completion).toBe("0.00001"); // fallback to OpenRouter
    expect(r?.source).toBe("mixed");
  });
});

describe("computeCost", () => {
  test("basic prompt + completion", () => {
    const r = resolveModelPrice(table, "openai", "gpt-4o")!;
    const c = computeCost({ inputTokens: 1000, outputTokens: 500 }, r.price);
    expect(c.promptCost).toBe("0.0025000000");
    expect(c.completionCost).toBe("0.0050000000");
    expect(c.totalCost).toBe("0.0075000000");
    expect(c.imageCost).toBeNull();
  });

  test("cached input is split out of prompt and priced at cache-read", () => {
    const r = resolveModelPrice(table, "google", "gemini-3.5-flash")!;
    const c = computeCost(
      { inputTokens: 1000, cachedInputTokens: 200, outputTokens: 0 },
      r.price,
    );
    // prompt billable = 800 * 0.0000015 = 0.0012
    expect(c.promptCost).toBe("0.0012000000");
    // cacheRead = 200 * 0.00000015 = 0.00003
    expect(c.cacheReadCost).toBe("0.0000300000");
  });

  test("reasoning tokens billed separately, removed from completion", () => {
    const r = resolveModelPrice(table, "google", "gemini-3.5-flash")!;
    const c = computeCost(
      { inputTokens: 0, outputTokens: 500, reasoningTokens: 100 },
      r.price,
    );
    // completion billable = 400 * 0.000009 = 0.0036
    expect(c.completionCost).toBe("0.0036000000");
    // internal_reasoning = 100 * 0.000009 = 0.0009
    expect(c.internalReasoningCost).toBe("0.0009000000");
  });

  test("unknown model → all null, never $0", () => {
    const priced = priceSpan({
      table,
      provider: "acme",
      modelId: "mystery",
      usage: { inputTokens: 1000, outputTokens: 500 },
    });
    expect(priced.source).toBeNull();
    expect(priced.costs.totalCost).toBeNull();
    expect(priced.costs.promptCost).toBeNull();
  });

  test("resolved model with no usage → total 0, not null", () => {
    const priced = priceSpan({
      table,
      provider: "openai",
      modelId: "gpt-4o",
      usage: undefined,
    });
    expect(priced.source).toBe("openrouter");
    expect(priced.costs.totalCost).toBe("0.0000000000");
  });
});
