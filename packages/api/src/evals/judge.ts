import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { getPricingTable, priceSpan } from "@foglamp/cost";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

import type { Preset } from "./presets";
import type { ExtractedContext, Provider, ScoreResult } from "./types";

// LLM-as-judge runner. The pure helpers (schema / prompt / parse) are exported
// separately so they can be unit-tested without a live model; runJudge wires
// them to generateObject and prices the call via the existing cost engine.

export function buildJudgeSchema(preset: Preset) {
  const shape: Record<string, z.ZodTypeAny> = {
    reason: z.string().describe("One concise sentence justifying the verdict."),
  };
  if (preset.emitsScore) {
    const { min, max } = preset.scoreScale ?? { min: 1, max: 5 };
    shape.score = z.number().min(min).max(max).describe(`Score from ${min} to ${max}.`);
  }
  if (preset.emitsPassed) {
    shape.passed = z.boolean().describe("Whether the check passes.");
  }
  return z.object(shape);
}

export function renderPrompt(template: string, extracted: ExtractedContext): string {
  return template
    .replaceAll("{input}", extracted.input ?? "")
    .replaceAll("{output}", extracted.output ?? "")
    .replaceAll("{context}", extracted.context ?? "")
    .replaceAll("{reference}", extracted.reference ?? "");
}

export function parseJudgeObject(
  preset: Preset,
  object: Record<string, unknown>,
): ScoreResult {
  return {
    score: preset.emitsScore ? Number(object.score) : null,
    passed: preset.emitsPassed ? Boolean(object.passed) : null,
    reason: typeof object.reason === "string" ? object.reason : "",
  };
}

function buildModel(provider: Provider, apiKey: string, modelId: string): LanguageModel {
  switch (provider) {
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "anthropic":
      // @ai-sdk/anthropic has no release matching this ai version line yet;
      // the provider enum keeps the value for forward-compat.
      throw new Error("Anthropic judges are not available in this build yet.");
  }
}

export type JudgeOutcome = { result: ScoreResult; cost: string | null };

export async function runJudge(args: {
  provider: Provider;
  apiKey: string;
  modelId: string;
  preset: Preset;
  extracted: ExtractedContext;
}): Promise<JudgeOutcome> {
  const { provider, apiKey, modelId, preset, extracted } = args;
  const { object, usage } = await generateObject({
    model: buildModel(provider, apiKey, modelId),
    schema: buildJudgeSchema(preset),
    prompt: renderPrompt(preset.prompt ?? "{output}", extracted),
  });

  const result = parseJudgeObject(preset, object as Record<string, unknown>);

  // Best-effort cost: price the judge call through the same engine ingest uses.
  let cost: string | null = null;
  try {
    const table = await getPricingTable();
    const priced = priceSpan({
      table,
      provider,
      modelId,
      usage: {
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
      },
    });
    cost = priced.costs.totalCost;
  } catch {
    /* pricing unavailable — leave cost null */
  }
  return { result, cost };
}
