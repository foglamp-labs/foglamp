import {
	sendAlertEmail,
	sendInvitationEmail,
	sendMagicLinkEmail,
	sendQuotaWarningEmail,
} from "@foglamp/auth/email";
import {
	type ScoreRow,
	type SpanRow,
	insertScores,
	insertSpans,
} from "@foglamp/clickhouse";
// Dev-only test-data generator. Synthesizes realistic spans and inserts them
// straight into ClickHouse (same `spans` table ingest writes to), so the
// rollup materialized views — trace_summary, workflow_run_summary,
// metrics_by_minute — populate exactly as they would from real traffic. The
// surfacing UI (the Admin tab) is gated to development; these procedures stay
// project-access-checked so they're safe even against a production server.
import {
	type CostBreakdown,
	type CustomPrice,
	EMPTY_BREAKDOWN,
	type PricingTable,
	getPricingTable,
	priceSpan,
} from "@foglamp/cost";
import {
	type AlertFilters,
	alertEvent,
	alertRule,
	alertState,
} from "@foglamp/db/schema/alert";
import {
	type EvalConfig,
	type EvalFilters,
	type EvalModel,
	evalDefinition,
	evalJob,
	evalState,
} from "@foglamp/db/schema/eval";
import { member } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import { env } from "@foglamp/env/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

export const TEST_KINDS = [
	"bare",
	"agent",
	"workflow",
	"tool",
	"full",
	"mega",
	"ultra",
] as const;
export type TestKind = (typeof TEST_KINDS)[number];

// OpenRouter canonical ids (provider/model). Passed verbatim so they resolve
// against the pricing table without normalization guesswork; at runtime we keep
// only the ones actually present so cost computes instead of going null.
const CANDIDATE_MODELS = [
	"openai/gpt-4o-mini",
	"openai/gpt-4o",
	"anthropic/claude-3.5-sonnet",
	"anthropic/claude-3.5-haiku",
	"google/gemini-2.0-flash-001",
	"google/gemini-flash-1.5",
	"meta-llama/llama-3.3-70b-instruct",
	"mistralai/mistral-small",
	"deepseek/deepseek-chat",
	"x-ai/grok-2-1212",
];

function pickModels(table: PricingTable): string[] {
	const present = CANDIDATE_MODELS.filter((id) => table.has(id));
	return present.length > 0 ? present : CANDIDATE_MODELS;
}

// Tool names for synthetic tool spans (agentic loops). Embedding model for
// `embedding` spans — priced like an llm step if present in the table, else null.
const TOOL_NAMES = [
	"web_search",
	"fetch_url",
	"query_db",
	"run_code",
	"read_file",
	"vector_search",
	"calculator",
	"send_email",
];
const EMBEDDING_MODEL = "openai/text-embedding-3-small";

// Long, multi-turn conversations for the `mega` dataset so the trace-detail
// payload panes render realistic chat history instead of a one-line prompt.
// Each entry is a full message array (system + several user/assistant turns)
// plus the model's final reply.
type Conversation = {
	messages: { role: "system" | "user" | "assistant"; content: string }[];
	reply: string;
};
const CONVERSATIONS: Conversation[] = [
	{
		messages: [
			{
				role: "system",
				content:
					"You are Foglamp's support assistant. Be concise, cite docs when relevant, and never fabricate API names.",
			},
			{
				role: "user",
				content:
					"Hey — we just wired up the SDK but our spans aren't showing up in the dashboard. We're calling traceName() on every request. What are we missing?",
			},
			{
				role: "assistant",
				content:
					"A few common causes: (1) the exporter is buffering and your process exits before flush — call `await foglamp.shutdown()` on teardown; (2) the API key is scoped to a different project; (3) the ingest endpoint is being blocked by an egress proxy. Which environment is this — local, staging, or prod?",
			},
			{
				role: "user",
				content:
					"It's a serverless function on prod. Short-lived. So probably the flush thing?",
			},
			{
				role: "assistant",
				content:
					"Almost certainly. In serverless the runtime can freeze the process the moment your handler returns, dropping anything still in the buffer.",
			},
			{
				role: "user",
				content:
					"Okay. How do I flush without adding latency to every request? We're at ~2k rps.",
			},
		],
		reply:
			"You have two good options. First, set `flushOnExit: true` and register the SDK's handler so it drains on the platform's shutdown signal rather than per-request — zero added latency on the hot path. Second, if your platform supports `waitUntil()` (Vercel, Cloudflare Workers), pass `foglamp.flush()` to it so the flush runs after the response is sent. Avoid awaiting flush inside the handler at 2k rps — that serializes a network round-trip into your latency budget. For belt-and-suspenders, also lower `maxBatchAgeMs` to ~1000 so buffered spans never sit longer than a second. With either approach your spans will land within a second or two of the request completing.",
	},
	{
		messages: [
			{
				role: "system",
				content:
					"You are a research agent. Decompose the question, gather evidence, and answer with a short synthesis.",
			},
			{
				role: "user",
				content:
					"Compare the cost of running our summarization workload on gpt-4o-mini vs claude-3.5-haiku vs gemini-2.0-flash. Assume ~1.2M input tokens and 300k output tokens per day.",
			},
			{
				role: "assistant",
				content:
					"Let me pull current per-1M pricing for each, then compute daily and monthly totals at your volume.",
			},
			{
				role: "user",
				content:
					"Also factor in that about 40% of our input is cacheable (same system prompt + retrieved context).",
			},
			{
				role: "assistant",
				content:
					"Good — cache reads are billed at a fraction of the input rate, so a 40% cache-hit rate meaningfully changes the ranking. Computing both the naive and cache-adjusted numbers.",
			},
			{
				role: "user",
				content: "Great, give me the bottom line plus a recommendation.",
			},
		],
		reply:
			"Bottom line at 1.2M in / 300k out per day, with 40% of input served from cache:\n\n• gpt-4o-mini — ~$0.34/day input (cache-adjusted) + ~$0.18/day output ≈ $0.52/day (~$15.6/mo)\n• claude-3.5-haiku — ~$0.58/day + ~$0.30/day ≈ $0.88/day (~$26.4/mo)\n• gemini-2.0-flash — ~$0.11/day + ~$0.09/day ≈ $0.20/day (~$6/mo)\n\nRecommendation: if quality is acceptable, gemini-2.0-flash is ~3x cheaper than gpt-4o-mini for this profile. But for summarization specifically, gpt-4o-mini tends to hold structure better on long inputs — I'd A/B the two with your relevance eval before committing, since the absolute spend is small enough that quality should drive the call.",
	},
	{
		messages: [
			{
				role: "system",
				content: "You triage incoming support tickets and route them.",
			},
			{
				role: "user",
				content:
					"Ticket #4821: 'Billing charged me twice this month and I can't reach anyone. This is the third time. Considering disputing with my bank.' — classify severity and route.",
			},
			{
				role: "assistant",
				content:
					"This is high severity: duplicate charge (financial impact), repeat occurrence (third time), and explicit churn/chargeback risk. Sentiment is strongly negative.",
			},
			{
				role: "user",
				content: "Who should it go to, and what's the suggested first reply?",
			},
		],
		reply:
			'Route to: Billing escalations queue, flagged P1, with a copy to the account\'s CSM given the churn signal. Suggested first reply: "I\'m really sorry — a double charge three months running is not acceptable, and I\'ve escalated this as a priority. I can see the duplicate on [date]; I\'m issuing the refund now and it should clear in 3–5 business days. To make sure this stops recurring, I\'m also having our billing team audit the subscription on your account today and I\'ll personally follow up with what they find by tomorrow." Tag: billing, duplicate-charge, churn-risk, chargeback-threat.',
	},
	{
		messages: [
			{
				role: "system",
				content:
					"You are a coding assistant embedded in an observability platform.",
			},
			{
				role: "user",
				content:
					"Our p99 latency on the ingest endpoint jumped from 80ms to 1.4s starting around 2am. No deploys went out. Where do I even start?",
			},
			{
				role: "assistant",
				content:
					"Start by separating 'slow to accept' from 'slow downstream'. Check: (1) did ingest volume spike at 2am — a batch backfill or a retrying client? (2) is the p99 concentrated on one project/org or spread evenly? (3) ClickHouse insert latency — is the async insert queue backing up? Pull those three and we'll narrow it fast.",
			},
			{
				role: "user",
				content:
					"Volume roughly doubled at 2am and stayed there. p99 is concentrated on one org. ClickHouse insert latency is normal.",
			},
			{
				role: "assistant",
				content:
					"That points away from your storage layer and toward a single noisy tenant. Doubled volume from one org, normal CH latency, no deploy — likely a client of theirs started sending oversized batches or unbounded payloads that are expensive to parse/validate.",
			},
			{
				role: "user",
				content: "How do I confirm and contain it without blocking them entirely?",
			},
		],
		reply:
			"Confirm: group ingest spans for that org by payload size and span-count-per-batch over the last 6h — you'll likely see a step change at 2am toward huge batches. Also check whether one of their API keys accounts for the bulk. To contain without a hard block: apply a per-org rate limit / max-batch-size at the edge (return 429 with Retry-After so well-behaved clients back off), and queue rather than reject if you can absorb it. Then reach out to the org — this is usually an accidental loop or a backfill they didn't throttle. Longer term, make per-tenant payload-size and rate limits a default so one client can't degrade shared p99.",
	},
	{
		messages: [
			{
				role: "system",
				content: "You extract structured data from unstructured documents.",
			},
			{
				role: "user",
				content:
					"Pull the parties, effective date, term length, and termination notice period from this MSA excerpt: 'This Master Services Agreement is entered into as of March 3, 2025 by and between Acme Cloud Inc. and Northwind Analytics LLC. The initial term shall be twenty-four (24) months, automatically renewing for successive twelve (12) month periods unless either party provides written notice of non-renewal at least sixty (60) days prior to the end of the then-current term.'",
			},
		],
		reply:
			'{\n  "parties": ["Acme Cloud Inc.", "Northwind Analytics LLC"],\n  "effective_date": "2025-03-03",\n  "initial_term_months": 24,\n  "auto_renew": true,\n  "renewal_term_months": 12,\n  "termination_notice_days": 60,\n  "notice_form": "written"\n}',
	},
];

// ---------------------------------------------------------------------------
// Ultra dataset extras — the `ultra` kind is a maximalist showcase that
// exercises *every* span/cost dimension and surfacing feature the platform has:
// the latest frontier models (priced via custom overrides so cost computes even
// before they land in the live OpenRouter table), reasoning/thinking tokens,
// prompt-cache reads + writes, vision (image) inputs, server-side web search,
// multi-request spans, rich tool catalogs, deep multi-turn conversations, a
// broad eval suite (code + llm judges, score/passed/label), and seeded alert
// rules with firing history.

// A frontier model with custom per-dimension pricing + the capabilities it can
// exercise on a span. Prices are per-token decimal strings (per-unit for
// image/webSearch/request), matching the OpenRouter price shape.
type UltraModel = {
	id: string; // OpenRouter-style provider/model id
	price: CustomPrice;
	reasoning?: boolean; // emits internal-reasoning ("thinking") tokens
	vision?: boolean; // accepts image inputs (priced per image)
	cache?: boolean; // supports prompt-cache reads + writes
	search?: boolean; // performs server-side web search (priced per call)
};

// Latest (mid-2026) frontier line-up. Ids are passed verbatim and priced from
// the `price` override below, so the dataset shows real cost regardless of what
// the live pricing table happens to carry.
const ULTRA_MODELS: UltraModel[] = [
	{
		id: "openai/gpt-5.5",
		price: {
			prompt: "0.00000125",
			completion: "0.00001",
			cacheRead: "0.000000125",
			cacheWrite: "0.0000015625",
			internalReasoning: "0.00001",
		},
		reasoning: true,
		vision: true,
		cache: true,
	},
	{
		id: "openai/gpt-5.5-mini",
		price: {
			prompt: "0.00000025",
			completion: "0.000002",
			cacheRead: "0.000000025",
			cacheWrite: "0.0000003125",
			internalReasoning: "0.000002",
		},
		reasoning: true,
		vision: true,
		cache: true,
	},
	{
		id: "openai/o4",
		price: {
			prompt: "0.0000022",
			completion: "0.0000088",
			internalReasoning: "0.0000088",
		},
		reasoning: true,
	},
	{
		id: "anthropic/claude-opus-4.8",
		price: {
			prompt: "0.000005",
			completion: "0.000025",
			cacheRead: "0.0000005",
			cacheWrite: "0.00000625",
			internalReasoning: "0.000025",
		},
		reasoning: true,
		vision: true,
		cache: true,
	},
	{
		id: "anthropic/claude-sonnet-4.6",
		price: {
			prompt: "0.000003",
			completion: "0.000015",
			cacheRead: "0.0000003",
			cacheWrite: "0.00000375",
			internalReasoning: "0.000015",
		},
		reasoning: true,
		vision: true,
		cache: true,
	},
	{
		id: "anthropic/claude-haiku-4.5",
		price: {
			prompt: "0.000001",
			completion: "0.000005",
			cacheRead: "0.0000001",
			cacheWrite: "0.00000125",
		},
		vision: true,
		cache: true,
	},
	{
		id: "google/gemini-3.1-pro",
		price: {
			prompt: "0.00000125",
			completion: "0.00001",
			cacheRead: "0.000000125",
			internalReasoning: "0.00001",
			webSearch: "0.035",
		},
		reasoning: true,
		vision: true,
		cache: true,
		search: true,
	},
	{
		id: "google/gemini-3.1-flash",
		price: {
			prompt: "0.0000003",
			completion: "0.0000025",
			cacheRead: "0.00000003",
			webSearch: "0.035",
		},
		vision: true,
		cache: true,
		search: true,
	},
	{
		id: "google/gemini-3.1-flash-lite",
		price: {
			prompt: "0.0000001",
			completion: "0.0000004",
			cacheRead: "0.00000001",
		},
		vision: true,
		cache: true,
	},
	{
		id: "x-ai/grok-4",
		price: {
			prompt: "0.000003",
			completion: "0.000015",
			cacheRead: "0.00000075",
			webSearch: "0.025",
		},
		reasoning: true,
		vision: true,
		search: true,
	},
	{
		id: "deepseek/deepseek-v3.2",
		price: {
			prompt: "0.00000028",
			completion: "0.00000042",
			cacheRead: "0.000000028",
		},
		reasoning: true,
		cache: true,
	},
	{
		id: "meta-llama/llama-4-maverick",
		price: { prompt: "0.0000002", completion: "0.0000006" },
		vision: true,
	},
	{
		id: "mistralai/mistral-large-3",
		price: { prompt: "0.000002", completion: "0.000006" },
	},
	{
		id: "qwen/qwen3-max",
		price: { prompt: "0.0000012", completion: "0.000006" },
		reasoning: true,
	},
	{
		id: "perplexity/sonar-pro-3",
		price: {
			prompt: "0.000003",
			completion: "0.000015",
			request: "0.005",
			webSearch: "0.005",
		},
		search: true,
	},
];

// A newer retrieval embedding for the ultra dataset, priced via override so the
// embedding spans carry cost too.
const ULTRA_EMBEDDING = {
	id: "openai/text-embedding-4-large",
	provider: "openai",
	price: { prompt: "0.00000013" } as CustomPrice,
};

// Tool catalog: name → human description, surfaced on llm spans as `tool_catalog`
// (the model's advertised toolset) and consumed by the tool-selection eval.
const TOOL_DESCRIPTIONS: Record<string, string> = {
	web_search: "Search the public web and return ranked result snippets.",
	fetch_url: "Fetch a URL and extract its readable main content.",
	query_db: "Run a read-only SQL query against the analytics warehouse.",
	run_code: "Execute a Python snippet in a sandbox and return stdout.",
	read_file: "Read a file from the connected repository.",
	vector_search: "Semantic search over the project's embedded documents.",
	calculator: "Evaluate an arithmetic or symbolic expression.",
	send_email: "Send a templated email to a recipient.",
	create_ticket: "Open a ticket in the issue tracker with a title and body.",
	schedule_event: "Create a calendar event for the user.",
	search_docs: "Search the product documentation corpus.",
	summarize: "Summarize a long document into key bullet points.",
	translate: "Translate text between two languages.",
	image_gen: "Generate an image from a text prompt.",
	get_weather: "Look up the current weather for a location.",
	http_request: "Make an authenticated HTTP request to an internal service.",
};
const ULTRA_TOOLS = Object.keys(TOOL_DESCRIPTIONS);

// Build a `tool_catalog` JSON object ({name: {description}}) from tool names —
// the shape the trace-detail "Tools available" pane and the tool-selection eval
// expect.
function buildToolCatalog(names: string[]): string {
	const catalog: Record<string, { description: string }> = {};
	for (const name of new Set(names)) {
		catalog[name] = {
			description: TOOL_DESCRIPTIONS[name] ?? `Invoke the ${name} tool.`,
		};
	}
	return JSON.stringify(catalog);
}

// Reference answers (for the correctness-vs-reference eval, read from metadata)
// used by a slice of the ultra one-off traces.
const ULTRA_REFERENCES = [
	"The agreement renews automatically in 12-month terms with 60 days' notice.",
	"Sentiment: negative; intent: cancel; priority: P1.",
	"Net revenue retention was 118% in Q2, up from 112% in Q1.",
	"The outage was caused by connection-pool exhaustion on the primary.",
	"Translated faithfully with all named entities preserved.",
];

// Extra, more complex multi-turn conversations layered on top of CONVERSATIONS
// for the ultra dataset: reasoning/math, vision, tool-use planning, a long
// incident post-mortem, and a code review — so trace payloads read like real
// frontier-model chats.
const ULTRA_CONVERSATIONS: Conversation[] = [
	{
		messages: [
			{
				role: "system",
				content:
					"You are a quantitative reasoning assistant. Show the key steps, then give the final answer on its own line.",
			},
			{
				role: "user",
				content:
					"A subscription cohort starts at 4,200 users. Monthly logo churn is 3.5%, but we also win back 0.8% of churned users each month. Net of both, roughly how many users remain after 12 months, and what's the effective monthly retention?",
			},
			{
				role: "assistant",
				content:
					"Effective monthly net churn ≈ 3.5% − 0.8% = 2.7%, so monthly retention ≈ 0.973. Compounding over 12 months: 0.973^12.",
			},
			{
				role: "user",
				content: "Walk me through the compounding and give the headcount.",
			},
		],
		reply:
			"0.973^12 ≈ 0.719, so about 71.9% of the cohort remains.\n\n4,200 × 0.719 ≈ 3,020 users after 12 months.\n\nFinal answer: ~3,020 users remaining, ~97.3% effective monthly retention (~71.9% annual).",
	},
	{
		messages: [
			{
				role: "system",
				content:
					"You are a multimodal analyst. The user attaches a chart image; describe what it shows and extract the numbers you can read.",
			},
			{
				role: "user",
				content:
					"[image attached: a line chart titled 'Daily p95 latency (ms)'] What's the trend, and where's the anomaly?",
			},
			{
				role: "assistant",
				content:
					"The series sits around 180–220 ms for most of the window, then spikes sharply to ~1,150 ms on the 14th before recovering to baseline by the 16th. The spike is a clear anomaly — roughly 5–6× the median.",
			},
			{
				role: "user",
				content:
					"Anything in the shape that suggests a cause rather than just a blip?",
			},
		],
		reply:
			"Two clues from the shape: the rise is a step rather than a gradual ramp, and it plateaus rather than oscillating — that pattern usually means a saturated resource (a full connection pool or a pegged CPU) rather than load-driven contention, which would track request volume more smoothly. The clean recovery to the prior baseline suggests a restart or a config rollback fixed it rather than the load simply receding. I'd correlate the plateau window against deploys and pool-utilization metrics first.",
	},
	{
		messages: [
			{
				role: "system",
				content:
					"You are an autonomous agent with tools: vector_search, query_db, run_code, fetch_url. Plan before acting; call tools only when needed.",
			},
			{
				role: "user",
				content:
					"Find out which of our customers on the Growth plan had a usage spike last week and draft a short heads-up note for their CSMs.",
			},
			{
				role: "assistant",
				content:
					"Plan: (1) query_db for Growth-plan accounts and their week-over-week usage delta; (2) filter to spikes above a threshold; (3) run_code to rank and format; (4) draft per-account notes. Starting with the query.",
			},
			{
				role: "user",
				content: "Use a 40% week-over-week increase as the spike threshold.",
			},
		],
		reply:
			'Done. Three Growth-plan accounts crossed the 40% threshold: Northwind (+62%), Initech (+48%), and Hooli (+41%). Draft note for CSMs:\n\n"Heads up — {account} increased usage {pct}% week-over-week, well above the Growth-plan baseline. This is often a good moment to check in: it can signal a new workload worth a capacity/pricing conversation, or an unintended loop worth catching early. Their current run-rate would put them at ~{projected} next month. Suggested touch: a short proactive email today."',
	},
	{
		messages: [
			{
				role: "system",
				content:
					"You are an incident commander assistant. Keep a running timeline and end with concrete follow-ups.",
			},
			{
				role: "user",
				content:
					"We had a 38-minute partial outage on ingest last night. Symptoms: 5xx rate climbed to ~12%, p99 to 4s, recovered after a deploy rollback. Help me write the post-mortem.",
			},
			{
				role: "assistant",
				content:
					"Let's anchor the timeline first. When did the 5xx rate start climbing, when was the rollback initiated, and when did metrics return to baseline? And was the bad deploy a code change, a config change, or a dependency bump?",
			},
			{
				role: "user",
				content:
					"Climb started 01:12, rollback at 01:40, baseline by 01:50. The deploy bumped the ClickHouse client library.",
			},
			{
				role: "assistant",
				content:
					"So the trigger is a dependency bump to the ClickHouse client, and time-to-mitigate was ~28 minutes from onset to rollback. That suggests the new client changed connection or timeout defaults under load.",
			},
			{
				role: "user",
				content:
					"Right. Give me the full write-up with root cause and action items.",
			},
		],
		reply:
			"# Post-mortem: Ingest partial outage (38 min)\n\n**Impact:** ~12% of ingest requests returned 5xx; p99 latency peaked ~4s. No data loss (clients retried; spans landed after recovery).\n\n**Timeline:**\n- 01:12 — 5xx rate begins climbing after deploy bumping the ClickHouse client library.\n- 01:30 — On-call paged on error-rate alert.\n- 01:40 — Deploy rolled back.\n- 01:50 — Metrics return to baseline.\n\n**Root cause:** The new ClickHouse client shipped a lower default socket/connection timeout and a smaller pool ceiling. Under normal nightly load the pool saturated, queries queued past the timeout, and ingest handlers returned 5xx.\n\n**Why it wasn't caught:** Staging load doesn't reach the pool ceiling, so the regression was invisible pre-prod.\n\n**Action items:**\n1. Pin and explicitly configure the CH client's pool size + timeouts rather than inheriting library defaults. (owner: platform)\n2. Add a load test that drives the pool to saturation in CI. (owner: platform)\n3. Add a pool-utilization panel + alert at 80% saturation. (owner: observability)\n4. Make ingest shed load to a queue instead of 5xx-ing when CH is slow. (owner: ingest)",
	},
	{
		messages: [
			{
				role: "system",
				content:
					"You are a senior code reviewer. Be specific, cite the risk, and suggest the minimal fix.",
			},
			{
				role: "user",
				content:
					"Review this: `const total = items.reduce((a, b) => a + b.price * b.qty, 0); cache.set(key, total);` — it's in a hot path called ~3k/s.",
			},
			{
				role: "assistant",
				content:
					"Two things stand out at 3k/s: (1) is `cache.set` doing a network round-trip on every call? If so you're serializing a write into the hot path. (2) floating-point money — `price * qty` in floats will drift. What's `price`'s type and is the cache local or remote?",
			},
			{
				role: "user",
				content: "price is a float dollar amount, and cache is Redis (remote).",
			},
		],
		reply:
			"Two concrete fixes:\n\n1. **Money in floats** — `b.price * b.qty` summed in float will accumulate rounding error and can produce values like 19.999999998. Compute in integer cents (`Math.round(price*100)*qty`, sum, divide at the end) or use a decimal type. This is a correctness bug, not a style nit.\n\n2. **Remote write on the hot path** — a synchronous Redis `set` on every one of 3k/s calls adds a round-trip to your latency budget and hammers Redis. Either (a) write-behind: batch/debounce the `set` (e.g. coalesce per key over ~250ms), or (b) only refresh the cache when the inputs change (dirty-flag) rather than recomputing-and-setting unconditionally. If the value is cheap to compute, consider dropping the remote cache here entirely — the round-trip likely costs more than the `reduce`.",
	},
];

// Mega's conversations plus the richer ultra-only set.
const ULTRA_ALL_CONVERSATIONS: Conversation[] = [
	...CONVERSATIONS,
	...ULTRA_CONVERSATIONS,
];

const rnd = (min: number, max: number) =>
	Math.floor(min + Math.random() * (max - min));
const pick = <T>(arr: T[]): T => arr[rnd(0, arr.length)]!;

// Synthesize plausible intra-stream samples for seed data: cumulative tokens
// from first-token (ttft) to step end, with mild per-interval jitter so the
// TPS curve isn't a flat line. Mirrors the SDK's [offsetMs, cumTokens] arrays.
function synthChunks(
	ttftMs: number,
	durationMs: number,
	outputTokens: number,
): { offsets: number[]; tokens: number[] } {
	if (outputTokens <= 0 || durationMs - ttftMs < 50)
		return { offsets: [], tokens: [] };
	const steps = Math.min(20, Math.max(4, Math.round(outputTokens / 25)));
	const span = durationMs - ttftMs;
	const offsets: number[] = [];
	const tokens: number[] = [];
	let acc = 0;
	const weights = Array.from(
		{ length: steps },
		() => 0.6 + Math.random() * 0.8,
	);
	const totalWeight = weights.reduce((a, b) => a + b, 0);
	for (let i = 0; i < steps; i++) {
		acc += weights[i]!;
		offsets.push(Math.round(ttftMs + (span * (i + 1)) / steps));
		tokens.push(Math.round((acc / totalWeight) * outputTokens));
	}
	tokens[tokens.length - 1] = outputTokens; // anchor the final cumulative count
	return { offsets, tokens };
}

function costCols(c: CostBreakdown) {
	return {
		prompt_cost: c.promptCost,
		completion_cost: c.completionCost,
		request_cost: c.requestCost,
		image_cost: c.imageCost,
		web_search_cost: c.webSearchCost,
		internal_reasoning_cost: c.internalReasoningCost,
		cache_read_cost: c.cacheReadCost,
		cache_write_cost: c.cacheWriteCost,
		total_cost: c.totalCost,
	};
}

function emptyRow(projectId: string, orgId: string, start: number): SpanRow {
	return {
		project_id: projectId,
		org_id: orgId,
		retention_days: 30,
		trace_id: "",
		span_id: "",
		parent_span_id: "",
		span_type: "agent",
		name: "",
		start_time: start,
		end_time: start,
		duration_ms: 0,
		status: "ok",
		error_message: "",
		provider: "",
		model_id: "",
		priced_model_id: "",
		input_tokens: 0,
		output_tokens: 0,
		total_tokens: 0,
		reasoning_tokens: 0,
		cached_input_tokens: 0,
		cache_write_input_tokens: 0,
		image_count: 0,
		web_search_count: 0,
		request_count: 0,
		ttft_ms: null,
		chunk_offsets: [],
		chunk_tokens: [],
		...costCols(EMPTY_BREAKDOWN),
		pricing_source: "",
		priced_at: null,
		trace_name: "",
		agent_name: "",
		workflow_name: "",
		workflow_run_id: "",
		session_id: "",
		metadata: {},
		input: "",
		output: "",
		tool_catalog: "",
	};
}

type TraceCtx = {
	projectId: string;
	orgId: string;
	table: PricingTable;
	now: number;
	rows: SpanRow[];
	// Ultra-only: per-model capability + custom-pricing lookup. When set, llm
	// steps whose model is in the map emit the extra usage dimensions the model
	// supports (reasoning, cache, vision, web search) and price from the override.
	ultra?: Map<string, UltraModel>;
	// Ultra-only: override the retrieval embedding model (+ its custom price).
	embeddingModel?: { id: string; provider: string; price?: CustomPrice };
};

/**
 * Build one trace: a root "agent" span plus the given child steps. Each LLM
 * step is priced; tool steps carry input/output but no cost.
 */
function makeTrace(
	c: TraceCtx,
	opts: {
		startedAgo: number; // ms before now the trace started
		traceName?: string;
		agentName?: string;
		workflowName?: string;
		workflowRunId?: string;
		sessionId?: string;
		models: string[]; // one llm step per entry
		tools?: string[]; // tool spans: interleaved after each step, extras appended
		withEmbedding?: boolean; // prepend an `embedding` span (RAG-style retrieval)
		error?: boolean;
		conversation?: Conversation; // long multi-turn input/output for llm steps
		metadata?: Record<string, string>;
		toolCatalog?: string[]; // tool names advertised to the model → `tool_catalog` on llm spans
	},
) {
	const traceId = uuidv7();
	const start = c.now - opts.startedAgo;
	const meta = opts.metadata ?? {};
	let cursor = start;
	const children: SpanRow[] = [];

	// A tool span (unpriced) advancing the cursor; used for agentic tool loops.
	const pushTool = (name: string) => {
		const tdur = rnd(80, 600);
		const tStart = cursor;
		const tEnd = tStart + tdur;
		cursor = tEnd;
		children.push({
			...emptyRow(c.projectId, c.orgId, tStart),
			trace_id: traceId,
			span_id: `${traceId}:tool:${uuidv7()}`,
			parent_span_id: `${traceId}:root`,
			span_type: "tool",
			name,
			start_time: tStart,
			end_time: tEnd,
			duration_ms: tdur,
			status: "ok",
			trace_name: opts.traceName ?? "",
			agent_name: opts.agentName ?? "",
			workflow_name: opts.workflowName ?? "",
			workflow_run_id: opts.workflowRunId ?? "",
			session_id: opts.sessionId ?? "",
			metadata: meta,
			input: JSON.stringify({ tool: name, args: { q: "foglamp" } }),
			output: JSON.stringify({ ok: true, results: rnd(1, 9) }),
		});
	};

	// Optional retrieval embedding before the first model step.
	if (opts.withEmbedding) {
		const embedModel = c.embeddingModel?.id ?? EMBEDDING_MODEL;
		const embedProvider = c.embeddingModel?.provider ?? "openai";
		const edur = rnd(40, 300);
		const eStart = cursor;
		cursor = eStart + edur;
		const eInput = rnd(200, 2000);
		const ePriced = priceSpan({
			table: c.table,
			provider: embedProvider,
			modelId: embedModel,
			custom: c.embeddingModel?.price,
			usage: {
				inputTokens: eInput,
				outputTokens: 0,
				totalTokens: eInput,
				reasoningTokens: 0,
				cachedInputTokens: 0,
				cacheWriteInputTokens: 0,
				imageCount: 0,
				webSearchCount: 0,
				requestCount: 1,
			},
		});
		children.push({
			...emptyRow(c.projectId, c.orgId, eStart),
			trace_id: traceId,
			span_id: `${traceId}:embed`,
			parent_span_id: `${traceId}:root`,
			span_type: "embedding",
			name: `embed (${embedModel})`,
			start_time: eStart,
			end_time: cursor,
			duration_ms: edur,
			status: "ok",
			provider: embedProvider,
			model_id: embedModel,
			priced_model_id: ePriced.resolvedId || embedModel,
			input_tokens: eInput,
			total_tokens: eInput,
			request_count: 1,
			...costCols(ePriced.costs),
			pricing_source: ePriced.source ?? "",
			priced_at: ePriced.source ? c.now : null,
			trace_name: opts.traceName ?? "",
			agent_name: opts.agentName ?? "",
			workflow_name: opts.workflowName ?? "",
			workflow_run_id: opts.workflowRunId ?? "",
			session_id: opts.sessionId ?? "",
			metadata: meta,
			input: JSON.stringify(["chunk to embed"]),
			output: "",
		});
	}

	const convo = opts.conversation;
	// The model's advertised toolset (ultra only) — surfaced on each llm span.
	const toolCatalogJson =
		opts.toolCatalog && opts.toolCatalog.length > 0
			? buildToolCatalog(opts.toolCatalog)
			: "";
	let stepIndex = 0;
	for (const modelId of opts.models) {
		const provider = modelId.split("/")[0]!;
		// Capability + custom-pricing entry for this model (ultra dataset only).
		const um = c.ultra?.get(modelId);
		// Long conversations carry far more context (system prompt + retrieved
		// docs + many turns), so scale token counts up to match the payload.
		const inputTokens = convo ? rnd(2400, 14000) : rnd(400, 3200);
		const outputTokens = convo ? rnd(350, 2400) : rnd(80, 900);
		// Reasoning ("thinking") tokens are a subset of output, billed separately
		// when the model lists an internal-reasoning price.
		const reasoningTokens =
			um?.reasoning && Math.random() < 0.7
				? Math.floor(outputTokens * (0.3 + Math.random() * 0.4))
				: 0;
		// Cache-capable models read a chunk of input from cache and occasionally
		// pay to write a fresh prefix into it.
		const cachedInputTokens = um
			? um.cache && Math.random() < 0.6
				? rnd(0, Math.floor(inputTokens * 0.8))
				: 0
			: Math.random() < 0.5
				? rnd(0, inputTokens)
				: 0;
		const cacheWriteInputTokens =
			um?.cache && Math.random() < 0.35 ? rnd(400, 4000) : 0;
		// Vision models occasionally take image inputs; search models occasionally
		// run server-side web searches; a few calls are retried/batched (>1 req).
		const imageCount = um?.vision && Math.random() < 0.45 ? rnd(1, 5) : 0;
		const webSearchCount = um?.search && Math.random() < 0.4 ? rnd(1, 4) : 0;
		const requestCount = um && Math.random() < 0.12 ? rnd(2, 4) : 1;
		const usage = {
			inputTokens,
			outputTokens,
			totalTokens: inputTokens + outputTokens,
			reasoningTokens,
			cachedInputTokens,
			cacheWriteInputTokens,
			imageCount,
			webSearchCount,
			requestCount,
		};
		const priced = priceSpan({
			table: c.table,
			provider,
			modelId,
			custom: um?.price,
			usage,
		});
		const dur = rnd(300, 4000);
		const stepStart = cursor;
		const stepEnd = stepStart + dur;
		cursor = stepEnd;
		const isLastStep = stepIndex === opts.models.length - 1;
		const stepErr = opts.error === true && isLastStep;
		const ttft = Math.round(dur * (0.25 + Math.random() * 0.4));
		const chunks = stepErr
			? { offsets: [], tokens: [] }
			: synthChunks(ttft, dur, usage.outputTokens);

		children.push({
			...emptyRow(c.projectId, c.orgId, stepStart),
			trace_id: traceId,
			span_id: `${traceId}:step:${stepIndex}`,
			parent_span_id: `${traceId}:root`,
			span_type: "llm",
			name: `generate (${modelId})`,
			start_time: stepStart,
			end_time: stepEnd,
			duration_ms: dur,
			status: stepErr ? "error" : "ok",
			error_message: stepErr ? "Upstream model returned 529 (overloaded)" : "",
			provider,
			model_id: modelId,
			priced_model_id: priced.resolvedId || modelId,
			input_tokens: usage.inputTokens,
			output_tokens: usage.outputTokens,
			total_tokens: usage.totalTokens,
			reasoning_tokens: usage.reasoningTokens,
			cached_input_tokens: usage.cachedInputTokens,
			cache_write_input_tokens: usage.cacheWriteInputTokens,
			image_count: usage.imageCount,
			web_search_count: usage.webSearchCount,
			request_count: usage.requestCount,
			ttft_ms: ttft,
			chunk_offsets: chunks.offsets,
			chunk_tokens: chunks.tokens,
			...costCols(priced.costs),
			pricing_source: priced.source ?? "",
			priced_at: priced.source ? c.now : null,
			trace_name: opts.traceName ?? "",
			agent_name: opts.agentName ?? "",
			workflow_name: opts.workflowName ?? "",
			workflow_run_id: opts.workflowRunId ?? "",
			session_id: opts.sessionId ?? "",
			metadata: meta,
			input: convo
				? JSON.stringify(convo.messages)
				: JSON.stringify([{ role: "user", content: "What is Foglamp?" }]),
			output: stepErr
				? ""
				: convo
					? convo.reply
					: "Foglamp is an observability platform for AI agents.",
			tool_catalog: toolCatalogJson,
		});
		stepIndex += 1;

		// Interleave a tool call after this step (model → tool → model → tool …).
		const tool = opts.tools?.[stepIndex - 1];
		if (tool) pushTool(tool);
	}

	// Any tools beyond the step count fire after the last step (tool-heavy loop).
	if (opts.tools) {
		for (let i = opts.models.length; i < opts.tools.length; i += 1) {
			pushTool(opts.tools[i]!);
		}
	}

	const end = cursor;
	// Root agent span spans the whole trace; it is unpriced (cost lives on llm
	// spans to avoid double-counting in the rollups).
	c.rows.push({
		...emptyRow(c.projectId, c.orgId, start),
		trace_id: traceId,
		span_id: `${traceId}:root`,
		parent_span_id: "",
		span_type: "agent",
		name: opts.traceName ?? opts.agentName ?? "generateText",
		start_time: start,
		end_time: end,
		duration_ms: end - start,
		status: opts.error ? "error" : "ok",
		trace_name: opts.traceName ?? "",
		agent_name: opts.agentName ?? "",
		workflow_name: opts.workflowName ?? "",
		workflow_run_id: opts.workflowRunId ?? "",
		session_id: opts.sessionId ?? "",
		metadata: meta,
	});
	c.rows.push(...children);
	return traceId;
}

const DAY_MS = 24 * 60 * 60_000;

// mega dataset: 400+ traces across the last 2 weeks. Builds clustered workflow
// runs (members ordered in time around the run start) plus a long tail of
// standalone agents and named one-off calls, with long conversations, tool
// loops, embeddings, and errors mixed throughout.
function buildMega(c: TraceCtx, models: string[]) {
	const SPAN_MS = 14 * DAY_MS; // 2 weeks
	const agents = [
		"support-bot",
		"researcher",
		"summarizer",
		"classifier",
		"router",
		"sql-analyst",
		"code-reviewer",
		"doc-qa",
	];
	const oneOffNames = [
		"summarize-email",
		"classify-ticket",
		"extract-entities",
		"translate-doc",
		"moderate-content",
		"generate-title",
		"detect-language",
		"rerank-results",
	];
	// A handful of distinct workflows, each a sequence of steps. Early steps are
	// agents; the trailing steps are plain named one-offs in the same run.
	const workflowDefs = [
		{
			name: "nightly-digest",
			steps: [
				{ kind: "agent", name: "retriever", embed: true, tools: ["vector_search"] },
				{ kind: "agent", name: "summarizer", convo: true },
				{ kind: "agent", name: "writer" },
				{ kind: "named", name: "fetch-sources", tools: ["fetch_url", "fetch_url"] },
				{ kind: "named", name: "publish-digest", tools: ["send_email"] },
			],
		},
		{
			name: "ticket-triage",
			steps: [
				{ kind: "agent", name: "classifier", convo: true },
				{ kind: "agent", name: "router", tools: ["query_db"] },
				{ kind: "named", name: "draft-reply", convo: true },
			],
		},
		{
			name: "doc-pipeline",
			steps: [
				{ kind: "named", name: "chunk-doc" },
				{ kind: "agent", name: "embedder", embed: true },
				{ kind: "named", name: "index-chunks", tools: ["vector_search", "query_db"] },
				{ kind: "agent", name: "doc-qa", convo: true, embed: true },
			],
		},
		{
			name: "code-review-bot",
			steps: [
				{ kind: "agent", name: "code-reviewer", convo: true, tools: ["read_file", "run_code"] },
				{ kind: "named", name: "post-comment", tools: ["send_email"] },
			],
		},
	] as const;

	const sessions = Array.from(
		{ length: 10 },
		() => `sess_${uuidv7().slice(0, 8)}`,
	);

	// ~36 workflow runs sprinkled across the 2 weeks → ~140 workflow traces.
	const NUM_RUNS = 36;
	for (let r = 0; r < NUM_RUNS; r += 1) {
		const def = workflowDefs[r % workflowDefs.length]!;
		const runId = `run_${uuidv7()}`;
		const sessionId = pick(sessions);
		// When this run kicked off (ms ago); leave headroom so later steps stay in
		// the past after we advance them forward in time.
		const runStartedAgo = rnd(2 * 60_000, SPAN_MS);
		def.steps.forEach((step, idx) => {
			// Steps progress forward in time → smaller startedAgo as idx grows.
			const startedAgo = Math.max(
				30_000,
				runStartedAgo - idx * rnd(3_000, 45_000),
			);
			makeTrace(c, {
				startedAgo,
				traceName: step.kind === "named" ? step.name : undefined,
				agentName: step.kind === "agent" ? step.name : undefined,
				workflowName: def.name,
				workflowRunId: runId,
				sessionId,
				models: Array.from({ length: rnd(1, "convo" in step && step.convo ? 4 : 3) }, () =>
					pick(models),
				),
				tools: "tools" in step ? [...step.tools] : undefined,
				withEmbedding: "embed" in step ? step.embed : false,
				conversation: "convo" in step && step.convo ? pick(CONVERSATIONS) : undefined,
				// ~1 in 12 runs has a failing final step.
				error: idx === def.steps.length - 1 && r % 12 === 0,
				metadata: {
					env: "production",
					scenario: "mega",
					workflow: def.name,
					step: String(idx + 1),
				},
			});
		});
	}

	// Long tail of standalone traces to push the dataset past 400. Mix of
	// long-conversation agents, plain agents, named one-offs, and tool loops.
	const STANDALONE = 300;
	for (let i = 0; i < STANDALONE; i += 1) {
		const startedAgo = rnd(60_000, SPAN_MS);
		const named = i % 3 === 0;
		const longConvo = i % 4 === 0; // a quarter carry full chat histories
		const toolCount = i % 5 === 0 ? rnd(2, 8) : i % 2 === 0 ? 1 : 0;
		// A few traces share a session to exercise session grouping.
		const sessionId = i % 7 === 0 ? pick(sessions) : undefined;
		makeTrace(c, {
			startedAgo,
			traceName: named ? pick(oneOffNames) : undefined,
			agentName: named ? undefined : pick(agents),
			sessionId,
			models: Array.from({ length: rnd(1, longConvo ? 5 : 4) }, () =>
				pick(models),
			),
			tools:
				toolCount > 0
					? Array.from({ length: toolCount }, () => pick(TOOL_NAMES))
					: undefined,
			withEmbedding: i % 6 === 0,
			conversation: longConvo ? pick(CONVERSATIONS) : undefined,
			error: i % 11 === 0,
			metadata: { env: "production", scenario: "mega" },
		});
	}
}

// ultra dataset: a maximalist 30-day showcase (~800 traces) built on the latest
// frontier models with custom pricing, exercising every span/cost dimension —
// reasoning tokens, prompt-cache reads + writes, vision images, server-side web
// search, multi-request spans, tool catalogs — across many workflows, agents,
// sessions, one-offs, with deep conversations, errors, and rich metadata. Evals
// and alerts are seeded separately (seedUltraExtras) after insertion.
function buildUltra(c: TraceCtx, models: string[]) {
	const SPAN_MS = 30 * DAY_MS; // a full month of history
	const agents = [
		"support-bot",
		"researcher",
		"summarizer",
		"classifier",
		"router",
		"sql-analyst",
		"code-reviewer",
		"doc-qa",
		"sales-copilot",
		"data-extractor",
		"planner",
		"vision-analyst",
	];
	const oneOffNames = [
		"summarize-email",
		"classify-ticket",
		"extract-entities",
		"translate-doc",
		"moderate-content",
		"generate-title",
		"detect-language",
		"rerank-results",
		"caption-image",
		"draft-reply",
		"score-lead",
		"redact-pii",
	];
	// Rich metadata dimensions so filtering, grouping, eval filters, and alert
	// scoping all have shape to slice by.
	const envs = ["production", "production", "production", "staging", "development"];
	const regions = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"];
	const tenants = ["acme-cloud", "northwind", "initech", "hooli", "globex", "umbrella"];
	const versions = ["2.4.0", "2.4.1", "2.5.0", "2.5.1"];
	const channels = ["api", "web", "slack", "cron"];

	const richMeta = (extra: Record<string, string>): Record<string, string> => ({
		env: pick(envs),
		scenario: "ultra",
		region: pick(regions),
		tenant: pick(tenants),
		app_version: pick(versions),
		channel: pick(channels),
		prompt_version: `v${rnd(1, 9)}`,
		...extra,
	});

	// Advertise a toolset: the tools actually used plus a couple extra options
	// the model could have picked (makes the tool-selection eval meaningful).
	const advertise = (used: string[] = []): string[] => {
		const set = new Set(used);
		const extras = rnd(2, 5);
		for (let i = 0; i < extras; i += 1) set.add(pick(ULTRA_TOOLS));
		return [...set];
	};

	type Step = {
		kind: "agent" | "named";
		name: string;
		embed?: boolean;
		tools?: string[];
		convo?: boolean;
	};
	// Six distinct workflows, each a sequence of typed steps. Steps may advertise
	// tools, call tools, carry conversations, or do retrieval embeddings.
	const workflowDefs: { name: string; steps: Step[] }[] = [
		{
			name: "nightly-digest",
			steps: [
				{ kind: "agent", name: "retriever", embed: true, tools: ["vector_search"] },
				{ kind: "agent", name: "summarizer", convo: true },
				{ kind: "agent", name: "writer", convo: true },
				{ kind: "named", name: "fetch-sources", tools: ["fetch_url", "fetch_url", "web_search"] },
				{ kind: "named", name: "publish-digest", tools: ["send_email"] },
			],
		},
		{
			name: "ticket-triage",
			steps: [
				{ kind: "agent", name: "classifier", convo: true },
				{ kind: "agent", name: "router", tools: ["query_db", "search_docs"] },
				{ kind: "named", name: "draft-reply", convo: true },
				{ kind: "named", name: "create-ticket", tools: ["create_ticket"] },
			],
		},
		{
			name: "doc-pipeline",
			steps: [
				{ kind: "named", name: "chunk-doc" },
				{ kind: "agent", name: "embedder", embed: true },
				{ kind: "named", name: "index-chunks", tools: ["vector_search", "query_db"] },
				{ kind: "agent", name: "doc-qa", convo: true, embed: true, tools: ["vector_search"] },
			],
		},
		{
			name: "code-review-bot",
			steps: [
				{ kind: "agent", name: "code-reviewer", convo: true, tools: ["read_file", "run_code", "read_file"] },
				{ kind: "named", name: "post-comment", tools: ["create_ticket"] },
			],
		},
		{
			name: "research-agent",
			steps: [
				{ kind: "agent", name: "planner", convo: true },
				{ kind: "agent", name: "researcher", embed: true, tools: ["web_search", "fetch_url", "vector_search"] },
				{ kind: "agent", name: "synthesizer", convo: true },
				{ kind: "named", name: "export-report", tools: ["summarize", "send_email"] },
			],
		},
		{
			name: "sales-outreach",
			steps: [
				{ kind: "agent", name: "sales-copilot", convo: true, tools: ["query_db", "search_docs"] },
				{ kind: "named", name: "score-lead" },
				{ kind: "named", name: "schedule-followup", tools: ["schedule_event", "send_email"] },
			],
		},
	];

	const sessions = Array.from({ length: 18 }, () => `sess_${uuidv7().slice(0, 8)}`);

	// ~64 workflow runs across the month → ~250 workflow traces.
	const NUM_RUNS = 64;
	for (let r = 0; r < NUM_RUNS; r += 1) {
		const def = workflowDefs[r % workflowDefs.length]!;
		const runId = `run_${uuidv7()}`;
		const sessionId = pick(sessions);
		const runStartedAgo = rnd(2 * 60_000, SPAN_MS);
		def.steps.forEach((step, idx) => {
			const startedAgo = Math.max(
				30_000,
				runStartedAgo - idx * rnd(3_000, 45_000),
			);
			const tools = step.tools ? [...step.tools] : undefined;
			makeTrace(c, {
				startedAgo,
				traceName: step.kind === "named" ? step.name : undefined,
				agentName: step.kind === "agent" ? step.name : undefined,
				workflowName: def.name,
				workflowRunId: runId,
				sessionId,
				models: Array.from({ length: rnd(1, step.convo ? 4 : 3) }, () =>
					pick(models),
				),
				tools,
				// Advertise a toolset on every model step (even tool-free ones).
				toolCatalog: advertise(tools),
				withEmbedding: step.embed ?? false,
				conversation: step.convo ? pick(ULTRA_ALL_CONVERSATIONS) : undefined,
				// ~1 in 10 runs has a failing final step.
				error: idx === def.steps.length - 1 && r % 10 === 0,
				metadata: richMeta({ workflow: def.name, step: String(idx + 1) }),
			});
		});
	}

	// Long tail of standalone traces to push the dataset toward ~800 total.
	const STANDALONE = 540;
	for (let i = 0; i < STANDALONE; i += 1) {
		const startedAgo = rnd(60_000, SPAN_MS);
		const named = i % 3 === 0;
		const longConvo = i % 4 === 0;
		const toolCount = i % 5 === 0 ? rnd(2, 8) : i % 2 === 0 ? 1 : 0;
		const tools =
			toolCount > 0
				? Array.from({ length: toolCount }, () => pick(ULTRA_TOOLS))
				: undefined;
		const sessionId = i % 6 === 0 ? pick(sessions) : undefined;
		// A reference answer on a slice of traces feeds the correctness eval.
		const extra: Record<string, string> =
			i % 9 === 0
				? { reference: pick(ULTRA_REFERENCES), has_reference: "1" }
				: {};
		makeTrace(c, {
			startedAgo,
			traceName: named ? pick(oneOffNames) : undefined,
			agentName: named ? undefined : pick(agents),
			sessionId,
			models: Array.from({ length: rnd(1, longConvo ? 5 : 4) }, () =>
				pick(models),
			),
			tools,
			// Most traces advertise a toolset; a few advertise none.
			toolCatalog: i % 8 === 0 ? undefined : advertise(tools),
			withEmbedding: i % 5 === 0,
			conversation: longConvo ? pick(ULTRA_ALL_CONVERSATIONS) : undefined,
			error: i % 12 === 0,
			metadata: richMeta(extra),
		});
	}
}

function buildRows(
	projectId: string,
	orgId: string,
	kind: TestKind,
	table: PricingTable,
) {
	const now = Date.now();
	const c: TraceCtx = { projectId, orgId, table, now, rows: [] };
	const models = pickModels(table);

	if (kind === "bare") {
		// A plain named trace (one-off call): traceName, no agent classification.
		makeTrace(c, {
			startedAgo: rnd(5_000, 60_000),
			traceName: "summarize-email",
			models: [models[0]!],
			metadata: { env: "test", scenario: "named" },
		});
	} else if (kind === "agent") {
		// A RAG-style agent: retrieval embedding → step → tool → step.
		makeTrace(c, {
			startedAgo: rnd(5_000, 60_000),
			agentName: "support-bot",
			models: [pick(models), pick(models)],
			withEmbedding: true,
			tools: ["query_db"],
			metadata: { env: "test", scenario: "agent" },
		});
	} else if (kind === "workflow") {
		// One run grouping multiple agents AND plain named one-off traces — with an
		// embedding, tools, and an errored step for good measure.
		const runId = `run_${uuidv7()}`;
		const sessionId = `sess_${uuidv7().slice(0, 8)}`;
		makeTrace(c, {
			startedAgo: 180_000,
			agentName: "retriever",
			workflowName: "nightly-digest",
			workflowRunId: runId,
			sessionId,
			models: [pick(models)],
			withEmbedding: true,
			tools: ["vector_search"],
			metadata: { env: "test", scenario: "workflow", step: "1" },
		});
		makeTrace(c, {
			startedAgo: 150_000,
			agentName: "summarizer",
			workflowName: "nightly-digest",
			workflowRunId: runId,
			sessionId,
			models: [pick(models), pick(models)],
			metadata: { env: "test", scenario: "workflow", step: "2" },
		});
		makeTrace(c, {
			startedAgo: 120_000,
			agentName: "writer",
			workflowName: "nightly-digest",
			workflowRunId: runId,
			sessionId,
			models: [pick(models)],
			error: true,
			metadata: { env: "test", scenario: "workflow", step: "3" },
		});
		// Plain named traces (no agent) in the SAME run — workflows group both.
		makeTrace(c, {
			startedAgo: 90_000,
			traceName: "fetch-sources",
			workflowName: "nightly-digest",
			workflowRunId: runId,
			sessionId,
			models: [pick(models)],
			tools: ["fetch_url", "fetch_url"],
			metadata: { env: "test", scenario: "workflow", step: "4" },
		});
		makeTrace(c, {
			startedAgo: 60_000,
			traceName: "publish-digest",
			workflowName: "nightly-digest",
			workflowRunId: runId,
			sessionId,
			models: [pick(models)],
			tools: ["send_email"],
			metadata: { env: "test", scenario: "workflow", step: "5" },
		});
	} else if (kind === "tool") {
		// A tool-heavy agent: many tool calls interleaved with reasoning steps.
		makeTrace(c, {
			startedAgo: rnd(5_000, 60_000),
			agentName: "researcher",
			models: [pick(models), pick(models), pick(models)],
			withEmbedding: true,
			tools: [
				"web_search",
				"fetch_url",
				"query_db",
				"run_code",
				"read_file",
				"calculator",
			],
			metadata: { env: "test", scenario: "tool" },
		});
	} else if (kind === "full") {
		// full: a broad spread over the last ~60 min so every chart, span type,
		// grouping, and status has shape — agents, named one-offs, tool loops,
		// embeddings, errors, multiple workflow runs and sessions.
		const agents = [
			"support-bot",
			"researcher",
			"summarizer",
			"classifier",
			"router",
		];
		const oneOffNames = [
			"summarize-email",
			"classify-ticket",
			"extract-entities",
			"translate-doc",
			"moderate-content",
		];
		const runs = [`run_${uuidv7()}`, `run_${uuidv7()}`, `run_${uuidv7()}`];
		const sessions = [
			`sess_${uuidv7().slice(0, 8)}`,
			`sess_${uuidv7().slice(0, 8)}`,
		];
		for (let i = 0; i < 42; i += 1) {
			const startedAgo = rnd(10_000, 60 * 60_000);
			const inWorkflow = i % 4 === 0;
			// Some traces are plain named one-offs (standalone and inside workflows).
			const named = i % 3 === 0;
			const toolCount = i % 5 === 0 ? rnd(2, 7) : i % 2 === 0 ? 1 : 0;
			makeTrace(c, {
				startedAgo,
				traceName: named ? pick(oneOffNames) : undefined,
				agentName: named ? undefined : pick(agents),
				workflowName: inWorkflow ? "nightly-digest" : undefined,
				workflowRunId: inWorkflow ? pick(runs) : undefined,
				sessionId: inWorkflow
					? pick(sessions)
					: i % 6 === 0
						? pick(sessions)
						: undefined,
				models: Array.from({ length: rnd(1, 4) }, () => pick(models)),
				tools:
					toolCount > 0
						? Array.from({ length: toolCount }, () => pick(TOOL_NAMES))
						: undefined,
				withEmbedding: i % 7 === 0,
				error: i % 9 === 0,
				metadata: { env: "test", scenario: "full" },
			});
		}
	} else if (kind === "mega") {
		// mega: a large, realistic 2-week dataset — 400+ traces spread across the
		// last 14 days, mixing long multi-turn conversations, tool-heavy loops,
		// embeddings, errors, and many workflow runs/sessions. Workflow members
		// cluster in time around each run's start so runs read as coherent.
		buildMega(c, models);
	} else {
		// ultra: the maximalist showcase — ~800 traces over 30 days on the latest
		// frontier models, exercising every span/cost dimension (reasoning tokens,
		// cache read/write, vision, web search, multi-request, tool catalogs).
		c.ultra = new Map(ULTRA_MODELS.map((m) => [m.id, m]));
		c.embeddingModel = ULTRA_EMBEDDING;
		buildUltra(
			c,
			ULTRA_MODELS.map((m) => m.id),
		);
	}

	const traceIds = new Set(c.rows.map((r) => r.trace_id));
	return { rows: c.rows, traces: traceIds.size, spans: c.rows.length };
}

/** Generate + insert synthetic spans for a project. */
export async function ingestTest(
	ch: Ch,
	db: Db,
	userId: string,
	input: { projectId: string; kind: TestKind },
) {
	const proj = await requireProjectAccess(db, userId, input.projectId);
	const table = await getPricingTable();
	const { rows, traces, spans } = buildRows(
		input.projectId,
		proj.orgId,
		input.kind,
		table,
	);
	await insertSpans(ch, rows);
	const scores =
		input.kind === "ultra"
			? await seedUltraExtras(db, ch, input.projectId, rows)
			: await seedEvalsAndScores(db, ch, input.projectId, rows);
	return { kind: input.kind, traces, spans, scores };
}

// Find-or-create a demo eval (idempotent across admin runs) → returns its id.
async function ensureEval(
	db: Db,
	projectId: string,
	def: {
		name: string;
		presetId: string;
		scorerSource: "code" | "llm";
		targetLevel: "trace" | "span";
		model?: EvalModel;
		sampleRate?: string;
		filters?: EvalFilters;
		config?: EvalConfig;
		enabled?: boolean;
	},
): Promise<string> {
	const existing = await db
		.select({ id: evalDefinition.id })
		.from(evalDefinition)
		.where(
			and(
				eq(evalDefinition.projectId, projectId),
				eq(evalDefinition.presetId, def.presetId),
			),
		)
		.limit(1);
	if (existing[0]) return existing[0].id;
	const ins = await db
		.insert(evalDefinition)
		.values({
			projectId,
			name: def.name,
			presetId: def.presetId,
			scorerSource: def.scorerSource,
			targetLevel: def.targetLevel,
			sampleRate: def.sampleRate ?? "1",
			model: def.model ?? null,
			filters: def.filters ?? null,
			config: def.config ?? null,
			enabled: def.enabled ?? true,
		})
		.returning({ id: evalDefinition.id });
	const id = ins[0]!.id;
	await db.insert(evalState).values({ evalId: id, status: "ok" });
	return id;
}

const RELEVANCE_REASONS = [
	"Directly answers the question.",
	"Mostly relevant, minor digression.",
	"On-topic and complete.",
	"Partially addresses the request.",
];

// Seed two demo evals (a trace-level relevance judge + a span-level PII check)
// and synthetic scores over the just-generated spans, so the Evals UI, score
// badges, and charts render immediately without waiting for the worker.
async function seedEvalsAndScores(
	db: Db,
	ch: Ch,
	projectId: string,
	rows: SpanRow[],
): Promise<number> {
	const relevanceId = await ensureEval(db, projectId, {
		name: "Answer relevance",
		presetId: "relevance",
		scorerSource: "llm",
		targetLevel: "trace",
		model: { provider: "google", modelId: "gemini-3.1-flash-lite" },
	});
	const piiId = await ensureEval(db, projectId, {
		name: "No PII in output",
		presetId: "pii",
		scorerSource: "code",
		targetLevel: "span",
	});

	const scores: ScoreRow[] = [];
	for (const r of rows) {
		if (r.span_type === "agent") {
			const score = rnd(3, 6); // 3–5
			scores.push({
				project_id: projectId,
				eval_id: relevanceId,
				score_id: `${relevanceId}:${r.trace_id}`,
				target_type: "trace",
				target_id: r.trace_id,
				trace_id: r.trace_id,
				scorer: "llm",
				label: "",
				score,
				passed: null,
				reason: pick(RELEVANCE_REASONS),
				model_id: "gemini-3.1-flash-lite",
				cost: "0.0000200000",
				scored_at: r.end_time + 800,
			});
		} else if (r.span_type === "llm") {
			const leaked = Math.random() < 0.05;
			scores.push({
				project_id: projectId,
				eval_id: piiId,
				score_id: `${piiId}:${r.span_id}`,
				target_type: "span",
				target_id: r.span_id,
				trace_id: r.trace_id,
				scorer: "code",
				label: "",
				score: null,
				passed: leaked ? 0 : 1,
				reason: leaked ? "Found PII: email" : "No PII detected",
				model_id: "",
				cost: null,
				scored_at: r.end_time + 400,
			});
		}
	}
	await insertScores(ch, scores);
	return scores.length;
}

// Judge models rotated across the ultra eval suite (one credential per provider
// in a real project; here they just populate model_id / cost on score rows).
const ULTRA_JUDGES = [
	"google/gemini-3.1-flash-lite",
	"openai/gpt-5.5-mini",
	"anthropic/claude-haiku-4.5",
];

function judgeModel(id: string): EvalModel {
	const [provider, ...rest] = id.split("/");
	return {
		provider: provider as EvalModel["provider"],
		modelId: rest.join("/"),
	};
}

const ULTRA_SCORE_REASONS = [
	"Grounded in the provided context with no unsupported claims.",
	"Fully addresses every part of the request.",
	"Clear, well-structured, and internally consistent.",
	"Follows the instructions precisely.",
	"Minor omission but largely complete.",
	"Slightly verbose, otherwise on point.",
];

// Find-or-create a demo alert rule (idempotent by name) and seed its state +
// a couple of history events so the Alerts UI renders firing/resolved rows.
async function ensureAlert(
	db: Db,
	projectId: string,
	now: number,
	def: {
		name: string;
		metric: (typeof alertRule.$inferInsert)["metric"];
		comparison: (typeof alertRule.$inferInsert)["comparison"];
		threshold: string;
		windowSeconds: number;
		lastValue: string;
		status: "ok" | "firing";
		evalId?: string;
		filters?: AlertFilters;
	},
): Promise<string> {
	const existing = await db
		.select({ id: alertRule.id })
		.from(alertRule)
		.where(and(eq(alertRule.projectId, projectId), eq(alertRule.name, def.name)))
		.limit(1);
	let ruleId = existing[0]?.id;
	if (!ruleId) {
		const ins = await db
			.insert(alertRule)
			.values({
				projectId,
				name: def.name,
				metric: def.metric,
				evalId: def.evalId ?? null,
				filters: def.filters ?? null,
				windowSeconds: def.windowSeconds,
				threshold: def.threshold,
				comparison: def.comparison,
				enabled: true,
				channels: [{ type: "email", to: "alerts@foglamp.dev" }],
			})
			.returning({ id: alertRule.id });
		ruleId = ins[0]!.id;
	}

	const firing = def.status === "firing";
	const evaluatedAt = new Date(now - 60_000);
	const firedAt = new Date(now - 3 * 60 * 60 * 1000);
	await db
		.insert(alertState)
		.values({
			ruleId,
			status: def.status,
			lastValue: def.lastValue,
			lastEvaluatedAt: evaluatedAt,
			lastFiredAt: firing ? evaluatedAt : firedAt,
			lastNotifiedAt: firing ? evaluatedAt : firedAt,
		})
		.onConflictDoNothing();

	// A fired→resolved pair in the past, plus an open `fired` when still firing.
	const events: (typeof alertEvent.$inferInsert)[] = [
		{
			ruleId,
			type: "fired",
			value: def.lastValue,
			threshold: def.threshold,
			createdAt: firedAt,
		},
		{
			ruleId,
			type: "resolved",
			value: def.threshold,
			threshold: def.threshold,
			createdAt: new Date(now - 2 * 60 * 60 * 1000),
		},
	];
	if (firing) {
		events.push({
			ruleId,
			type: "fired",
			value: def.lastValue,
			threshold: def.threshold,
			createdAt: evaluatedAt,
		});
	}
	await db.insert(alertEvent).values(events);
	return ruleId;
}

// The ultra dataset's full observability layer: a 14-scorer eval suite spanning
// every preset family (self-contained judges, RAG/reference judges, and code
// checks at both trace and span level), dense synthetic scores over the just-
// generated spans, and nine alert rules covering every metric — including two
// eval-score alerts wired to specific evals.
async function seedUltraExtras(
	db: Db,
	ch: Ch,
	projectId: string,
	rows: SpanRow[],
): Promise<number> {
	const j = (i: number) => ULTRA_JUDGES[i % ULTRA_JUDGES.length]!;

	// Trace-level LLM judges.
	const relevanceId = await ensureEval(db, projectId, { name: "Answer relevance", presetId: "relevance", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(0)), sampleRate: "1" });
	const helpfulnessId = await ensureEval(db, projectId, { name: "Helpfulness", presetId: "helpfulness", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(1)), sampleRate: "0.8" });
	const faithfulnessId = await ensureEval(db, projectId, { name: "Faithfulness (RAG)", presetId: "faithfulness", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(2)), sampleRate: "0.6" });
	const coherenceId = await ensureEval(db, projectId, { name: "Coherence", presetId: "coherence", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(0)), sampleRate: "0.7" });
	const completenessId = await ensureEval(db, projectId, { name: "Completeness", presetId: "completeness", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(1)), sampleRate: "0.7" });
	const instructionId = await ensureEval(db, projectId, { name: "Instruction following", presetId: "instruction_following", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(2)), sampleRate: "0.8" });
	const correctnessId = await ensureEval(db, projectId, { name: "Correctness vs reference", presetId: "correctness", scorerSource: "llm", targetLevel: "trace", model: judgeModel(j(0)), sampleRate: "1", filters: { metadata: { has_reference: "1" } } });

	// Span-level checks: one LLM safety judge + four code scorers + two tool evals.
	const toxicityId = await ensureEval(db, projectId, { name: "Toxicity / safety", presetId: "toxicity", scorerSource: "llm", targetLevel: "span", model: judgeModel(j(1)), sampleRate: "0.5", filters: { spanType: "llm" } });
	const piiId = await ensureEval(db, projectId, { name: "No PII in output", presetId: "pii", scorerSource: "code", targetLevel: "span", filters: { spanType: "llm" } });
	const validJsonId = await ensureEval(db, projectId, { name: "Valid JSON", presetId: "valid_json", scorerSource: "code", targetLevel: "span", filters: { spanType: "llm" } });
	const noRefusalId = await ensureEval(db, projectId, { name: "No refusal", presetId: "no_refusal", scorerSource: "code", targetLevel: "span", filters: { spanType: "llm" } });
	const secretLeakId = await ensureEval(db, projectId, { name: "No secret leak", presetId: "secret_leak", scorerSource: "code", targetLevel: "span", filters: { spanType: "llm" } });
	const toolSelectionId = await ensureEval(db, projectId, { name: "Tool selection", presetId: "tool_selection", scorerSource: "llm", targetLevel: "span", model: judgeModel(j(2)), sampleRate: "0.6", filters: { spanType: "tool" } });
	const toolArgsId = await ensureEval(db, projectId, { name: "Tool args valid", presetId: "tool_args_valid", scorerSource: "code", targetLevel: "span", filters: { spanType: "tool" } });

	const scores: ScoreRow[] = [];
	const pushJudge = (
		evalId: string,
		r: SpanRow,
		model: string,
		opts: { score?: number; passed?: 0 | 1 } = {},
	) => {
		scores.push({
			project_id: projectId,
			eval_id: evalId,
			score_id: `${evalId}:${r.span_id}`,
			target_type: "trace",
			target_id: r.trace_id,
			trace_id: r.trace_id,
			scorer: "llm",
			label: "",
			score: opts.score ?? null,
			passed: opts.passed ?? null,
			reason: pick(ULTRA_SCORE_REASONS),
			model_id: judgeModel(model).modelId,
			cost: "0.0000180000",
			scored_at: r.end_time + 700,
		});
	};
	const pushCode = (
		evalId: string,
		r: SpanRow,
		passed: 0 | 1,
		reason: string,
	) => {
		scores.push({
			project_id: projectId,
			eval_id: evalId,
			score_id: `${evalId}:${r.span_id}`,
			target_type: "span",
			target_id: r.span_id,
			trace_id: r.trace_id,
			scorer: "code",
			label: "",
			score: null,
			passed,
			reason,
			model_id: "",
			cost: null,
			scored_at: r.end_time + 300,
		});
	};

	let idx = 0;
	for (const r of rows) {
		idx += 1;
		if (r.span_type === "agent") {
			pushJudge(relevanceId, r, j(0), { score: rnd(3, 6) });
			if (idx % 5 !== 0) pushJudge(helpfulnessId, r, j(1), { score: rnd(3, 6) });
			if (idx % 3 === 0) pushJudge(faithfulnessId, r, j(2), { score: rnd(2, 6) });
			if (idx % 4 !== 0) pushJudge(coherenceId, r, j(0), { score: rnd(4, 6) });
			if (idx % 4 !== 0) pushJudge(completenessId, r, j(1), { score: rnd(3, 6) });
			if (idx % 5 !== 0) pushJudge(instructionId, r, j(2), { score: rnd(3, 6) });
			if (r.metadata.reference) {
				const ok = Math.random() < 0.8;
				pushJudge(correctnessId, r, j(0), { score: ok ? rnd(4, 6) : rnd(1, 3), passed: ok ? 1 : 0 });
			}
		} else if (r.span_type === "llm") {
			const leaked = Math.random() < 0.04;
			pushCode(piiId, r, leaked ? 0 : 1, leaked ? "Found PII: email" : "No PII detected");
			const isJson = r.output.trim().startsWith("{") || r.output.trim().startsWith("[");
			pushCode(validJsonId, r, isJson ? 1 : 0, isJson ? "Parsed as JSON" : "Not JSON output");
			const refused = Math.random() < 0.03;
			pushCode(noRefusalId, r, refused ? 0 : 1, refused ? "Looks like a refusal" : "Not a refusal");
			const secret = Math.random() < 0.02;
			pushCode(secretLeakId, r, secret ? 0 : 1, secret ? "Token-shaped string detected" : "No secrets detected");
			if (idx % 2 === 0) {
				const safe = Math.random() < 0.99;
				pushJudge(toxicityId, r, j(1), { passed: safe ? 1 : 0 });
				// Toxicity is span-targeted, so rewrite the last row's target.
				const last = scores[scores.length - 1]!;
				last.target_type = "span";
				last.target_id = r.span_id;
			}
		} else if (r.span_type === "tool") {
			if (idx % 3 !== 0) {
				scores.push({
					project_id: projectId,
					eval_id: toolSelectionId,
					score_id: `${toolSelectionId}:${r.span_id}`,
					target_type: "span",
					target_id: r.span_id,
					trace_id: r.trace_id,
					scorer: "llm",
					label: "",
					score: rnd(3, 6),
					passed: null,
					reason: "Appropriate tool for the request.",
					model_id: judgeModel(j(2)).modelId,
					cost: "0.0000150000",
					scored_at: r.end_time + 300,
				});
			}
			const valid = Math.random() < 0.97;
			pushCode(toolArgsId, r, valid ? 1 : 0, valid ? "Args are a valid JSON object" : "Args failed to parse");
		}
	}
	await insertScores(ch, scores);

	// Nine alert rules — every metric, two of them eval-scoped.
	const now = rows.length ? Math.max(...rows.map((r) => r.end_time)) : Date.now();
	await ensureAlert(db, projectId, now, { name: "Hourly spend over budget", metric: "cost", comparison: "gt", threshold: "25.0000000000", windowSeconds: 3600, lastValue: "31.4200000000", status: "firing" });
	await ensureAlert(db, projectId, now, { name: "p95 latency SLO", metric: "latency_p95", comparison: "gt", threshold: "8000.0000000000", windowSeconds: 900, lastValue: "6450.0000000000", status: "ok" });
	await ensureAlert(db, projectId, now, { name: "p99 latency ceiling", metric: "latency_p99", comparison: "gt", threshold: "15000.0000000000", windowSeconds: 900, lastValue: "17200.0000000000", status: "firing" });
	await ensureAlert(db, projectId, now, { name: "Time-to-first-token p95", metric: "ttft_p95", comparison: "gt", threshold: "2500.0000000000", windowSeconds: 900, lastValue: "1980.0000000000", status: "ok" });
	await ensureAlert(db, projectId, now, { name: "Error rate spike", metric: "error_rate", comparison: "gt", threshold: "0.0500000000", windowSeconds: 600, lastValue: "0.1100000000", status: "firing" });
	await ensureAlert(db, projectId, now, { name: "Token usage surge", metric: "token_usage", comparison: "gt", threshold: "5000000.0000000000", windowSeconds: 3600, lastValue: "4100000.0000000000", status: "ok" });
	await ensureAlert(db, projectId, now, { name: "Request volume guard", metric: "request_count", comparison: "gt", threshold: "10000.0000000000", windowSeconds: 3600, lastValue: "7300.0000000000", status: "ok" });
	await ensureAlert(db, projectId, now, { name: "Relevance score dropped", metric: "eval_avg_score", comparison: "lt", threshold: "3.5000000000", windowSeconds: 86400, lastValue: "3.1000000000", status: "firing", evalId: relevanceId });
	await ensureAlert(db, projectId, now, { name: "PII pass-rate dropped", metric: "eval_pass_rate", comparison: "lt", threshold: "0.9500000000", windowSeconds: 86400, lastValue: "0.9700000000", status: "ok", evalId: piiId });

	return scores.length;
}

export type PricedModelRow = {
	id: string;
	prompt: string | null;
	completion: string | null;
	request: string | null;
	cacheRead: string | null;
	cacheWrite: string | null;
	image: string | null;
	webSearch: string | null;
	internalReasoning: string | null;
};

/**
 * The OpenRouter pricing currently cached in-process — the same table ingest
 * uses to price spans. Per-token prices for the common dimensions.
 */
export async function listPricing(): Promise<{
	count: number;
	models: PricedModelRow[];
}> {
	const table = await getPricingTable();
	const models: PricedModelRow[] = [];
	for (const [id, price] of table.entries()) {
		models.push({
			id,
			prompt: price.prompt,
			completion: price.completion,
			request: price.request,
			cacheRead: price.cacheRead,
			cacheWrite: price.cacheWrite,
			image: price.image,
			webSearch: price.webSearch,
			internalReasoning: price.internalReasoning,
		});
	}
	models.sort((a, b) => a.id.localeCompare(b.id));
	return { count: models.length, models };
}

// --- Eval job queue observability --------------------------------------------

export type EvalJobRow = {
	id: string;
	evalId: string;
	evalName: string;
	projectName: string;
	windowStart: Date;
	windowEnd: Date;
	status: "pending" | "running" | "done" | "dead";
	attempts: number;
	maxAttempts: number;
	leasedUntil: Date | null;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Snapshot of the eval scoring queue (`eval_job`): per-status counts plus the
 * 50 most recent jobs, joined with the eval + project for display. Surfaced on
 * the Admin tab to watch the planner/executor pipeline. Scoped to evals in
 * organizations the caller is a member of — the procedure is reachable by any
 * authenticated user, so an unscoped query would leak other orgs' eval and
 * project names.
 */
export async function listEvalJobs(
	db: Db,
	userId: string,
): Promise<{
	counts: Record<"pending" | "running" | "done" | "dead", number>;
	jobs: EvalJobRow[];
}> {
	const countRows = await db
		.select({
			status: evalJob.status,
			count: sql<number>`count(*)::int`,
		})
		.from(evalJob)
		.innerJoin(evalDefinition, eq(evalDefinition.id, evalJob.evalId))
		.innerJoin(project, eq(project.id, evalDefinition.projectId))
		.innerJoin(
			member,
			and(eq(member.organizationId, project.orgId), eq(member.userId, userId)),
		)
		.groupBy(evalJob.status);
	const counts = { pending: 0, running: 0, done: 0, dead: 0 };
	for (const row of countRows) counts[row.status] = row.count;

	const jobs = await db
		.select({
			id: evalJob.id,
			evalId: evalJob.evalId,
			evalName: evalDefinition.name,
			projectName: project.name,
			windowStart: evalJob.windowStart,
			windowEnd: evalJob.windowEnd,
			status: evalJob.status,
			attempts: evalJob.attempts,
			maxAttempts: evalJob.maxAttempts,
			leasedUntil: evalJob.leasedUntil,
			lastError: evalJob.lastError,
			createdAt: evalJob.createdAt,
			updatedAt: evalJob.updatedAt,
		})
		.from(evalJob)
		.innerJoin(evalDefinition, eq(evalDefinition.id, evalJob.evalId))
		.innerJoin(project, eq(project.id, evalDefinition.projectId))
		.innerJoin(
			member,
			and(eq(member.organizationId, project.orgId), eq(member.userId, userId)),
		)
		.orderBy(desc(evalJob.createdAt))
		.limit(50);

	return { counts, jobs };
}

// --- Transactional email preview/test harness (dev-only) ---------------------
// Each entry maps to one of the platform's transactional emails, fired with
// mocked-but-realistic data so the actual templates can be exercised against a
// real inbox. Like the data generator above, the surfacing UI is dev-gated; the
// procedure additionally refuses to run in production so a reachable prod server
// can't be used to send arbitrary mail.

export const TEST_EMAILS = [
	"magic-link",
	"invitation",
	"quota-warning",
	"alert-fired",
	"alert-resolved",
] as const;
export type TestEmail = (typeof TEST_EMAILS)[number];

/** Send one of the platform's emails to `to`, populated with mocked data. */
export async function sendTestEmail(input: { kind: TestEmail; to: string }) {
	if (env.NODE_ENV === "production") {
		throw new Error("Test emails are disabled in production.");
	}
	// The web origin — drives the links inside each template.
	const base = env.CORS_ORIGIN.replace(/\/$/, "");

	switch (input.kind) {
		case "magic-link":
			await sendMagicLinkEmail({
				to: input.to,
				url: `${base}/api/auth/magic-link/verify?token=mock-magic-link-token`,
			});
			break;
		case "invitation":
			await sendInvitationEmail({
				to: input.to,
				inviterName: "Ada Lovelace",
				orgName: "Acme Cloud",
				url: `${base}/accept-invitation/mock-invitation-id`,
			});
			break;
		case "quota-warning":
			await sendQuotaWarningEmail({
				to: input.to,
				orgName: "Acme Cloud",
				pct: 92,
				url: `${base}/settings/org`,
			});
			break;
		case "alert-fired":
			await sendAlertEmail({
				to: input.to,
				kind: "fired",
				ruleName: "p99 latency too high",
				projectName: "production",
				metricLabel: "p99 latency",
				conditionLabel: "above 1,500 ms",
				value: "2,310 ms",
				windowLabel: "last 5 minutes",
				url: `${base}/alerts`,
			});
			break;
		case "alert-resolved":
			await sendAlertEmail({
				to: input.to,
				kind: "resolved",
				ruleName: "p99 latency too high",
				projectName: "production",
				metricLabel: "p99 latency",
				conditionLabel: "above 1,500 ms",
				value: "840 ms",
				windowLabel: "last 5 minutes",
				url: `${base}/alerts`,
			});
			break;
	}

	// The senders silently no-op without a Resend key (email-less self-host), so
	// report whether mail was actually dispatched vs. skipped.
	return {
		kind: input.kind,
		to: input.to,
		delivered: Boolean(env.RESEND_API_KEY),
	};
}
