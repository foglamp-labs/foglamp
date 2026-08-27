"use client";

import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@foglamp/ui/components/select";
import { Textarea } from "@foglamp/ui/components/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import { motion } from "motion/react";
import Link from "next/link";

import { ModelLogo } from "@/components/model-logo";

export type Provider = "google" | "openai" | "anthropic";

// Pass thresholds offered for scored judges (score >= threshold passes).
export const THRESHOLD_PRESETS = ["0.5", "0.6", "0.7", "0.8", "0.9"] as const;

export const SAMPLE_PRESETS = [
	"0.01",
	"0.05",
	"0.1",
	"0.25",
	"0.5",
	"1",
] as const;

// Judge model catalog per provider. Kept to known-good ids (BYOK calls these
// directly), surfaced as a dropdown so users don't have to type a model id.
export const JUDGE_MODELS: Record<Provider, { id: string; label: string }[]> = {
	google: [
		{ id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
		{ id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
		{ id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
		{ id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
		{ id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
	],
	openai: [
		{ id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
		{ id: "gpt-5.5", label: "GPT-5.5" },
		{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
	],
	anthropic: [
		{ id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
		{ id: "claude-sonnet-5", label: "Claude Sonnet 5" },
		{ id: "claude-opus-5", label: "Claude Opus 5" },
		{ id: "claude-fable-5", label: "Claude Fable 5" },
	],
};

// Provider display order + labels for the grouped judge-model dropdown.
export const PROVIDER_GROUPS: {
	provider: Provider;
	label: string;
	disabled?: boolean;
}[] = [
	{ provider: "google", label: "Google" },
	{ provider: "openai", label: "OpenAI" },
	{ provider: "anthropic", label: "Anthropic" },
];

// Flat lookups: which provider/label owns a given model id (ids are unique
// across providers), so selecting a model derives its provider.
export const MODEL_PROVIDER: Record<string, Provider> = Object.fromEntries(
	(Object.entries(JUDGE_MODELS) as [Provider, { id: string }[]][]).flatMap(
		([p, list]) => list.map((m) => [m.id, p] as const),
	),
);
export const MODEL_LABEL: Record<string, string> = Object.fromEntries(
	Object.values(JUDGE_MODELS)
		.flat()
		.map((m) => [m.id, m.label] as const),
);

/** Validates a code preset's params. Returns a human message when the eval
 * isn't savable yet (e.g. a contains/excludes check with no substring, or an
 * invalid regex), or null when the params are usable. Shared by the create
 * wizard and the edit dialog so both gate identically. */
export function settingsParamError(
	preset: { id: string } | null,
	values: { substring: string; pattern: string; maxChars: string },
): string | null {
	if (!preset) return null;
	if (preset.id === "contains" || preset.id === "not_contains") {
		if (!values.substring.trim()) return "Enter the substring to match on.";
	}
	if (preset.id === "regex_match") {
		if (!values.pattern.trim()) return "Enter a regular expression.";
		try {
			new RegExp(values.pattern);
		} catch {
			return "That isn't a valid regular expression.";
		}
	}
	if (preset.id === "max_length") {
		const n = Number(values.maxChars);
		if (!Number.isFinite(n) || n <= 0)
			return "Enter a positive character budget.";
	}
	return null;
}

// The placeholders renderPrompt understands; a judge prompt may only use these.
export const PROMPT_PLACEHOLDERS = [
	"input",
	"output",
	"context",
	"reference",
	"tools",
] as const;

/** Validates a judge prompt override. Returns a human message when it can't be
 * used as-is — an unknown {placeholder}, or no placeholder at all (which would
 * send the judge a static prompt with none of the trace in it) — or null when
 * it's fine. Code presets, and an empty override (→ falls back to the preset
 * default), are always allowed — except the custom preset, which has no default
 * and therefore requires a prompt. Shared by the create wizard + edit dialog. */
export function promptOverrideError(
	preset: { id: string; source: "code" | "llm" } | null,
	promptOverride: string,
): string | null {
	if (!preset || preset.source !== "llm") return null;
	const text = promptOverride.trim();
	if (!text) {
		// The custom judge has no default template to fall back to.
		return preset.id === "custom" ? "Write the judge prompt." : null;
	}
	const tokens = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
	const known = PROMPT_PLACEHOLDERS as readonly string[];
	const unknown = tokens.find((t) => !known.includes(t));
	if (unknown) {
		return `Unknown placeholder {${unknown}}. Use ${PROMPT_PLACEHOLDERS.map(
			(p) => `{${p}}`,
		).join(", ")}.`;
	}
	if (tokens.length === 0) {
		return "Add at least one placeholder (e.g. {output}) so the judge sees the trace.";
	}
	return null;
}

const MORPH = { type: "spring", stiffness: 400, damping: 38 } as const;

// A segmented control — the look of tabs, but a plain single-select with a
// sliding pill (shared layoutId) that glides under the active option.
export function Segmented<T extends string>({
	options,
	value,
	onChange,
	layoutId = "segmented-pill",
}: {
	options: { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
	/** Unique per mounted control so two on screen don't share the pill. */
	layoutId?: string;
}) {
	return (
		<div className="inline-flex w-full rounded-md squircle:rounded-2xl corner-squircle bg-muted p-[3px] dark:bg-muted/50">
			{options.map((opt) => {
				const active = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						onClick={() => onChange(opt.value)}
						className={cn(
							"relative flex-1 cursor-pointer rounded-md squircle:rounded-xl corner-squircle px-2 py-1 text-sm font-medium whitespace-nowrap transition-colors",
							active
								? "text-foreground"
								: "text-foreground/60 hover:text-foreground",
						)}
					>
						{active && (
							<motion.span
								layoutId={layoutId}
								transition={MORPH}
								className="absolute inset-0 rounded-md squircle:rounded-xl corner-squircle bg-background shadow-(--custom-shadow) dark:bg-input/50"
							/>
						)}
						<span className="relative z-10">{opt.label}</span>
					</button>
				);
			})}
		</div>
	);
}

export function passThresholdError(value: string): string | null {
	const n = Number(value);
	if (value.trim() === "" || Number.isNaN(n) || n < 0 || n > 1) {
		return "Enter a threshold between 0 and 1.";
	}
	return null;
}

/** The "how should it score?" fields — shared by the create wizard's step 3 and
 * the single-eval edit dialog. Renders the judge model (LLM presets), the
 * preset's code params (substring / pattern / max length), and the sample rate.
 * The preset id/source decides which fields show. */
export function EvalSettingsFields({
	preset,
	judgeModel,
	judgeProvider,
	sampleRate,
	passThreshold,
	substring,
	pattern,
	maxChars,
	promptOverride,
	defaultPrompt,
	configuredProviders,
	onChange,
	segmentedLayoutId,
}: {
	preset: { id: string; source: "code" | "llm" } | null;
	judgeModel: string;
	judgeProvider: Provider;
	sampleRate: string;
	/** Judge presets only: score at or above this passes (0..1). */
	passThreshold: string;
	substring: string;
	pattern: string;
	maxChars: string;
	/** The judge prompt template the eval will use (prefilled from the preset). */
	promptOverride: string;
	/** The preset's default template — shown as the textarea's placeholder. */
	defaultPrompt?: string;
	/** Providers with a saved BYOK key — drives the "no key" warning. */
	configuredProviders: Set<string>;
	onChange: (patch: {
		judgeModel?: string;
		judgeProvider?: Provider;
		sampleRate?: string;
		passThreshold?: string;
		substring?: string;
		pattern?: string;
		maxChars?: string;
		promptOverride?: string;
	}) => void;
	segmentedLayoutId?: string;
}) {
	if (!preset) return null;
	const isJudge = preset.source === "llm";
	const needsKey = isJudge && !configuredProviders.has(judgeProvider);
	const paramError = settingsParamError(preset, {
		substring,
		pattern,
		maxChars,
	});
	const promptError = promptOverrideError(preset, promptOverride);
	return (
		<div className="flex flex-col gap-4">
			{isJudge && (
				<>
					<Field>
						<FieldLabel>Judge model</FieldLabel>
						<Select
							value={judgeModel}
							onValueChange={(v) => {
								const id = v as string;
								// Derive the provider from the chosen model so the two stay in
								// lockstep without a separate field.
								onChange({
									judgeModel: id,
									judgeProvider: MODEL_PROVIDER[id] ?? judgeProvider,
								});
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select a model">
									{(value) => {
										const id = value as string;
										return (
											<span className="flex items-center gap-2">
												<ModelLogo provider={MODEL_PROVIDER[id]} modelId={id} />
												{MODEL_LABEL[id] ?? id}
											</span>
										);
									}}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{PROVIDER_GROUPS.map((g) => (
									<SelectGroup key={g.provider}>
										<SelectLabel>{g.label}</SelectLabel>
										{JUDGE_MODELS[g.provider].map((m) => (
											<SelectItem
												key={m.id}
												value={m.id}
												label={m.label}
												disabled={g.disabled}
											>
												<ModelLogo provider={g.provider} modelId={m.id} />
												{m.label}
												{g.disabled && (
													<span className="ml-auto text-xs text-muted-foreground">
														Soon
													</span>
												)}
											</SelectItem>
										))}
									</SelectGroup>
								))}
							</SelectContent>
						</Select>
					</Field>
					{needsKey && (
						<p className="text-sm text-destructive">
							No {judgeProvider} key saved.{" "}
							<Link
								href="/settings/org?tab=provider-keys"
								className="underline"
							>
								Add one
							</Link>{" "}
							to enable this judge.
						</p>
					)}
					<Field>
						<div className="flex items-baseline justify-between gap-3">
							<FieldLabel>Judge prompt</FieldLabel>
							<Tooltip>
								<TooltipTrigger
									render={
										<span className="cursor-default truncate font-mono text-[11px] text-muted-foreground" />
									}
								>
									{"{input} {output} {context} {reference} {tools}"}
								</TooltipTrigger>
								<TooltipContent>
									Placeholders: the trace fills these in where you put them.
								</TooltipContent>
							</Tooltip>
						</div>
						<Textarea
							className="max-h-72 min-h-32 text-xs leading-relaxed"
							value={promptOverride}
							placeholder={defaultPrompt}
							onChange={(e) => onChange({ promptOverride: e.target.value })}
						/>
						{promptError && (
							<p className="text-sm text-destructive">{promptError}</p>
						)}
					</Field>
				</>
			)}
			{(preset.id === "contains" || preset.id === "not_contains") && (
				<Field>
					<FieldLabel>Substring</FieldLabel>
					<Input
						value={substring}
						onChange={(e) => onChange({ substring: e.target.value })}
					/>
				</Field>
			)}
			{preset.id === "regex_match" && (
				<Field>
					<FieldLabel>Pattern</FieldLabel>
					<Input
						value={pattern}
						onChange={(e) => onChange({ pattern: e.target.value })}
					/>
				</Field>
			)}
			{preset.id === "max_length" && (
				<Field>
					<FieldLabel>Max characters</FieldLabel>
					<Input
						type="number"
						value={maxChars}
						onChange={(e) => onChange({ maxChars: e.target.value })}
					/>
				</Field>
			)}
			{paramError && (
				<p className="-mt-2 text-sm text-destructive">{paramError}</p>
			)}
			<div className={cn("grid gap-4", isJudge && "sm:grid-cols-[2fr_3fr]")}>
				{isJudge && (
					<Field>
						<Tooltip>
							<TooltipTrigger
								render={<FieldLabel className="w-fit cursor-default" />}
							>
								Pass at
							</TooltipTrigger>
							<TooltipContent>
								Scores run from 0.00 to 1.00; a run at or above this passes.
								Changing it re-grades past runs too.
							</TooltipContent>
						</Tooltip>
						<Segmented
							layoutId={segmentedLayoutId ? `${segmentedLayoutId}-threshold` : "threshold-pill"}
							options={THRESHOLD_PRESETS.map((t) => ({ value: t, label: t }))}
							value={passThreshold}
							onChange={(v) => onChange({ passThreshold: v })}
						/>
					</Field>
				)}
				<Field>
					<FieldLabel>Sample rate</FieldLabel>
					<Segmented
						layoutId={segmentedLayoutId}
						options={SAMPLE_PRESETS.map((s) => ({
							value: s,
							label: `${Math.round(Number(s) * 100)}%`,
						}))}
						value={sampleRate}
						onChange={(v) => onChange({ sampleRate: v })}
					/>
				</Field>
			</div>
		</div>
	);
}
