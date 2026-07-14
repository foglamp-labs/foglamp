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
  test("anthropic dashed versions gain the dotted OpenRouter form", () => {
    expect(modelIdCandidates("anthropic", "claude-haiku-4-5-20251001")).toEqual([
      "anthropic/claude-haiku-4-5-20251001",
      "anthropic/claude-haiku-4-5",
      "anthropic/claude-haiku-4.5",
    ]);
    // 3.x ids get the dotted form too (OpenRouter's primary id), and the
    // dashed form still matches its canonical slug.
    expect(modelIdCandidates("anthropic", "claude-3-5-haiku-20241022")).toEqual([
      "anthropic/claude-3-5-haiku-20241022",
      "anthropic/claude-3-5-haiku",
      "anthropic/claude-3.5-haiku",
    ]);
    // Variant suffixes after the version ("-fast") keep the dot transform.
    expect(modelIdCandidates("anthropic", "claude-opus-4-8-fast")).toContain(
      "anthropic/claude-opus-4.8-fast",
    );
  });
  test("bedrock ids: region + creator prefix and -v1:0 suffix are handled", () => {
    expect(
      modelIdCandidates("amazon-bedrock", "us.anthropic.claude-haiku-4-5-20251001-v1:0"),
    ).toContain("anthropic/claude-haiku-4.5");
    // No region prefix, non-anthropic creator.
    expect(modelIdCandidates("amazon-bedrock", "amazon.nova-pro-v1:0")).toContain(
      "amazon/nova-pro-v1",
    );
    // Creator-prefixed ids parse even when the provider string is something else.
    expect(
      modelIdCandidates("bedrock", "eu.anthropic.claude-sonnet-4-20250514-v1:0"),
    ).toContain("anthropic/claude-sonnet-4");
    // Bare numeric version segments (OpenAI's gpt-oss on Bedrock) drop too.
    expect(modelIdCandidates("amazon-bedrock", "openai.gpt-oss-120b-1:0")).toContain(
      "openai/gpt-oss-120b",
    );
    // Unparseable bedrock id stays unresolved instead of guessing.
    expect(modelIdCandidates("amazon-bedrock", "mystery-model")).toEqual([]);
  });
  test("bedrock ids: newer creators (minimax, moonshot, zai, xai, nvidia, google)", () => {
    expect(modelIdCandidates("amazon-bedrock", "minimax.minimax-m2.5")).toContain(
      "minimax/minimax-m2.5",
    );
    expect(modelIdCandidates("amazon-bedrock", "us.minimax.minimax-m2.5-v1:0")).toContain(
      "minimax/minimax-m2.5",
    );
    // Bedrock ships Kimi under both "moonshot." and "moonshotai."; OpenRouter
    // uses "moonshotai".
    expect(modelIdCandidates("amazon-bedrock", "moonshot.kimi-k2-thinking")).toContain(
      "moonshotai/kimi-k2-thinking",
    );
    expect(modelIdCandidates("amazon-bedrock", "moonshotai.kimi-k2.5")).toContain(
      "moonshotai/kimi-k2.5",
    );
    expect(modelIdCandidates("amazon-bedrock", "zai.glm-4.7")).toContain("z-ai/glm-4.7");
    // xAI gets the dotted-version candidate (OpenRouter says "grok-4.3").
    expect(modelIdCandidates("amazon-bedrock", "xai.grok-4-3")).toContain("x-ai/grok-4.3");
    expect(modelIdCandidates("amazon-bedrock", "nvidia.nemotron-nano-9b-v2")).toContain(
      "nvidia/nemotron-nano-9b-v2",
    );
    expect(modelIdCandidates("amazon-bedrock", "google.gemma-3-27b-it")).toContain(
      "google/gemma-3-27b-it",
    );
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

  test("web search count is priced and added to the total", () => {
    const r = resolveModelPrice(table, "google", "gemini-3.5-flash")!;
    const c = computeCost(
      { inputTokens: 0, outputTokens: 0, webSearchCount: 3 },
      r.price,
    );
    // 3 searches * 0.014 = 0.042
    expect(c.webSearchCost).toBe("0.0420000000");
    expect(c.totalCost).toBe("0.0420000000");
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
