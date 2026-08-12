"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@foglamp/ui/components/tooltip";
import {
	IconAffiliate,
	IconAlertTriangle,
	IconChevronRight,
	IconPlayerStopFilled,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { AgentIcon, agentColor } from "@/components/app/agent-icon";
import {
	type EvalMeta,
	SpanScoreDots,
	type TraceScore,
} from "@/components/app/eval-scores";
import {
	SpanTypeChip,
	spanTypeBar,
	spanTypeIcon,
	spanTypeVariant,
} from "@/components/app/span-type";
import { ModelLogo, modelBrandColor } from "@/components/model-logo";
import { formatCost, formatDuration, formatTokens } from "@/lib/format";
import {
	type TraceSpan,
	computeWindow,
	orderSpans,
	toMs,
} from "@/lib/trace-timeline";
import { cn } from "@/lib/utils";

// Stable empty defaults so the optional score props don't churn memos/effects.
const EMPTY_SCORES: TraceScore[] = [];
const EMPTY_EVAL_META = new Map<string, EvalMeta>();
const EMPTY_PRESET_NAME = new Map<string, string>();

/** Sentinel `selected` value for the synthetic whole-trace root row — distinct
 * from any real span id, so the parent can render a trace-level inspector. */
export const WHOLE_TRACE_ID = "__whole_trace__";

/**
 * The trace hero: a span waterfall on one shared time axis, topped by a time
 * ruler. A shared 3-column grid (`[11rem | track | 6.5rem]`) keeps the
 * gridlines and bars in perfect column alignment; the same
 * `left-[11rem] right-[6.5rem]` insets position the absolute overlays over the
 * track. Selecting a bar drives the inspector the parent renders alongside.
 */
export function TraceTimeline({
	spans,
	selected,
	onSelect,
	scores = EMPTY_SCORES,
	evalMeta = EMPTY_EVAL_META,
	presetName = EMPTY_PRESET_NAME,
}: {
	spans: TraceSpan[];
	selected: string | null;
	onSelect: (spanId: string | null) => void;
	/** The trace's eval scores — folded into the header (whole-trace) and onto
	 * each span row (per-span indicators), so the timeline doubles as the scores
	 * view rather than repeating the span list in a separate card. */
	scores?: TraceScore[];
	evalMeta?: Map<string, EvalMeta>;
	presetName?: Map<string, string>;
}) {
	const window = useMemo(() => computeWindow(spans), [spans]);
	const ordered = useMemo(() => orderSpans(spans), [spans]);
	const total = window.span;

	// Span-type visibility chips + per-row collapse. Both are view-local state:
	// hiding a type filters individual rows (agent containers always stay), and
	// collapsing a row hides its whole subtree.
	const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const toggleType = (type: string) =>
		setHiddenTypes((prev) => {
			const next = new Set(prev);
			if (next.has(type)) next.delete(type);
			else next.add(type);
			return next;
		});
	const toggleCollapse = (spanId: string) =>
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(spanId)) next.delete(spanId);
			else next.add(spanId);
			return next;
		});

	// Non-agent span counts per type — the filter chips (agent rows are the
	// tree's skeleton, so they're not filterable).
	const typeCounts = useMemo(() => {
		const m = new Map<string, number>();
		for (const s of spans) {
			if (s.spanType === "agent") continue;
			m.set(s.spanType, (m.get(s.spanType) ?? 0) + 1);
		}
		return [...m.entries()];
	}, [spans]);

	// The rows actually rendered: walk the depth-first order once, dropping
	// subtrees under a collapsed row (tracked as a stack of collapsed depths)
	// and rows whose type is hidden. Descendant counts feed the "+N" collapse
	// indicator and double as hasChildren.
	const visibleRows = useMemo(() => {
		const out: {
			span: TraceSpan;
			depth: number;
			hasChildren: boolean;
			descendants: number;
		}[] = [];
		const collapseDepths: number[] = [];
		for (let i = 0; i < ordered.length; i++) {
			const { span, depth } = ordered[i];
			while (
				collapseDepths.length > 0 &&
				depth <= collapseDepths[collapseDepths.length - 1]
			) {
				collapseDepths.pop();
			}
			const hiddenByAncestor = collapseDepths.length > 0;
			if (collapsed.has(span.spanId)) collapseDepths.push(depth);
			if (hiddenByAncestor) continue;
			if (hiddenTypes.has(span.spanType) && span.spanType !== "agent") continue;
			let descendants = 0;
			for (let j = i + 1; j < ordered.length && ordered[j].depth > depth; j++) {
				descendants++;
			}
			out.push({ span, depth, hasChildren: descendants > 0, descendants });
		}
		return out;
	}, [ordered, collapsed, hiddenTypes]);

	// Trace-wide cost/token rollup for the synthetic "Whole trace" root row.
	const traceTotals = useMemo(() => {
		let cost = 0;
		let priced = false;
		let tokens = 0;
		for (const s of spans) {
			if (s.totalCost != null) {
				cost += s.totalCost;
				priced = true;
			}
			tokens += s.totalTokens;
		}
		return { cost: priced ? cost : null, tokens };
	}, [spans]);

	// Split scores into whole-trace (header strip) and per-span (row indicators).
	const traceScores = useMemo(
		() => scores.filter((s) => s.targetType !== "span"),
		[scores],
	);
	const spanScores = useMemo(() => {
		const m = new Map<string, TraceScore[]>();
		for (const s of scores) {
			if (s.targetType !== "span") continue;
			const arr = m.get(s.targetId);
			if (arr) arr.push(s);
			else m.set(s.targetId, [s]);
		}
		return m;
	}, [scores]);

	return (
		<div className="flex flex-col">
			{/* Span-type filter chips — only worth the row once there's a mix. */}
			{typeCounts.length > 1 && (
				<div className="mb-2 flex flex-wrap items-center gap-1.5">
					{typeCounts.map(([type, count]) => {
						const TypeIcon = spanTypeIcon(type);
						const hidden = hiddenTypes.has(type);
						return (
							<button
								key={type}
								type="button"
								aria-pressed={!hidden}
								onClick={() => toggleType(type)}
								title={hidden ? `Show ${type} spans` : `Hide ${type} spans`}
								className="cursor-pointer"
							>
								<Badge
									variant={hidden ? "secondary" : spanTypeVariant(type)}
									className={cn("gap-1 font-sans", hidden && "opacity-45")}
								>
									<TypeIcon className="size-3" />
									{type} · {count}
								</Badge>
							</button>
						);
					})}
				</div>
			)}

			{/* Time ruler, aligned to the bar track. */}
			<div className="grid grid-cols-[11rem_minmax(0,1fr)_6.5rem] items-center">
				<div />
				<TimeRuler total={total} />
				<div />
			</div>

			<div className="relative">
				{/* Quarter-point time gridlines, behind the bars. */}
				<div className="pointer-events-none absolute inset-y-0 left-[11rem] right-[6.5rem] z-0">
					{GRID_FRACTIONS.map((f) => (
						<div
							key={f}
							className="absolute inset-y-0 w-px bg-border/50"
							style={{ left: `${f * 100}%` }}
						/>
					))}
				</div>

				{/* Waterfall bars. */}
				<TooltipProvider delay={150}>
					<div className="relative z-10 flex flex-col gap-0.5">
						{/* Whole-trace root row — the entire trace as one bar; every
						    real span indents beneath it. */}
						<button
							type="button"
							onClick={() =>
								onSelect(selected === WHOLE_TRACE_ID ? null : WHOLE_TRACE_ID)
							}
							className={cn(
								"grid w-full cursor-pointer grid-cols-[11rem_minmax(0,1fr)_6.5rem] items-center rounded-md py-1 text-left text-sm hover:bg-accent/50",
								selected === WHOLE_TRACE_ID && "bg-accent/70",
							)}
						>
							<div className="flex min-w-0 items-start gap-2 pr-3 pl-1">
								<span className="flex size-5 shrink-0 items-center justify-center rounded-md corner-squircle bg-primary/15 text-primary">
									<IconAffiliate className="size-3" />
								</span>
								<div className="flex min-w-0 flex-col gap-1">
									<span className="font-medium break-words">Whole trace</span>
									{traceScores.length > 0 && (
										<SpanScoreDots
											scores={traceScores}
											evalMeta={evalMeta}
											presetName={presetName}
											max={3}
										/>
									)}
								</div>
							</div>
							<div className="relative h-5">
								<div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full">
									<div className="h-full w-full rounded-xs bg-primary/50" />
								</div>
							</div>
							<div className="flex flex-col items-end pr-1 text-right">
								<span className="text-[11px] font-medium text-foreground/80 tabular-nums">
									{formatDuration(total)}
								</span>
								{(traceTotals.cost != null || traceTotals.tokens > 0) && (
									<span className="whitespace-nowrap text-[10px] text-muted-foreground tabular-nums">
										{traceTotals.cost != null && formatCost(traceTotals.cost)}
										{traceTotals.cost != null &&
											traceTotals.tokens > 0 &&
											" · "}
										{traceTotals.tokens > 0 && formatTokens(traceTotals.tokens)}
									</span>
								)}
							</div>
						</button>

						{visibleRows.map(({ span, depth, hasChildren, descendants }) => {
							const isCollapsed = collapsed.has(span.spanId);
							const offsetMs = toMs(span.startTime) - window.start;
							const offset = (offsetMs / total) * 100;
							// Clamp to the remaining track so a span whose end rounds past
							// the window — or one that hits the min-width floor near the end —
							// can't spill the bar past the track's right edge.
							const width = Math.min(
								Math.max((span.durationMs / total) * 100, 1.5),
								Math.max(100 - offset, 0),
							);
							const isError = span.status === "error";
							// Aborted: a clean cancellation (AI SDK onAbort), amber — distinct
							// from an error, not counted toward error rate.
							const isAborted = span.status === "aborted";
							const isAgent = span.spanType === "agent";
							// Agent spans take their reproducible per-name color, matching the
							// agent icon elsewhere, instead of the flat type palette.
							const accent = isAgent ? agentColor(span.name) : null;
							// LLM spans show the model's brand logo (instead of the generic
							// sparkles chip), tinted with the vendor's brand color.
							const isLlm = span.spanType === "llm" && !!span.modelId;
							const modelColor = isLlm
								? modelBrandColor(span.provider, span.modelId)
								: null;
							const ttftRel =
								span.ttftMs != null ? offsetMs + span.ttftMs : null;
							// Thinking phase: violet overlay across the reasoning window,
							// bar-relative. Only when the SDK reported a real duration —
							// old spans / non-reasoning models render nothing new.
							const thinkingMs =
								span.spanType === "llm" &&
								span.reasoningDurationMs != null &&
								span.reasoningDurationMs > 0 &&
								span.durationMs > 0
									? span.reasoningDurationMs
									: null;
							// Anchor at TTFT: the first reasoning chunk is what stamps TTFT,
							// so it approximates where reasoning began within the step.
							const thinkingLeftPct =
								thinkingMs != null
									? Math.min(((span.ttftMs ?? 0) / span.durationMs) * 100, 100)
									: 0;
							const thinkingWidthPct =
								thinkingMs != null
									? Math.min(
											(thinkingMs / span.durationMs) * 100,
											100 - thinkingLeftPct,
										)
									: 0;
							// Model-call phase: the pure provider call leads the step; the
							// remainder of the bar is client-side tool execution. Sky tint,
							// rendered under the violet thinking overlay. Only when the SDK
							// reported a real model-call duration (v7).
							const modelCallMs =
								span.spanType === "llm" &&
								span.modelCallMs != null &&
								span.modelCallMs > 0 &&
								span.durationMs > 0
									? Math.min(span.modelCallMs, span.durationMs)
									: null;
							const modelCallWidthPct =
								modelCallMs != null
									? Math.min((modelCallMs / span.durationMs) * 100, 100)
									: 0;
							const toolTailMs =
								modelCallMs != null
									? Math.max(0, span.durationMs - modelCallMs)
									: 0;
							const rowScores = spanScores.get(span.spanId);
							// Bar fill: error → rose, aborted → amber, agent → its accent
							// (inline), else palette.
							const barClass = isError
								? "bg-rose-500"
								: isAborted
									? "bg-amber-500"
									: isAgent
										? undefined
										: spanTypeBar(span.spanType);
							const barStyle =
								!isError && !isAborted && accent
									? { backgroundColor: accent }
									: undefined;
							const hasBadges = isError || isAborted || !!rowScores;
							return (
								<button
									key={span.spanId}
									type="button"
									onClick={() =>
										onSelect(span.spanId === selected ? null : span.spanId)
									}
									className={cn(
										"grid cursor-pointer grid-cols-[11rem_minmax(0,1fr)_6.5rem] items-center rounded-md py-1 text-left text-sm hover:bg-accent/50",
										span.spanId === selected && "bg-accent/70",
									)}
								>
									<div
										className="flex min-w-0 items-start gap-2 pr-3"
										style={{ paddingLeft: (depth + 1) * 14 + 4 }}
									>
										{/* Collapse chevron — a styled span (not a nested button,
                        which would be invalid inside the row button). Rows
                        without children keep an invisible slot so labels align. */}
										<span
											// biome-ignore lint/a11y/useSemanticElements: a real <button> can't nest inside the row's button element
											role="button"
											aria-hidden={!hasChildren}
											tabIndex={hasChildren ? 0 : -1}
											onClick={(e) => {
												if (!hasChildren) return;
												e.stopPropagation();
												toggleCollapse(span.spanId);
											}}
											onKeyDown={(e) => {
												if (!hasChildren) return;
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													e.stopPropagation();
													toggleCollapse(span.spanId);
												}
											}}
											title={isCollapsed ? "Expand" : "Collapse"}
											className={cn(
												"mt-[3px] flex size-3.5 shrink-0 items-center justify-center",
												hasChildren
													? "cursor-pointer text-muted-foreground/50 hover:text-foreground"
													: "pointer-events-none opacity-0",
											)}
										>
											<IconChevronRight
												className={cn(
													"size-3 transition-transform",
													hasChildren && !isCollapsed && "rotate-90",
												)}
											/>
										</span>
										{isAgent ? (
											<span
												title={span.spanType}
												className="flex size-5 shrink-0 items-center justify-center rounded-md corner-squircle"
												style={{ backgroundColor: `${accent}26` }}
											>
												<AgentIcon name={span.name} className="size-3" />
											</span>
										) : isLlm ? (
											<span
												title={span.modelId ?? span.spanType}
												className={cn(
													"flex size-5 shrink-0 items-center justify-center rounded-md corner-squircle",
													!modelColor && "bg-muted",
												)}
												style={
													modelColor
														? { backgroundColor: `${modelColor}26` }
														: undefined
												}
											>
												<ModelLogo
													provider={span.provider}
													modelId={span.modelId}
													className="size-3"
												/>
											</span>
										) : (
											<SpanTypeChip type={span.spanType} />
										)}
										<div className="flex min-w-0 flex-col gap-1">
											<span className="break-words">
												{span.name}
												{isCollapsed && descendants > 0 && (
													<span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
														+{descendants} hidden
													</span>
												)}
											</span>
											{hasBadges && (
												<div className="flex flex-wrap items-center gap-1.5">
													{isError && (
														<Badge variant="rose" className="shrink-0 gap-1">
															<IconAlertTriangle className="size-3" />
															error
														</Badge>
													)}
													{isAborted && (
														<Badge variant="amber" className="shrink-0 gap-1">
															<IconPlayerStopFilled className="size-3" />
															aborted
														</Badge>
													)}
													{rowScores && (
														<SpanScoreDots
															scores={rowScores}
															evalMeta={evalMeta}
															presetName={presetName}
															max={2}
														/>
													)}
												</div>
											)}
										</div>
									</div>
									<div className="relative h-5">
										<Tooltip>
											<TooltipTrigger
												render={
													<div
														className="absolute top-1/2 h-2 -translate-y-1/2 rounded-xs"
														style={{ left: `${offset}%`, width: `${width}%` }}
													>
														{/* Base track. */}
														<div
															className={cn(
																"h-full w-full rounded-xs",
																barClass,
															)}
															style={barStyle}
														/>
														{/* Model-call phase — sky tint over the pure
	                              provider call; the tail is tool execution. */}
														{modelCallMs != null && modelCallWidthPct > 0 && (
															<div
																className="absolute inset-y-0 left-0 rounded-xs bg-sky-400/30"
																style={{ width: `${modelCallWidthPct}%` }}
															/>
														)}
														{/* Thinking phase — violet stretch over the
	                              reasoning window within the step. */}
														{thinkingMs != null && thinkingWidthPct > 0 && (
															<div
																className="absolute inset-y-0 rounded-xs bg-violet-500/80"
																style={{
																	left: `${thinkingLeftPct}%`,
																	width: `${thinkingWidthPct}%`,
																}}
															/>
														)}
													</div>
												}
											/>
											<TooltipContent className="flex flex-col gap-0.5">
												<span>
													{formatDuration(span.durationMs)} · starts +
													{formatDuration(offsetMs)}
												</span>
												{modelCallMs != null && (
													<span className="text-sky-300">
														Model: {formatDuration(modelCallMs)}
														{toolTailMs > 0 &&
															` · Tools: ${formatDuration(toolTailMs)}`}
													</span>
												)}
												{thinkingMs != null && (
													<span className="text-violet-300">
														Thinking: {formatDuration(thinkingMs)}
													</span>
												)}
												{(span.totalCost != null || span.totalTokens > 0) && (
													<span className="text-muted-foreground">
														{span.totalCost != null &&
															formatCost(span.totalCost)}
														{span.totalCost != null &&
															span.totalTokens > 0 &&
															" · "}
														{span.totalTokens > 0 &&
															`${formatTokens(span.totalTokens)} tok`}
													</span>
												)}
											</TooltipContent>
										</Tooltip>
										{ttftRel != null && span.spanType === "llm" && (
											<div
												className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-amber-500"
												style={{ left: `${(ttftRel / total) * 100}%` }}
												title="First token"
											/>
										)}
									</div>
									<div className="flex flex-col items-end pr-1 text-right">
										<span className="text-[11px] font-medium text-foreground/80 tabular-nums">
											{formatDuration(span.durationMs)}
										</span>
										{(span.totalCost != null || span.totalTokens > 0) && (
											<span className="whitespace-nowrap text-[10px] text-muted-foreground tabular-nums">
												{span.totalCost != null && formatCost(span.totalCost)}
												{span.totalCost != null &&
													span.totalTokens > 0 &&
													" · "}
												{span.totalTokens > 0 && formatTokens(span.totalTokens)}
											</span>
										)}
									</div>
								</button>
							);
						})}
					</div>
				</TooltipProvider>
			</div>
		</div>
	);
}

// Vertical gridline fractions across the track — quarter marks, doubling as the
// ruler's tick positions so the gridlines and time labels all align.
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;

/**
 * A thin time ruler that sits above the bars and spans the track column.
 * Quarter-point labels mark elapsed time across the window; the last one
 * right-aligns so it doesn't overflow the track.
 */
function TimeRuler({ total }: { total: number }) {
	return (
		<div className="relative h-5 select-none">
			{GRID_FRACTIONS.map((frac) => (
				<span
					key={frac}
					className={cn(
						"absolute top-0 text-[10px] text-muted-foreground/60 tabular-nums",
						frac === 1 && "-translate-x-full",
					)}
					style={{ left: `${frac * 100}%` }}
				>
					{formatDuration(total * frac)}
				</span>
			))}
		</div>
	);
}
