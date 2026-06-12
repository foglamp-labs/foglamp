import { cn } from "@foglamp/ui/lib/utils";
import { IconCpu } from "@tabler/icons-react";
import type { SVGProps } from "react";

import {
	AWSLogo,
	ClaudeLogo,
	CohereLogo,
	DeepSeekLogo,
	GeminiLogo,
	GrokLogo,
	GroqLogo,
	MetaLogo,
	MicrosoftLogo,
	MistralLogo,
	OllamaLogo,
	OpenAILogo,
	OpenRouterLogo,
	PerplexityLogo,
	QwenLogo,
} from "./brand-logos";

type Logo = (props: SVGProps<SVGSVGElement>) => React.ReactElement;

// Keyed by both AI SDK provider ids and OpenRouter vendor slugs, so a logo
// resolves whether we have the raw `provider` or only a "vendor/model" id.
const LOGOS: Record<string, Logo> = {
	openai: OpenAILogo,
	azure: OpenAILogo,
	anthropic: ClaudeLogo,
	claude: ClaudeLogo,
	google: GeminiLogo,
	"google-vertex": GeminiLogo,
	"google-generative-ai": GeminiLogo,
	vertex: GeminiLogo,
	gemini: GeminiLogo,
	mistral: MistralLogo,
	mistralai: MistralLogo,
	xai: GrokLogo,
	"x-ai": GrokLogo,
	grok: GrokLogo,
	deepseek: DeepSeekLogo,
	cohere: CohereLogo,
	perplexity: PerplexityLogo,
	groq: GroqLogo,
	meta: MetaLogo,
	"meta-llama": MetaLogo,
	llama: MetaLogo,
	qwen: QwenLogo,
	alibaba: QwenLogo,
	openrouter: OpenRouterLogo,
	microsoft: MicrosoftLogo,
	phi: MicrosoftLogo,
	amazon: AWSLogo,
	aws: AWSLogo,
	bedrock: AWSLogo,
	ollama: OllamaLogo,
};

// Bare model ids (no "vendor/" prefix) → vendor, matched by well-known name
// patterns. Lets us resolve a logo from just `gemini-3.1-flash-lite`,
// `claude-sonnet-4-6`, `gpt-4o`, etc. when no provider is available.
const MODEL_ID_HINTS: [RegExp, string][] = [
	[/^(gpt|o[1-4]\b|o[1-4]-|chatgpt|text-|davinci)/, "openai"],
	[/^claude/, "claude"],
	[/^(gemini|gemma|palm|bison)/, "google"],
	[/^(mistral|mixtral|magistral|codestral|ministral|pixtral)/, "mistral"],
	[/^(llama|meta-llama)/, "meta"],
	[/^grok/, "xai"],
	[/^deepseek/, "deepseek"],
	[/^qwen/, "qwen"],
	[/^command/, "cohere"],
	[/^phi/, "microsoft"],
	[/^sonar/, "perplexity"],
];

// Brand accent per vendor, used to color charts/bars so a model's identity is
// consistent with its logo. Monochrome marks (grok) get a neutral tone.
const VENDOR_COLORS: Record<string, string> = {
	openai: "#10A37F",
	azure: "#10A37F",
	anthropic: "#D97757",
	claude: "#D97757",
	google: "#1BA1E3",
	"google-vertex": "#1BA1E3",
	"google-generative-ai": "#1BA1E3",
	vertex: "#1BA1E3",
	gemini: "#1BA1E3",
	mistral: "#EE792F",
	mistralai: "#EE792F",
	xai: "#9CA3AF",
	"x-ai": "#9CA3AF",
	grok: "#9CA3AF",
	deepseek: "#4D6BFE",
	cohere: "#39594D",
	perplexity: "#20808D",
	groq: "#F54F35",
	meta: "#0081FB",
	"meta-llama": "#0081FB",
	llama: "#0081FB",
	qwen: "#615CED",
	alibaba: "#615CED",
	openrouter: "#6566F1",
	microsoft: "#00A4EF",
	phi: "#00A4EF",
	amazon: "#FF9900",
	aws: "#FF9900",
	bedrock: "#FF9900",
	ollama: "#888888",
};

/** Resolve the canonical vendor key for a (provider, modelId) pair, or null. */
export function resolveVendorKey(
	provider?: string | null,
	modelId?: string | null,
): string | null {
	const id = modelId?.toLowerCase();
	// Prefer the vendor slug embedded in a "vendor/model" id, then a vendor
	// segment of a dot-namespaced Bedrock id ("us.anthropic.claude-…-v1:0" — the
	// model's own vendor must beat the "bedrock" provider), then the provider.
	const fromSlash = id?.includes("/") ? id.split("/")[0] : undefined;
	const fromDots = id?.includes(".")
		? id
				.split(".")
				.slice(0, -1)
				.find((segment) => LOGOS[segment])
		: undefined;
	const fromProvider = provider?.split(".")[0]?.toLowerCase();
	for (const key of [fromSlash, fromDots, fromProvider]) {
		if (key && LOGOS[key]) return key;
	}
	// Fall back to the model id's own name (e.g. a bare "gemini-3.1-flash-lite"),
	// also trying the last dotted segment so a namespaced id still gets a hint.
	if (id) {
		const tail = id.split(".").at(-1);
		for (const [pattern, vendor] of MODEL_ID_HINTS) {
			if ((pattern.test(id) || (tail && pattern.test(tail))) && LOGOS[vendor])
				return vendor;
		}
	}
	return null;
}

/** Resolve the brand logo for a (provider, modelId) pair, or null if unknown. */
export function resolveModelLogo(
	provider?: string | null,
	modelId?: string | null,
): Logo | null {
	const key = resolveVendorKey(provider, modelId);
	return key ? (LOGOS[key] ?? null) : null;
}

// Tokens that should keep a specific casing rather than being plain-title-cased.
const MODEL_WORD_CASE: Record<string, string> = {
	gpt: "GPT",
	chatgpt: "ChatGPT",
	llm: "LLM",
	ai: "AI",
	oss: "OSS",
	moe: "MoE",
	hd: "HD",
	tts: "TTS",
	vl: "VL",
	deepseek: "DeepSeek",
	openai: "OpenAI",
	xai: "xAI",
	qwq: "QwQ",
};

/**
 * Turn a raw model id into a human-friendly display name — a heuristic, not a
 * lookup, so unknown ids still come out reasonably titled. Examples:
 * "gemini-3.1-flash-lite" → "Gemini 3.1 Flash Lite",
 * "anthropic/claude-sonnet-4-6" → "Claude Sonnet 4.6",
 * "gpt-4o-mini" → "GPT-4o Mini", "deepseek-r1" → "DeepSeek R1".
 */
export function formatModelName(modelId?: string | null): string {
	if (!modelId) return "—";
	// Drop the vendor prefix ("anthropic/…").
	let id = modelId.includes("/")
		? modelId.slice(modelId.lastIndexOf("/") + 1)
		: modelId;
	// Bedrock ids ("us.anthropic.claude-haiku-4-5-…-v1:0"): drop the ":0" build
	// counter, keep only the model segment of the dotted namespace (guarded so a
	// version dot like "gpt-4.1" survives), and drop the "-v1" build suffix.
	const wasBedrock = /:\d+$/.test(id);
	id = id.replace(/:\d+$/, "");
	const lastDotSegment = id.split(".").at(-1);
	const isDotNamespaced =
		id.includes(".") && !!lastDotSegment && /^[a-z]/i.test(lastDotSegment);
	if (isDotNamespaced) id = lastDotSegment;
	if (wasBedrock || isDotNamespaced) id = id.replace(/-v\d+$/i, "");
	// Then any trailing date stamp (YYYY-MM-DD / YYYYMMDD / YYMMDD) or "-latest"
	// build pointer.
	id = id
		.replace(/[-@](\d{4}-\d{2}-\d{2}|\d{8}|\d{6})$/i, "")
		.replace(/-latest$/i, "");

	const parts = id.split(/[-_]/).filter(Boolean);
	// Merge runs of ≥2 consecutive pure-digit parts into a dotted version, so a
	// hyphenated "…-4-6" reads as "4.6".
	const tokens: string[] = [];
	for (let i = 0; i < parts.length; i++) {
		if (/^\d+$/.test(parts[i])) {
			const run = [parts[i]];
			while (i + 1 < parts.length && /^\d+$/.test(parts[i + 1]))
				run.push(parts[++i]);
			tokens.push(run.join("."));
		} else {
			tokens.push(parts[i]);
		}
	}

	const words = tokens.map((t) => {
		const cased = MODEL_WORD_CASE[t.toLowerCase()];
		if (cased) return cased;
		// Version / size token (starts with a digit): keep as-is, but uppercase a
		// params suffix like "70b" → "70B" (leave "4o" alone — it's not a size).
		if (/^\d/.test(t)) return t.replace(/(\d)b$/i, "$1B");
		// Word, possibly with a trailing version ("r1", "v3"): capitalize the lead.
		return t.charAt(0).toUpperCase() + t.slice(1);
	});

	// Keep the familiar "GPT-4o" hyphenation when a number follows the acronym.
	const out: string[] = [];
	for (const w of words) {
		if (out.at(-1) === "GPT" && /^\d/.test(w)) out[out.length - 1] = `GPT-${w}`;
		else out.push(w);
	}
	return out.join(" ");
}

/** Resolve a brand accent color for a (provider, modelId) pair, or null. */
export function modelBrandColor(
	provider?: string | null,
	modelId?: string | null,
): string | null {
	const key = resolveVendorKey(provider, modelId);
	return key ? (VENDOR_COLORS[key] ?? null) : null;
}

/**
 * Renders the brand logo for a model/provider, falling back to a neutral chip
 * icon when the vendor isn't recognized.
 */
export function ModelLogo({
	provider,
	modelId,
	className,
}: {
	provider?: string | null;
	modelId?: string | null;
	className?: string;
}) {
	const Logo = resolveModelLogo(provider, modelId);
	if (!Logo) {
		return (
			<IconCpu
				className={cn("size-4 text-muted-foreground", className)}
				aria-hidden
			/>
		);
	}
	return <Logo className={cn("size-4", className)} aria-hidden />;
}
