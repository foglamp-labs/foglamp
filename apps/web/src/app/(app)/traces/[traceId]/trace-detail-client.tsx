"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@foglamp/ui/components/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@foglamp/ui/components/tooltip";
import {
	IconAffiliate,
	IconAlertTriangle,
	IconAlertTriangleFilled,
	IconArrowUpRight,
	IconBoltFilled,
	IconCirclesFilled,
	IconClockFilled,
	IconCoinFilled,
	IconListTree,
	IconMessage2Filled,
	IconPlayerStopFilled,
	IconSitemapFilled,
	IconSparklesFilled,
	IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { useShikiHtml } from "@/components/app/code-block";
import { CopyButton } from "@/components/app/copy-button";
import { useDelayedLoading } from "@/components/app/hooks";
import {
	type EvalMeta,
	ScoreRow,
	type TraceScore,
} from "@/components/app/eval-scores";
import { navItem } from "@/components/app/nav";
import {
	EmptyState,
	NoProject,
	PageHeader,
	ScrollFade,
	StatCard,
	TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { SpanTypeBadge } from "@/components/app/span-type";
import { TpsHeadline } from "@/components/app/tps-headline";
import { TraceTimeline, WHOLE_TRACE_ID } from "@/components/app/trace-timeline";
import { ModelLogo, formatModelName } from "@/components/model-logo";
import {
	formatCost,
	formatCount,
	formatDateTime,
	formatDuration,
	formatTokens,
} from "@/lib/format";
import {
	type TraceSpan,
	computeWindow,
	orderSpans,
	toMs,
} from "@/lib/trace-timeline";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

type Span = TraceSpan;

// Trace-level rollup shown in the inspector when the synthetic "Whole trace"
// root row is selected — the trace's own facts, not any single span's.
type TraceSummary = {
	startTime: string;
	durationMs: number;
	cost: number | null;
	tokens: number;
	spanCount: number;
	llmCount: number;
	errorCount: number;
	scores: TraceScore[];
};

export function TraceDetailClient({ traceId }: { traceId: string }) {
	const { projectId } = useProject();
	const searchParams = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();
	const [selected, setSelected] = useState<string | null>(() =>
		searchParams.get("span"),
	);

	const detail = useQuery({
		...trpc.traces.get.queryOptions({ projectId: projectId!, traceId }),
		enabled: !!projectId,
	});
	const scores = useQuery({
		...trpc.evals.traceScores.queryOptions({ projectId: projectId!, traceId }),
		enabled: !!projectId,
	});
	// Eval definitions, to enrich each score with its eval name + check (preset)
	// for the Scores panel. Only fetched once a trace actually has scores.
	const evals = useQuery({
		...trpc.evals.list.queryOptions({ projectId: projectId! }),
		enabled: !!projectId && (scores.data ?? []).length > 0,
	});
	const evalMeta = useMemo(
		() => new Map((evals.data ?? []).map((e) => [e.id, e] as const)),
		[evals.data],
	);
	// Preset id → friendly check name ("No PII", "Valid JSON"). Static list.
	const presets = useQuery({
		...trpc.evals.presets.queryOptions(),
		enabled: (scores.data ?? []).length > 0,
	});
	const presetName = useMemo(
		() => new Map((presets.data ?? []).map((p) => [p.id, p.name] as const)),
		[presets.data],
	);
	// Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
	const showSkeleton = useDelayedLoading(detail.isLoading);

	const spans = detail.data?.spans ?? [];
	const ordered = useMemo(() => orderSpans(spans), [spans]);
	const window = useMemo(() => computeWindow(spans), [spans]);

	const active = spans.find((s) => s.spanId === selected) ?? null;
	const erroredSpans = spans.filter((s) => s.status === "error");
	// Aborted spans (AI SDK onAbort) — a clean cancellation, surfaced apart from
	// errors and never counted toward the error stat.
	const abortedSpans = spans.filter((s) => s.status === "aborted");
	// Eval scores for the selected span — shown in its inspector (the timeline
	// row only carries compact pass/fail indicators).
	const activeScores = useMemo(
		() =>
			active
				? (scores.data ?? []).filter(
						(s) => s.targetType === "span" && s.targetId === active.spanId,
					)
				: [],
		[scores.data, active],
	);

	// Trace rollups for the summary strip (derived from spans — no extra fetch).
	const stats = useMemo(() => {
		let cost = 0;
		let priced = false;
		let tokens = 0;
		let llm = 0;
		for (const s of spans) {
			if (s.totalCost != null) {
				cost += s.totalCost;
				priced = true;
			}
			tokens += s.totalTokens;
			if (s.spanType === "llm") llm += 1;
		}
		return { cost: priced ? cost : null, tokens, llm };
	}, [spans]);

	// Whole-trace eval scores (everything not targeting an individual span) — for
	// the trace-level inspector opened from the "Whole trace" root row.
	const traceScores = useMemo(
		() => (scores.data ?? []).filter((s) => s.targetType !== "span"),
		[scores.data],
	);
	const isTraceSelected = selected === WHOLE_TRACE_ID;
	// The trace's own facts, assembled only when its row is selected.
	const traceSummary = useMemo<TraceSummary | null>(() => {
		if (spans.length === 0) return null;
		const startTime = spans.reduce(
			(earliest, s) =>
				toMs(s.startTime) < toMs(earliest) ? s.startTime : earliest,
			spans[0].startTime,
		);
		return {
			startTime,
			durationMs: window.span,
			cost: stats.cost,
			tokens: stats.tokens,
			spanCount: spans.length,
			llmCount: stats.llm,
			errorCount: erroredSpans.length,
			scores: traceScores,
		};
	}, [spans, window.span, stats, erroredSpans.length, traceScores]);

	// Select a span and reflect it in the URL (?span=) so the selection is
	// shareable; other params (e.g. ?replay=1) are preserved.
	const select = useCallback(
		(spanId: string | null) => {
			setSelected(spanId);
			const params = new URLSearchParams(searchParams.toString());
			if (spanId) params.set("span", spanId);
			else params.delete("span");
			const qs = params.toString();
			router.replace(
				// biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
				(qs ? `${pathname}?${qs}` : pathname) as any,
				{ scroll: false },
			);
		},
		[pathname, router, searchParams],
	);

	// Keyboard navigation: ↑/↓ or j/k move through the ordered spans. Ignored
	// while typing in a field so it never hijacks copy/scroll inside payloads.
	useEffect(() => {
		if (ordered.length === 0) return;
		const onKey = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA") return;
			const next = e.key === "ArrowDown" || e.key === "j";
			const prev = e.key === "ArrowUp" || e.key === "k";
			if (!next && !prev) return;
			e.preventDefault();
			const i = ordered.findIndex((o) => o.span.spanId === selected);
			const ni =
				i < 0
					? 0
					: Math.min(Math.max(i + (next ? 1 : -1), 0), ordered.length - 1);
			select(ordered[ni].span.spanId);
		};
		// `window` is shadowed by the timeline memo above — use globalThis.
		globalThis.addEventListener("keydown", onKey);
		return () => globalThis.removeEventListener("keydown", onKey);
	}, [ordered, selected, select]);

	const back = navItem("/traces");
	const ctx = detail.data;

	if (!projectId) {
		return (
			<>
				<PageHeader title="Trace" back={back} />
				<NoProject />
			</>
		);
	}

	return (
		<>
			<PageHeader
				title={traceId}
				back={back}
				titleTrailing={<CopyButton value={traceId} title="Copy trace ID" />}
			/>

			{/* Context chips: link back to the owning session / workflow / agent,
			    plus the end-customer this trace served (no page, so not a link). */}
			{(ctx?.sessionId ||
				ctx?.workflowName ||
				ctx?.agentName ||
				ctx?.customer) && (
				<div className="-mt-1 flex flex-wrap items-center gap-2 text-xs">
					{ctx.customer && (
						<span className="inline-flex max-w-xs items-center gap-[5px] rounded-full bg-card px-2.5 pl-2 py-1 text-muted-foreground shadow-(--custom-shadow)">
							<CustomerAvatar
								customerId={ctx.customer.id}
								customerName={ctx.customer.name}
								imageUrl={ctx.customer.imageUrl}
								filled
								className="size-3.5 shrink-0"
							/>
							<span className="truncate">
								{ctx.customer.name ?? ctx.customer.id}
							</span>
						</span>
					)}
					{ctx.sessionId && (
						<ContextChip
							href={`/sessions/${encodeURIComponent(ctx.sessionId)}`}
							icon={IconMessage2Filled}
							iconClassName="text-sky-500"
							label={ctx.sessionId}
						/>
					)}
					{ctx.workflowName && (
						<ContextChip
							href={`/workflows/${encodeURIComponent(ctx.workflowName)}`}
							icon={IconSitemapFilled}
							iconClassName="text-emerald-500"
							label={ctx.workflowName}
						/>
					)}
					{ctx.agentName && (
						<ContextChip
							href={`/agents/${encodeURIComponent(ctx.agentName)}`}
							icon={(p) => (
								<AgentIcon name={ctx.agentName} filled className={p.className} />
							)}
							iconClassName=""
							label={ctx.agentName}
						/>
					)}
				</div>
			)}

			{detail.isLoading ? (
				showSkeleton ? (
					<TableSkeleton />
				) : null
			) : ordered.length === 0 ? (
				<EmptyState
					icon={IconListTree}
					title="Trace not found"
					description="It may have aged out of retention or never arrived."
				/>
			) : (
				<>
					<section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
						<StatCard
							icon={IconBoltFilled}
							iconClassName="text-violet-300 dark:text-violet-700"
							size="sm"
							label="Spans"
							value={formatCount(spans.length)}
						/>
						<StatCard
							icon={IconSparklesFilled}
							iconClassName="text-emerald-300 dark:text-emerald-700"
							size="sm"
							label="LLM calls"
							value={formatCount(stats.llm)}
						/>
						<StatCard
							icon={IconCirclesFilled}
							iconClassName="text-blue-400 dark:text-blue-600"
							size="sm"
							label="Tokens"
							value={formatTokens(stats.tokens)}
						/>
						<StatCard
							icon={IconAlertTriangleFilled}
							iconClassName="text-rose-300 dark:text-rose-700"
							size="sm"
							label="Errors"
							value={
								<span
									className={cn(
										erroredSpans.length > 0 &&
											"text-rose-600 dark:text-rose-500",
									)}
								>
									{formatCount(erroredSpans.length)}
								</span>
							}
						/>
						<StatCard
							icon={IconClockFilled}
							iconClassName="text-sky-300 dark:text-sky-700"
							size="sm"
							label="Duration"
							value={formatDuration(window.span)}
						/>
						<StatCard
							icon={IconCoinFilled}
							iconClassName="text-yellow-300 dark:text-yellow-600"
							size="sm"
							label="Cost"
							value={formatCost(stats.cost, 4)}
						/>
					</section>

					{erroredSpans.length > 0 && (
						// The banner is itself a button (it selects the errored span), so the
						// copy control rides alongside as an absolutely-positioned sibling
						// rather than a nested button (which would be invalid markup).
						<div className="relative">
							<button
								type="button"
								onClick={() => select(erroredSpans[0].spanId)}
								className="flex flex-col w-full items-center gap-2 rounded-lg cursor-pointer bg-rose-500/10 dark:hover:bg-rose-500/20 shadow-(--custom-shadow-rose) px-3 py-2.5 pr-10 text-left text-sm text-rose-600 transition-colors hover:bg-rose-500/20 dark:bg-rose-500/15 dark:text-rose-400"
							>
								<div className="flex w-full items-center gap-2">
									<IconAlertTriangle className="size-4 shrink-0" />
									<span className="font-medium">
										{erroredSpans.length}{" "}
										{erroredSpans.length === 1 ? "span" : "spans"} errored
									</span>
								</div>
								{erroredSpans[0].errorMessage && (
									<span className="w-full truncate text-left text-rose-600/80 dark:text-rose-400/80">
										{erroredSpans[0].errorMessage}
									</span>
								)}
							</button>
							{erroredSpans[0].errorMessage && (
								<CopyButton
									value={erroredSpans[0].errorMessage}
									title="Copy error"
									className="absolute right-2 top-2.5 text-rose-600/70 hover:text-rose-600 dark:text-rose-400/70 dark:hover:text-rose-400"
								/>
							)}
						</div>
					)}

					{abortedSpans.length > 0 && (
						<button
							type="button"
							onClick={() => select(abortedSpans[0].spanId)}
							className="flex flex-col w-full items-center gap-2 rounded-lg cursor-pointer bg-amber-500/10 dark:hover:bg-amber-500/20 shadow-(--custom-shadow-amber) px-3 py-2.5 text-left text-sm text-amber-700 transition-colors hover:bg-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400"
						>
							<div className="flex w-full items-center gap-2">
								<IconPlayerStopFilled className="size-4 shrink-0" />
								<span className="font-medium">
									{abortedSpans.length === 1
										? "Run aborted"
										: `${abortedSpans.length} spans aborted`}
								</span>
							</div>
							{abortedSpans[0].errorMessage && (
								<span className="w-full truncate text-left text-amber-700/80 dark:text-amber-400/80">
									{abortedSpans[0].errorMessage}
								</span>
							)}
						</button>
					)}

					<div className="flex items-start gap-6">
						<div className="min-w-0 flex-1">
							<TraceTimeline
								spans={spans}
								selected={selected}
								onSelect={select}
								autoPlay={searchParams.get("replay") === "1"}
								scores={scores.data ?? []}
								evalMeta={evalMeta}
								presetName={presetName}
							/>
						</div>
						<DetailPanel
							span={isTraceSelected ? null : active}
							scores={activeScores}
							trace={isTraceSelected ? traceSummary : null}
							evalMeta={evalMeta}
							presetName={presetName}
							onClose={() => select(null)}
						/>
					</div>
				</>
			)}
		</>
	);
}

function ContextChip({
	href,
	icon: Icon,
	iconClassName,
	label,
}: {
	href: string;
	icon: React.ComponentType<{ className?: string }>;
	iconClassName: string;
	label: string;
}) {
	return (
		<Link
			// biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
			href={href as any}
			className="inline-flex max-w-xs items-center gap-[5px] rounded-full bg-card px-2.5 pl-2 py-1 text-muted-foreground shadow-(--custom-shadow) transition-colors hover:text-foreground"
		>
			<Icon className={cn("size-3.5 shrink-0", iconClassName)} />
			<span className="truncate">{label}</span>
			<IconArrowUpRight className={cn("size-3.5 shrink-0 -ml-0.5 mt-px")} />
		</Link>
	);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-[3px]">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="text-sm tabular-nums">{value}</span>
		</div>
	);
}

// RAG/grounding citations captured on the span (StepResult.sources), as a JSON
// array. Parsed defensively — a malformed blob yields no sources, never throws.
type ParsedSource = { title?: string; url?: string };
function parseSources(raw: string | null | undefined): ParsedSource[] {
	if (!raw) return [];
	try {
		const arr = JSON.parse(raw) as unknown;
		if (!Array.isArray(arr)) return [];
		return arr.map((s) => {
			const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
			return {
				title: typeof o.title === "string" ? o.title : undefined,
				url: typeof o.url === "string" ? o.url : undefined,
			};
		});
	} catch {
		return [];
	}
}

// Percent of a rate-limit quota still available, or null when not computable.
function pctRemaining(
	remaining: number | null | undefined,
	limit: number | null | undefined,
): number | null {
	if (remaining == null || limit == null || limit <= 0) return null;
	return Math.round((remaining / limit) * 100);
}

// Width of the span inspector when open. The timeline (a flex sibling, flex-1)
// gives up exactly this much room, so the panel reads as carved out of the same
// canvas — same technique as the Foggy chat.
const PANEL_WIDTH = 420;

// The slide-in matches Foggy's panel exactly so the two read as one motion
// language across the app.
const PANEL_EASE = [0.32, 0.72, 0, 1] as const;

// Horizontal breathing room inside the aside's clip box so the card's shadow
// (a 1px ring + ~4px blur, fully *outside* the card in light mode) isn't cut
// off by overflow-x-clip. The aside grows by this much per side and pulls
// itself back with an equal negative margin, so the card's resting position
// and the layout's effective width are unchanged.
const PANEL_GUTTER = 8;

/**
 * The right-hand inspector — opens for either a single span or the whole trace.
 * Selecting one animates the panel's width open (squeezing the timeline beside
 * it); deselecting animates it shut. While it's already open, switching targets
 * just swaps the content — the width target is unchanged, so no reopen animation
 * runs. The last target is kept mounted through the close so its content doesn't
 * vanish before the panel finishes collapsing.
 */
function DetailPanel({
	span,
	scores,
	trace,
	evalMeta,
	presetName,
	onClose,
}: {
	span: Span | null;
	scores: TraceScore[];
	trace: TraceSummary | null;
	evalMeta: Map<string, EvalMeta>;
	presetName: Map<string, string>;
	onClose: () => void;
}) {
	const open = span !== null || trace !== null;
	// Freeze the rendered target while open so a close (which nulls everything)
	// collapses the panel over the last content rather than blanking it first.
	type Shown =
		| { kind: "span"; span: Span; scores: TraceScore[] }
		| { kind: "trace"; trace: TraceSummary };
	const [shown, setShown] = useState<Shown | null>(
		trace
			? { kind: "trace", trace }
			: span
				? { kind: "span", span, scores }
				: null,
	);
	useEffect(() => {
		if (trace) setShown({ kind: "trace", trace });
		else if (span) setShown({ kind: "span", span, scores });
	}, [span, scores, trace]);

	return (
		<motion.aside
			initial={false}
			animate={{
				width: open ? PANEL_WIDTH + PANEL_GUTTER * 2 : 0,
				marginInline: open ? -PANEL_GUTTER : 0,
			}}
			transition={{ duration: 0.25, ease: PANEL_EASE }}
			// Clip only the horizontal axis (all the width collapse needs); the
			// vertical stays visible so the card's shadow isn't cut off top/bottom.
			// `overflow-x: clip` keeps `overflow-y: visible` (unlike `hidden`).
			className="sticky top-0 shrink-0 self-start overflow-x-clip"
			aria-hidden={!open}
		>
			{/* Fixed-width inner so content doesn't reflow while the panel animates.
          The PANEL_GUTTER inset keeps the card's left/right shadow inside the
          aside's clip box (see PANEL_GUTTER). Vertical stays flush since
          overflow-y is visible. */}
			<div style={{ width: PANEL_WIDTH, marginInline: PANEL_GUTTER }}>
				{shown?.kind === "span" && (
					<SpanDetail
						span={shown.span}
						scores={shown.scores}
						evalMeta={evalMeta}
						presetName={presetName}
						onClose={onClose}
					/>
				)}
				{shown?.kind === "trace" && (
					<TraceDetail
						trace={shown.trace}
						evalMeta={evalMeta}
						presetName={presetName}
						onClose={onClose}
					/>
				)}
			</div>
		</motion.aside>
	);
}

/**
 * The whole-trace inspector — the trace's own rollup (timing, cost, span counts,
 * errors) plus its trace-level eval scores. Mirrors {@link SpanDetail}'s Card
 * chrome so the two read as one inspector that simply swaps contents.
 */
function TraceDetail({
	trace,
	evalMeta,
	presetName,
	onClose,
}: {
	trace: TraceSummary;
	evalMeta: Map<string, EvalMeta>;
	presetName: Map<string, string>;
	onClose: () => void;
}) {
	return (
		<Card className="max-h-[calc(100svh-16rem)] gap-0 py-0 ">
			<CardHeader className="flex shrink-0 items-center gap-2 border-b border-border/40 [.border-b]:pb-5 p-5 px-5">
				<CardTitle className="flex min-w-0 flex-1 items-center gap-2">
					<span className="flex size-5 shrink-0 items-center justify-center rounded-md corner-squircle bg-primary/15 text-primary">
						<IconAffiliate className="size-3" />
					</span>
					<span className="truncate">Whole trace</span>
				</CardTitle>
				<Button
					type="button"
					size="icon-xs"
					variant="ghost"
					onClick={onClose}
					aria-label="Close"
					className="-mr-1 shrink-0"
				>
					<IconX className="size-4" />
				</Button>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col p-0">
				<ScrollFade
					containerClassName="flex min-h-0 flex-1 flex-col"
					className="flex min-h-0 flex-1 flex-col gap-4 py-5"
				>
					<div className="grid grid-cols-2 gap-4 border-b border-border/40 pb-5 px-5">
						<Field label="Started" value={formatDateTime(trace.startTime)} />
						<Field label="Duration" value={formatDuration(trace.durationMs)} />
						<Field label="Cost" value={formatCost(trace.cost)} />
						<Field label="Tokens" value={formatTokens(trace.tokens)} />
						<Field label="Spans" value={formatCount(trace.spanCount)} />
						<Field label="LLM calls" value={formatCount(trace.llmCount)} />
						<Field
							label="Errors"
							value={
								<span
									className={cn(trace.errorCount > 0 && "text-destructive")}
								>
									{formatCount(trace.errorCount)}
								</span>
							}
						/>
					</div>

					{trace.scores.length > 0 && (
						<div className="flex flex-col gap-1 py-5 px-3">
							<span className="text-xs font-medium text-muted-foreground px-2">
								Evals
							</span>
							<div className="flex flex-col">
								{trace.scores.map((s) => (
									<ScoreRow
										key={s.scoreId}
										score={s}
										meta={evalMeta.get(s.evalId)}
										presetName={presetName}
									/>
								))}
							</div>
						</div>
					)}
				</ScrollFade>
			</CardContent>
		</Card>
	);
}

function SpanDetail({
	span,
	scores,
	evalMeta,
	presetName,
	onClose,
}: {
	span: Span;
	scores: TraceScore[];
	evalMeta: Map<string, EvalMeta>;
	presetName: Map<string, string>;
	onClose: () => void;
}) {
	const metaEntries = Object.entries(span.metadata ?? {});
	// Per-dimension cost components that actually carry a value (skip null/0), so
	// the breakdown shows only what applies to this span — e.g. cache costs only
	// appear when caching was used. These sum to span.totalCost.
	const costParts = [
		{ label: "Prompt", value: span.promptCost },
		{ label: "Completion", value: span.completionCost },
		{ label: "Cache read", value: span.cacheReadCost },
		{ label: "Cache write", value: span.cacheWriteCost },
		{ label: "Reasoning", value: span.reasoningCost },
		{ label: "Image", value: span.imageCost },
		{ label: "Web search", value: span.webSearchCost },
		{ label: "Request", value: span.requestCost },
	].filter((p) => p.value != null && p.value !== 0);
	// Usage counters beyond the headline in/out tokens; shown only when present.
	// `tok`-unit rows format as tokens (compact), the rest as plain counts.
	const usageExtras = [
		{ label: "Cached input", value: span.cachedInputTokens, unit: " tok" },
		{
			label: "Cache-write input",
			value: span.cacheWriteInputTokens,
			unit: " tok",
		},
		{ label: "Reasoning", value: span.reasoningTokens, unit: " tok" },
		{ label: "Images", value: span.imageCount, unit: "" },
		{ label: "Web searches", value: span.webSearchCount, unit: "" },
		{ label: "Requests", value: span.requestCount, unit: "" },
	].filter((p) => p.value > 0);
	const hasBreakdown =
		costParts.length > 0 ||
		usageExtras.length > 0 ||
		!!span.pricedModelId ||
		!!span.pricedAt;
	// Secondary provider signals: grounding sources, model-build drift, safety,
	// and normalized rate-limit headroom. Each renders only when captured.
	const sources = parseSources(span.sources);
	const rl = span.rateLimit;
	const hasTokenHeadroom = rl?.tokensRemaining != null && rl?.tokensLimit != null;
	const hasRequestHeadroom = rl?.requestsRemaining != null && rl?.requestsLimit != null;
	const hasSignals =
		!!span.systemFingerprint ||
		!!span.safetyMetadata ||
		sources.length > 0 ||
		hasTokenHeadroom ||
		hasRequestHeadroom;
	return (
		<Card className="max-h-[calc(100svh-16rem)] gap-0 py-0 ">
			<CardHeader className="flex shrink-0 items-center gap-2 border-b border-border/40 [.border-b]:pb-5 p-5 px-5">
				<CardTitle className="flex min-w-0 flex-1 items-center gap-2">
					<span className="truncate">{span.name}</span>
					<SpanTypeBadge type={span.spanType} className="shrink-0" />
				</CardTitle>
				<Button
					type="button"
					size="icon-xs"
					variant="ghost"
					onClick={onClose}
					aria-label="Close"
					className="-mr-1 shrink-0"
				>
					<IconX className="size-4" />
				</Button>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col p-0">
				<ScrollFade
					containerClassName="flex min-h-0 flex-1 flex-col"
					className="flex min-h-0 flex-1 flex-col gap-4 py-5"
				>
					{span.errorMessage && (
						<div className="flex items-start justify-between gap-2 bg-destructive/20 text-sm text-destructive px-3 py-2.5 mb-5 mx-5 corner-squircle shadow-(--custom-shadow-rose) rounded-lg">
							<span className="min-w-0 wrap-break-word">
								{span.errorMessage}
							</span>
							<CopyButton
								value={span.errorMessage}
								title="Copy error"
								className="-mr-1 -mt-0.5 text-muted-foreground hover:text-foreground"
							/>
						</div>
					)}
					<div className="grid grid-cols-2 gap-4 border-b border-border/40 pb-5 px-5">
						<Field label="Started" value={formatDateTime(span.startTime)} />
						<Field label="Cost" value={formatCost(span.totalCost)} />
						<Field label="Duration" value={formatDuration(span.durationMs)} />
						<Field
							label="TTFT"
							value={
								span.ttftMs === null ? (
									"—"
								) : span.reasoningDurationMs != null &&
									span.reasoningDurationMs > 0 ? (
									// Reasoning models: split the wait into thinking time plus the
									// residual until the first visible text. The first-text offset
									// comes from the text chunk samples when captured; otherwise we
									// approximate it with the TTFT itself.
									<span>
										{formatDuration(span.ttftMs)}{" "}
										<span className="text-muted-foreground">
											({formatDuration(span.reasoningDurationMs)} thinking +{" "}
											{formatDuration(
												Math.max(
													0,
													(span.chunkOffsets[0] ?? span.ttftMs) -
														span.reasoningDurationMs,
												),
											)}{" "}
											to first text)
										</span>
									</span>
								) : (
									formatDuration(span.ttftMs)
								)
							}
						/>
						<Field
							label="Model"
							value={
								span.modelId ? (
									<span className="flex min-w-0 items-center gap-1.5">
										<ModelLogo
											provider={span.provider}
											modelId={span.modelId}
											className="size-3 shrink-0"
										/>
										<span className="truncate" title={span.modelId}>
											{formatModelName(span.modelId)}
										</span>
									</span>
								) : (
									"—"
								)
							}
						/>
						<Field label="Provider" value={span.provider ?? "—"} />
						<Field
							label="Tokens"
							value={`${formatTokens(span.inputTokens)} in · ${formatTokens(
								span.outputTokens,
							)} out`}
						/>

						<Field label="Pricing" value={span.pricingSource ?? "—"} />
						{span.modelCallMs != null && (
							<Field
								label="Model call"
								value={
									<span>
										{formatDuration(span.modelCallMs)}{" "}
										<span className="text-muted-foreground">
											(
											{formatDuration(
												Math.max(0, span.durationMs - span.modelCallMs),
											)}{" "}
											tools)
										</span>
									</span>
								}
							/>
						)}
					</div>

					{scores.length > 0 && (
						<div className="flex flex-col gap-1 border-b border-border/40 py-5 px-3">
							<span className="text-xs font-medium text-muted-foreground px-2">
								Evals
							</span>
							<div className="flex flex-col">
								{scores.map((s) => (
									<ScoreRow
										key={s.scoreId}
										score={s}
										meta={evalMeta.get(s.evalId)}
										presetName={presetName}
									/>
								))}
							</div>
						</div>
					)}

					{hasBreakdown && (
						<div className="flex flex-col gap-3 border-b border-border/40 py-5 px-5">
							<span className="text-xs font-medium text-muted-foreground px-1">
								Cost breakdown
							</span>
							{costParts.length > 0 && (
								<div className="grid grid-cols-2 gap-4 px-1">
									{costParts.map((p) => (
										<Field
											key={p.label}
											label={p.label}
											value={formatCost(p.value)}
										/>
									))}
									<Field label="Total" value={formatCost(span.totalCost)} />
								</div>
							)}
						</div>
					)}

					{hasSignals && (
						<div className="flex flex-col gap-3 border-b border-border/40 py-5 px-5">
							<span className="text-xs font-medium text-muted-foreground px-1">
								Provider signals
							</span>
							<div className="grid grid-cols-2 gap-4 px-1">
								{hasTokenHeadroom && (
									<Field
										label="Token headroom"
										value={
											<span>
												{formatTokens(rl!.tokensRemaining!)} /{" "}
												{formatTokens(rl!.tokensLimit!)}
												{pctRemaining(rl!.tokensRemaining, rl!.tokensLimit) !=
													null && (
													<span className="text-muted-foreground">
														{" "}
														({pctRemaining(rl!.tokensRemaining, rl!.tokensLimit)}%
														left)
													</span>
												)}
											</span>
										}
									/>
								)}
								{hasRequestHeadroom && (
									<Field
										label="Request headroom"
										value={
											<span>
												{formatCount(rl!.requestsRemaining!)} /{" "}
												{formatCount(rl!.requestsLimit!)}
												{pctRemaining(
													rl!.requestsRemaining,
													rl!.requestsLimit,
												) != null && (
													<span className="text-muted-foreground">
														{" "}
														(
														{pctRemaining(
															rl!.requestsRemaining,
															rl!.requestsLimit,
														)}
														% left)
													</span>
												)}
											</span>
										}
									/>
								)}
								{rl?.tokensResetMs != null && (
									<Field
										label="Tokens reset"
										value={`in ${formatDuration(rl.tokensResetMs)}`}
									/>
								)}
								{span.systemFingerprint && (
									<Field
										label="Fingerprint"
										value={
											<span
												className="block truncate font-mono text-xs"
												title={span.systemFingerprint}
											>
												{span.systemFingerprint}
											</span>
										}
									/>
								)}
								{span.safetyMetadata && (
									<Field label="Safety ratings" value="reported" />
								)}
							</div>
							{sources.length > 0 && (
								<div className="flex flex-col gap-1 px-1">
									<span className="text-xs text-muted-foreground">
										Sources ({sources.length})
									</span>
									<div className="flex flex-col gap-0.5">
										{sources.slice(0, 8).map((s, i) =>
											s.url ? (
												<a
													key={`${s.url}-${i}`}
													href={s.url}
													target="_blank"
													rel="noreferrer"
													className="truncate text-sm text-sky-400 hover:underline"
													title={s.url}
												>
													{s.title ?? s.url}
												</a>
											) : (
												<span
													key={`src-${i}`}
													className="truncate text-sm"
													title={s.title}
												>
													{s.title ?? "source"}
												</span>
											),
										)}
										{sources.length > 8 && (
											<span className="text-xs text-muted-foreground">
												+{sources.length - 8} more
											</span>
										)}
									</div>
								</div>
							)}
						</div>
					)}

					{span.spanType === "llm" && span.outputTokens > 0 && (
						<TpsHeadline span={span} />
					)}

					{metaEntries.length > 0 && (
						<div className="flex flex-col gap-2 border-b border-border/40 px-5 py-5">
							<span className="text-xs text-muted-foreground">Metadata</span>
							<div className="flex flex-wrap gap-1.5">
								{metaEntries.map(([k, v]) => (
									<Badge key={k} variant="secondary">
										{k}: {v}
									</Badge>
								))}
							</div>
						</div>
					)}

					{span.toolCatalog && (
						<ToolsAvailable
							catalog={span.toolCatalog}
							className="border-b border-border/40 px-5 py-5"
						/>
					)}

					{span.input && (
						<Payload
							label="Input"
							value={span.input}
							className="border-b border-border/40 px-5 py-5"
						/>
					)}
					{span.output && (
						<Payload label="Output" value={span.output} className="px-5 py-5" />
					)}
				</ScrollFade>
			</CardContent>
		</Card>
	);
}

/** Render the captured tool catalog (`{name: {description, parameters}}`) as a
 * list of tools the model was offered, with the full JSON available below.
 * Falls back to the raw JSON payload if the catalog isn't the expected shape. */
function ToolsAvailable({
	catalog,
	className,
}: {
	catalog: string;
	className?: string;
}) {
	const tools = useMemo(() => {
		try {
			const parsed = JSON.parse(catalog);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
				return null;
			return Object.entries(parsed as Record<string, unknown>).map(
				([name, def]) => {
					const d =
						def && typeof def === "object"
							? (def as Record<string, unknown>)
							: {};
					return {
						name,
						description:
							typeof d.description === "string" ? d.description : null,
					};
				},
			);
		} catch {
			return null;
		}
	}, [catalog]);

	if (!tools)
		return (
			<Payload label="Tools available" value={catalog} className={className} />
		);

	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div className="flex items-center justify-between">
				<span className="text-xs text-muted-foreground">
					Tools available ({tools.length})
				</span>
				<CopyButton value={catalog} title="Copy tool catalog" />
			</div>
			<div className="flex flex-wrap gap-1.5">
				{tools.map((t) =>
					t.description ? (
						<TooltipProvider key={t.name} delay={150}>
							<Tooltip>
								<TooltipTrigger
									render={
										<Badge variant="secondary" className="cursor-default">
											{t.name}
										</Badge>
									}
								/>
								<TooltipContent className="max-w-xs">
									{t.description}
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					) : (
						<Badge key={t.name} variant="secondary">
							{t.name}
						</Badge>
					),
				)}
			</div>
		</div>
	);
}

// Pretty-print a payload when it's JSON; otherwise pass it through verbatim.
// `isJson` drives whether we syntax-highlight (json grammar) or render raw text.
function pretty(value: string): { formatted: string; isJson: boolean } {
	try {
		return {
			formatted: JSON.stringify(JSON.parse(value), null, 2),
			isJson: true,
		};
	} catch {
		return { formatted: value, isJson: false };
	}
}

function Payload({
	label,
	value,
	className,
}: {
	label: string;
	value: string;
	className?: string;
}) {
	const { formatted, isJson } = useMemo(() => pretty(value), [value]);
	const html = useShikiHtml(formatted, isJson ? "json" : "typescript");
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div className="flex items-center justify-between">
				<span className="text-xs text-muted-foreground">{label}</span>
				<CopyButton value={formatted} title={`Copy ${label.toLowerCase()}`} />
			</div>
			{html ? (
				// Shiki sets the pre's background via an inline style; `bg-muted!`
				// overrides it (an !important class beats a non-important inline style)
				// so the block matches the panel's other muted surfaces.
				<div
					className="max-h-80 overflow-auto rounded-md text-xs [&_pre]:m-0 [&_pre]:bg-muted! [&_pre]:p-3 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-break-word"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki output
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			) : (
				<pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap wrap-break-word">
					{formatted}
				</pre>
			)}
		</div>
	);
}

