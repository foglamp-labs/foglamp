"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@foglamp/ui/components/tooltip";
import {
	IconAffiliate,
	IconAlertTriangle,
	IconPlayerPauseFilled,
	IconPlayerPlayFilled,
} from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";

import { AgentIcon, agentColor } from "@/components/app/agent-icon";
import {
	type EvalMeta,
	SpanScoreDots,
	type TraceScore,
} from "@/components/app/eval-scores";
import { SpanTypeChip, spanTypeBar } from "@/components/app/span-type";
import { ModelLogo, modelBrandColor } from "@/components/model-logo";
import {
	formatCost,
	formatDuration,
	formatTokens,
	formatTps,
} from "@/lib/format";
import {
	type TraceSpan,
	computeWindow,
	hasChunkSamples,
	orderSpans,
	peakTps,
	throughputSeries,
	toMs,
	tokensAtOffset,
} from "@/lib/trace-timeline";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

// Same spring the ViewToggle / eval sample-rate pill use, so segmented controls
// across the app glide identically.
const MORPH = { type: "spring", stiffness: 400, damping: 38 } as const;

// Stable empty defaults so the optional score props don't churn memos/effects.
const EMPTY_SCORES: TraceScore[] = [];
const EMPTY_EVAL_META = new Map<string, EvalMeta>();
const EMPTY_PRESET_NAME = new Map<string, string>();

/** Sentinel `selected` value for the synthetic whole-trace root row — distinct
 * from any real span id, so the parent can render a trace-level inspector. */
export const WHOLE_TRACE_ID = "__whole_trace__";

/**
 * The fused trace hero: a span waterfall layered over a faint aggregate
 * throughput backdrop on ONE shared time axis, fronted by a drag-to-seek ruler,
 * with a playhead that sweeps everything together. A shared 3-column grid
 * (`[11rem | track | 6.5rem]`) keeps the backdrop, time gridlines, playhead, and
 * bars in perfect column alignment; the same `left-[11rem] right-[6.5rem]` insets
 * position the absolute overlays over the track. Selecting a bar drives the
 * inspector the parent renders alongside; dragging the ruler seeks playback.
 */
export function TraceTimeline({
	spans,
	selected,
	onSelect,
	autoPlay = false,
	scores = EMPTY_SCORES,
	evalMeta = EMPTY_EVAL_META,
	presetName = EMPTY_PRESET_NAME,
}: {
	spans: TraceSpan[];
	selected: string | null;
	onSelect: (spanId: string | null) => void;
	autoPlay?: boolean;
	/** The trace's eval scores — folded into the header (whole-trace) and onto
	 * each span row (per-span indicators), so the timeline doubles as the scores
	 * view rather than repeating the span list in a separate card. */
	scores?: TraceScore[];
	evalMeta?: Map<string, EvalMeta>;
	presetName?: Map<string, string>;
}) {
	const reduce = useReducedMotion();
	const window = useMemo(() => computeWindow(spans), [spans]);
	const ordered = useMemo(() => orderSpans(spans), [spans]);
	const series = useMemo(
		() => throughputSeries(spans, window),
		[spans, window],
	);
	const peak = useMemo(() => peakTps(series), [series]);
	const total = window.span;

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

	const [elapsed, setElapsed] = useState(0);
	const [playing, setPlaying] = useState(autoPlay && !reduce);
	const [speed, setSpeed] = useState<Speed>(1);
	const speedPillId = useId();
	const [scrubbing, setScrubbing] = useState(false);
	const lastFrame = useRef<number | null>(null);

	// rAF playback loop — advances `elapsed` by wall-clock × speed, stopping at
	// the end. The DOM is small (one row per span) so per-frame re-render is fine.
	useEffect(() => {
		if (!playing) {
			lastFrame.current = null;
			return;
		}
		let raf = 0;
		const tick = (now: number) => {
			const prev = lastFrame.current ?? now;
			lastFrame.current = now;
			setElapsed((e) => {
				const next = e + (now - prev) * speed;
				if (next >= total) {
					setPlaying(false);
					return total;
				}
				return next;
			});
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, speed, total]);

	const toggle = useCallback(() => {
		setPlaying((p) => {
			if (!p && elapsed >= total) setElapsed(0); // replay from the start
			return !p;
		});
	}, [elapsed, total]);

	// Only show the playhead once playback has been engaged (or scrubbed) — at
	// rest the ribbon reads as a clean static fingerprint.
	const engaged = playing || scrubbing || elapsed > 0;
	const progress = Math.min((elapsed / total) * 100, 100);

	// The llm step currently generating (if any) and its live readout.
	const live = useMemo(() => {
		if (!engaged) return null;
		for (const s of spans) {
			if (s.spanType !== "llm") continue;
			const startRel = toMs(s.startTime) - window.start;
			const endRel = startRel + s.durationMs;
			if (elapsed < startRel || elapsed > endRel || !hasChunkSamples(s))
				continue;
			const offset = elapsed - startRel;
			const tokens = tokensAtOffset(s, offset);
			const past = offset - (s.ttftMs ?? 0);
			return {
				name: s.name,
				tokens,
				tps: past > 0 ? (tokens / past) * 1000 : null,
			};
		}
		return null;
	}, [spans, elapsed, window.start, engaged]);

	return (
		<div className="flex flex-col gap-3">
			{/* Header: title + live readout + transport. */}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-baseline gap-2">
					<span className="text-sm font-medium">Throughput</span>
					<span className="text-xs text-muted-foreground tabular-nums">
						peak {Math.round(peak)} tok/s
					</span>
				</div>
				<div className="flex items-center gap-2">
					{live && (
						<span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
							<span className="text-foreground">{live.name}</span> ·{" "}
							{formatTokens(Math.round(live.tokens))} tok
							{live.tps !== null && <> · {formatTps(live.tps)}</>}
						</span>
					)}
					{/* Segmented speed control — mirrors ViewToggle's sliding pill. */}
					<div className="inline-flex h-8 items-center rounded-2xl corner-squircle p-0.5 px-1 shadow-(--custom-shadow) dark:bg-input/20">
						{SPEEDS.map((s) => {
							const active = speed === s;
							return (
								<button
									key={s}
									type="button"
									aria-label={`${s}× speed`}
									aria-pressed={active}
									title={`${s}× speed`}
									onClick={() => setSpeed(s)}
									className={cn(
										"relative flex h-6 min-w-7 cursor-pointer items-center justify-center rounded-2xl corner-squircle px-1.5 font-medium text-xs tabular-nums transition-colors",
										active
											? "text-foreground"
											: "text-muted-foreground/60 hover:text-foreground",
									)}
								>
									{active && (
										<motion.span
											layoutId={speedPillId}
											transition={MORPH}
											className="absolute inset-0 rounded-2xl corner-squircle bg-muted shadow-(--custom-shadow) dark:bg-input/50"
										/>
									)}
									<span className="relative z-10">{s}×</span>
								</button>
							);
						})}
					</div>
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						onClick={toggle}
						aria-label={playing ? "Pause" : "Play"}
					>
						{playing ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
					</Button>
				</div>
			</div>

			{/* Fused waterfall: a drag-to-seek ruler on top, then the span bars
          layered over a faint throughput backdrop + time gridlines, all sharing
          one playhead. The track column is fixed by the shared grid template so
          the backdrop, gridlines, and playhead line up with the bars. */}
			<div className="flex flex-col">
				{/* Drag-to-seek time ruler, aligned to the bar track. */}
				<div className="grid grid-cols-[11rem_minmax(0,1fr)_6.5rem] items-center">
					<div />
					<ScrubRuler
						total={total}
						onSeek={(pct) => {
							setPlaying(false);
							setScrubbing(true);
							setElapsed((pct / 100) * total);
						}}
						onSeekEnd={() => setScrubbing(false)}
					/>
					<div />
				</div>

				<div className="relative">
					{/* Throughput curve + time gridlines, behind the bars. */}
					<div className="pointer-events-none absolute inset-y-0 left-[11rem] right-[6.5rem] z-0">
						<ThroughputBackdrop series={series} peak={peak} total={total} />
					</div>

					{/* Shared playhead, spanning only the track column. */}
					{engaged && (
						<div className="pointer-events-none absolute inset-y-0 left-[11rem] right-[6.5rem] z-20">
							<div
								className="absolute inset-y-0 w-px bg-foreground/50"
								style={{ left: `${progress}%` }}
							>
								<div className="absolute -top-1 -left-[3px] size-1.5 rounded-full bg-foreground/70" />
							</div>
						</div>
					)}

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
										<div
											className={cn(
												"h-full w-full rounded-full bg-primary/70 transition-opacity",
												engaged && "opacity-20",
											)}
										/>
										{engaged && progress > 0 && (
											<div
												className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
												style={{ width: `${progress}%` }}
											/>
										)}
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
											{traceTotals.tokens > 0 &&
												formatTokens(traceTotals.tokens)}
										</span>
									)}
								</div>
							</button>

							{ordered.map(({ span, depth }) => {
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
								const thinkingLeftPct =
									thinkingMs != null
										? Math.min(
												((span.reasoningOffsets[0] ?? 0) / span.durationMs) *
													100,
												100,
											)
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
								// Replay drives each bar: while engaged the bar is a faint
								// track that fills up to the playhead as time crosses its
								// window; the span currently running gets a glow.
								const reachedMs = Math.min(
									Math.max(elapsed - offsetMs, 0),
									span.durationMs,
								);
								const fillPct =
									span.durationMs > 0
										? (reachedMs / span.durationMs) * 100
										: engaged && elapsed >= offsetMs
											? 100
											: 0;
								const isActive =
									engaged &&
									elapsed >= offsetMs &&
									elapsed <= offsetMs + span.durationMs;
								// Bar fill: error → rose, agent → its accent (inline), else palette.
								const barClass = isError
									? "bg-rose-500"
									: isAgent
										? undefined
										: spanTypeBar(span.spanType);
								const barStyle =
									!isError && accent ? { backgroundColor: accent } : undefined;
								const hasBadges = isError || !!rowScores;
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
												<span className="break-words">{span.name}</span>
												{hasBadges && (
													<div className="flex flex-wrap items-center gap-1.5">
														{isError && (
															<Badge variant="rose" className="shrink-0 gap-1">
																<IconAlertTriangle className="size-3" />
																error
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
															className={cn(
																"absolute top-1/2 h-2 -translate-y-1/2 rounded-full",
																isActive &&
																	"ring-2 ring-foreground/30 ring-offset-1 ring-offset-background",
															)}
															style={{ left: `${offset}%`, width: `${width}%` }}
														>
															{/* Base track — full color at rest, faint while
                              replaying so the fill reads as progress. */}
															<div
																className={cn(
																	"h-full w-full rounded-full transition-opacity",
																	barClass,
																	engaged && "opacity-20",
																)}
																style={barStyle}
															/>
															{/* Fill — grows left-to-right up to the playhead. */}
															{engaged && fillPct > 0 && (
																<div
																	className={cn(
																		"absolute inset-y-0 left-0 rounded-full",
																		barClass,
																	)}
																	style={
																		barStyle
																			? { ...barStyle, width: `${fillPct}%` }
																			: { width: `${fillPct}%` }
																	}
																/>
															)}
															{/* Model-call phase — sky tint over the pure
	                              provider call; the tail is tool execution. */}
															{modelCallMs != null && modelCallWidthPct > 0 && (
																<div
																	className={cn(
																		"absolute inset-y-0 left-0 rounded-full bg-sky-400/30 transition-opacity",
																		engaged && "opacity-30",
																	)}
																	style={{ width: `${modelCallWidthPct}%` }}
																/>
															)}
															{/* Thinking phase — violet stretch over the
	                              reasoning window within the step. */}
															{thinkingMs != null && thinkingWidthPct > 0 && (
																<div
																	className={cn(
																		"absolute inset-y-0 rounded-full bg-violet-500/80 transition-opacity",
																		engaged && "opacity-30",
																	)}
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
													{span.totalTokens > 0 &&
														formatTokens(span.totalTokens)}
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
		</div>
	);
}

// Vertical gridline fractions across the track — quarter marks, doubling as the
// ruler's tick positions so the curve, gridlines, and time labels all align.
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;

/**
 * The aggregate throughput curve, drawn faintly *behind* the waterfall bars as a
 * full-bleed backdrop with quarter-point time gridlines. A dependency-free SVG
 * that stretches to the track width (`preserveAspectRatio="none"`) so its x-axis
 * shares the bars' time axis exactly. Non-interactive — seeking lives in the
 * {@link ScrubRuler} above the bars.
 */
function ThroughputBackdrop({
	series,
	peak,
	total,
}: {
	series: { ms: number; tps: number }[];
	peak: number;
	total: number;
}) {
	const gradId = useId();
	const W = 1000;
	const H = 120;

	const { area, line } = useMemo(() => {
		if (series.length === 0) return { area: "", line: "" };
		const x = (ms: number) => (ms / total) * W;
		const y = (tps: number) => H - (tps / peak) * (H - 4) - 2;
		const pts = series.map(
			(p) => `${x(p.ms).toFixed(1)} ${y(p.tps).toFixed(2)}`,
		);
		return {
			line: `M${pts.join(" L")}`,
			area: `M0 ${H} L${pts.join(" L")} L${W} ${H} Z`,
		};
	}, [series, peak, total]);

	return (
		<div className="absolute inset-0">
			{/* Quarter-point time gridlines, behind the curve. */}
			{GRID_FRACTIONS.map((f) => (
				<div
					key={f}
					className="absolute inset-y-0 w-px bg-border/50"
					style={{ left: `${f * 100}%` }}
				/>
			))}
			<svg
				viewBox={`0 0 ${W} ${H}`}
				preserveAspectRatio="none"
				className="absolute inset-0 h-full w-full text-primary"
				role="img"
				aria-label={`Throughput over time, peak ${Math.round(peak)} tokens per second`}
			>
				<defs>
					<linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="currentColor" stopOpacity={0.12} />
						<stop offset="100%" stopColor="currentColor" stopOpacity={0} />
					</linearGradient>
				</defs>
				{area && <path d={area} fill={`url(#${gradId})`} stroke="none" />}
				{line && (
					<path
						d={line}
						fill="none"
						stroke="currentColor"
						strokeOpacity={0.3}
						strokeWidth={1.2}
						strokeLinejoin="round"
						strokeLinecap="round"
						vectorEffect="non-scaling-stroke"
					/>
				)}
			</svg>
		</div>
	);
}

/**
 * A thin drag-to-seek time ruler that sits above the bars and spans the track
 * column. Quarter-point labels mark elapsed time across the window; the last one
 * right-aligns so it doesn't overflow the track. Pointer drag anywhere seeks
 * playback via `onSeek` (a 0–100 percentage).
 */
function ScrubRuler({
	total,
	onSeek,
	onSeekEnd,
}: {
	total: number;
	onSeek: (pct: number) => void;
	onSeekEnd: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const seekFromEvent = useCallback(
		(clientX: number) => {
			const el = ref.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const pct = ((clientX - rect.left) / rect.width) * 100;
			onSeek(Math.min(Math.max(pct, 0), 100));
		},
		[onSeek],
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-to-seek scrubber
		<div
			ref={ref}
			className="relative h-5 cursor-ew-resize touch-none select-none"
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				seekFromEvent(e.clientX);
			}}
			onPointerMove={(e) => {
				if (e.buttons === 1) seekFromEvent(e.clientX);
			}}
			onPointerUp={onSeekEnd}
			onPointerCancel={onSeekEnd}
		>
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
