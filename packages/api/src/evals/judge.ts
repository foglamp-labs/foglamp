import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { getPricingTable, priceSpan } from "@foglamp/cost";
import { type LanguageModel, generateObject } from "ai";
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
		const { min, max } = preset.scoreScale ?? { min: 0, max: 1 };
		shape.score = z
			.number()
			.min(min)
			.max(max)
			.describe(
				`Score from ${min.toFixed(2)} to ${max.toFixed(2)}, using two decimals.`,
			);
	}
	if (preset.emitsPassed) {
		shape.passed = z.boolean().describe("Whether the check passes.");
	}
	return z.object(shape);
}

export function renderPrompt(
	template: string,
	extracted: ExtractedContext,
): string {
	return template
		.replaceAll("{input}", extracted.input ?? "")
		.replaceAll("{output}", extracted.output ?? "")
		.replaceAll("{context}", extracted.context ?? "")
		.replaceAll("{reference}", extracted.reference ?? "")
		.replaceAll("{tools}", extracted.tools ?? "");
}

export type PromptSegment =
	| { kind: "text"; text: string }
	| { kind: "field"; field: keyof ExtractedContext };

const FIELD_TOKEN = /\{(input|output|context|reference|tools)\}/g;

/**
 * Break a judge template into its instruction text and field placeholders so
 * the UI can render the rubric and each field as its own section instead of
 * one flat prompt. A trailing "LABEL:" line before a placeholder (the
 * template's own caption for that field) is dropped: the UI captions fields
 * itself, and keeping both would read as noise.
 */
export function splitTemplate(template: string): PromptSegment[] {
	const out: PromptSegment[] = [];
	let last = 0;
	const pushText = (raw: string) => {
		const text = raw
			.replace(/(^|\n)[^\n]{0,40}:\s*$/, "$1")
			.trim();
		if (text) out.push({ kind: "text", text });
	};
	for (const m of template.matchAll(FIELD_TOKEN)) {
		pushText(template.slice(last, m.index));
		out.push({ kind: "field", field: m[1] as keyof ExtractedContext });
		last = (m.index ?? 0) + m[0].length;
	}
	pushText(template.slice(last));
	return out;
}

// --- Payload truncation -----------------------------------------------------
// Judge inputs are bounded before the model call so a pathologically large span
// (multi-MB output, huge retrieved context) can't blow the context window or
// run up cost. The budget is an approximate character count across the filled
// fields; when exceeded we head+tail trim the lowest-priority fields first, so
// the grading criteria (reference/context) survive intact whenever possible.
const DEFAULT_MAX_INPUT_CHARS = 200_000;
const TRUNC_MIN_KEEP = 800; // never shrink a single field below this (head+tail)

function headTail(s: string, keep: number): string {
	if (s.length <= keep) return s;
	const head = Math.ceil(keep * 0.6);
	const tail = keep - head;
	const removed = s.length - keep;
	return (
		s.slice(0, head) +
		`\n\n…[${removed} characters truncated]…\n\n` +
		(tail > 0 ? s.slice(s.length - tail) : "")
	);
}

export function truncateExtracted(
	extracted: ExtractedContext,
	budget: number,
): { extracted: ExtractedContext; truncated: boolean } {
	const fields = {
		input: extracted.input ?? "",
		output: extracted.output ?? "",
		context: extracted.context ?? "",
		reference: extracted.reference ?? "",
		tools: extracted.tools ?? "",
	};
	const total = Object.values(fields).reduce((n, s) => n + s.length, 0);
	if (total <= budget) return { extracted, truncated: false };

	// Cut order = lowest priority first: the graded `output` yields before the
	// `input`, and the grading criteria (`context`, `reference`) yield last.
	let overflow = total - budget;
	for (const f of [
		"output",
		"input",
		"tools",
		"context",
		"reference",
	] as const) {
		if (overflow <= 0) break;
		const cuttable = Math.max(0, fields[f].length - TRUNC_MIN_KEEP);
		if (cuttable <= 0) continue;
		const cut = Math.min(cuttable, overflow);
		fields[f] = headTail(fields[f], fields[f].length - cut);
		overflow -= cut;
	}
	return {
		extracted: {
			input: fields.input,
			output: fields.output,
			...(fields.context ? { context: fields.context } : {}),
			...(fields.reference ? { reference: fields.reference } : {}),
			...(fields.tools ? { tools: fields.tools } : {}),
		},
		truncated: true,
	};
}

export function parseJudgeObject(
	preset: Preset,
	object: Record<string, unknown>,
): ScoreResult {
	// Scores live on a 0.00–1.00 scale; round to two decimals so stored values
	// (and their averages) stay clean regardless of what the model emits.
	const round2 = (n: number) => Math.round(n * 100) / 100;
	return {
		score: preset.emitsScore ? round2(Number(object.score)) : null,
		passed: preset.emitsPassed ? Boolean(object.passed) : null,
		reason: typeof object.reason === "string" ? object.reason : "",
	};
}

function buildModel(
	provider: Provider,
	apiKey: string,
	modelId: string,
): LanguageModel {
	switch (provider) {
		case "google":
			return createGoogleGenerativeAI({ apiKey })(modelId);
		case "openai":
			return createOpenAI({ apiKey })(modelId);
		case "anthropic":
			return createAnthropic({ apiKey })(modelId);
	}
}

export type JudgeOutcome = {
	result: ScoreResult;
	cost: string | null;
	truncated: boolean;
};

export async function runJudge(args: {
	provider: Provider;
	apiKey: string;
	modelId: string;
	preset: Preset;
	extracted: ExtractedContext;
	maxInputChars?: number;
	/** Per-eval prompt template; falls back to the preset default when blank. */
	promptOverride?: string;
}): Promise<JudgeOutcome> {
	const { provider, apiKey, modelId, preset, extracted } = args;
	const { extracted: bounded, truncated } = truncateExtracted(
		extracted,
		args.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS,
	);
	// A non-empty per-eval override wins; otherwise the preset's built-in
	// template (and finally a bare {output} as a last resort).
	const template = args.promptOverride?.trim() || preset.prompt || "{output}";
	const { object, usage } = await generateObject({
		model: buildModel(provider, apiKey, modelId),
		schema: buildJudgeSchema(preset),
		prompt: renderPrompt(template, bounded),
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
	return { result, cost, truncated };
}
