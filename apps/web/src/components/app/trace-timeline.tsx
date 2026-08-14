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
import { useTtftVariant } from "@/components/app/dev-toolbar";
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
  formatSpanDuration,
  formatTokens,
} from "@/lib/format";
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

type SpanRow = {
  kind: "span";
  span: TraceSpan;
  depth: number;
  hasChildren: boolean;
  descendants: number;
};

/** A run of identical siblings, rendered as one `×N name` row. When expanded the
 * row stays as the header above its members, so the fold can be undone. */
type GroupRow = {
  kind: "group";
  key: string;
  depth: number;
  spans: TraceSpan[];
  expanded: boolean;
};

type Row = SpanRow | GroupRow;

/** Below this, folding costs more than it saves — three rows of the same thing
 * is where a loop starts reading as noise. */
const GROUP_MIN_RUN = 3;

/**
 * Fold adjacent runs of identical leaf siblings into one row.
 *
 * "Identical" means same parent, same depth, same name, same type. Two rules
 * keep the feature from hiding what you came for: a run containing an errored or
 * aborted span never folds, and spans with children never fold (a repeated
 * sub-agent keeps its subtree). Runs the reader has expanded pass through
 * unfolded.
 */
function groupRepeatedSiblings(
  rows: SpanRow[],
  expanded: ReadonlySet<string>
): Row[] {
  const out: Row[] = [];
  let i = 0;
  while (i < rows.length) {
    const head = rows[i];
    const foldable = (r: SpanRow) =>
      !r.hasChildren &&
      r.span.status !== "error" &&
      r.span.status !== "aborted";
    let end = i + 1;
    if (foldable(head)) {
      while (
        end < rows.length &&
        foldable(rows[end]) &&
        rows[end].depth === head.depth &&
        rows[end].span.parentSpanId === head.span.parentSpanId &&
        rows[end].span.name === head.span.name &&
        rows[end].span.spanType === head.span.spanType
      ) {
        end++;
      }
    }
    const run = end - i;
    const key = `${head.span.parentSpanId ?? "root"}|${head.span.name}|${head.span.spanId}`;
    if (run >= GROUP_MIN_RUN) {
      const isExpanded = expanded.has(key);
      out.push({
        kind: "group",
        key,
        depth: head.depth,
        spans: rows.slice(i, end).map((r) => r.span),
        expanded: isExpanded,
      });
      if (isExpanded) for (let j = i; j < end; j++) out.push(rows[j]);
    } else {
      for (let j = i; j < end; j++) out.push(rows[j]);
    }
    i = end;
  }
  return out;
}

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

  // Per-row collapse — view-local state; collapsing a row hides its subtree.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // Dev-only A/B of the pre-first-token bar rendering; fixed in production.
  const ttftVariant = useTtftVariant();
  // Runs of identical siblings fold by default; this holds the ones the reader
  // has since opened back up.
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(
    new Set()
  );
  const expandGroup = (key: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleCollapse = (spanId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });

  // The rows actually rendered: walk the depth-first order once, dropping
  // subtrees under a collapsed row (tracked as a stack of collapsed
  // depths). Descendant counts feed the "+N" collapse
  // indicator and double as hasChildren. A second pass folds runs of identical
  // siblings into one row, since a 12-call search loop is what makes a
  // waterfall unreadable.
  const visibleRows = useMemo(() => {
    const flat: SpanRow[] = [];
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
      let descendants = 0;
      for (let j = i + 1; j < ordered.length && ordered[j].depth > depth; j++) {
        descendants++;
      }
      flat.push({
        kind: "span",
        span,
        depth,
        hasChildren: descendants > 0,
        descendants,
      });
    }
    return groupRepeatedSiblings(flat, expandedGroups);
  }, [ordered, collapsed, expandedGroups]);

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
    [scores]
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
      {/* Time ruler, aligned to the bar track. */}
      <div className="grid grid-cols-[15rem_minmax(0,1fr)_6.5rem] items-center">
        <div />
        <TimeRuler total={total} />
        <div />
      </div>

      <div className="relative">
        {/* Quarter-point time gridlines, behind the bars. */}
        {/* left-60/right-26 mirror the grid template's 15rem/6.5rem columns. */}
        <div className="pointer-events-none absolute inset-y-0 left-60 right-26 z-0">
          {GRID_FRACTIONS.map((f) => (
            <div
              key={f}
              className="absolute inset-y-0 w-px"
              style={{
                left: `${f * 100}%`,
                borderLeft: "1px dashed var(--border)",
                opacity: 0.5,
              }}
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
                "grid w-full cursor-pointer grid-cols-[15rem_minmax(0,1fr)_6.5rem] items-center rounded-r-sm rounded-l-md py-0.5 text-left text-sm",
                selected === WHOLE_TRACE_ID
                  ? "bg-accent/70"
                  : "hover:bg-accent/50"
              )}
            >
              <div className="flex min-w-0 items-start gap-2 pr-3 pl-1.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md corner-squircle bg-primary/15 text-primary">
                  <IconAffiliate className="size-3" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium wrap-break-word">Trace</span>
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
              <div className="flex flex-col items-end pr-2 text-right">
                <span className="text-[11px] font-medium text-foreground/80 tabular-nums">
                  {formatDuration(total)}
                </span>
                {(traceTotals.cost != null || traceTotals.tokens > 0) && (
                  <span className="whitespace-nowrap text-[10px] text-muted-foreground tabular-nums">
                    {traceTotals.cost != null &&
                      formatCost(traceTotals.cost, 4)}
                    {traceTotals.cost != null &&
                      traceTotals.tokens > 0 &&
                      " · "}
                    {traceTotals.tokens > 0 && formatTokens(traceTotals.tokens)}
                  </span>
                )}
              </div>
            </button>

            {visibleRows.map((row) => {
              if (row.kind === "group") {
                return (
                  <GroupedRow
                    key={row.key}
                    row={row}
                    window={window}
                    total={total}
                    onToggle={() => expandGroup(row.key)}
                  />
                );
              }
              const { span, depth, hasChildren, descendants } = row;
              const isCollapsed = collapsed.has(span.spanId);
              const offsetMs = toMs(span.startTime) - window.start;
              const offset = (offsetMs / total) * 100;
              // Clamp to the remaining track so a span whose end rounds past
              // the window — or one that hits the min-width floor near the end —
              // can't spill the bar past the track's right edge.
              const width = Math.min(
                Math.max((span.durationMs / total) * 100, 1.5),
                Math.max(100 - offset, 0)
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
              // Waiting-for-first-token stretch: the bar up to TTFT renders
              // hatched, the solid fill starts where tokens start flowing.
              const ttftPct =
                span.spanType === "llm" &&
                span.ttftMs != null &&
                span.durationMs > 0
                  ? Math.min((span.ttftMs / span.durationMs) * 100, 100)
                  : null;
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
                      100 - thinkingLeftPct
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
                    "grid cursor-pointer grid-cols-[15rem_minmax(0,1fr)_6.5rem] items-center rounded-md py-1 text-left text-sm",
                    span.spanId === selected
                      ? "bg-accent/70"
                      : "hover:bg-accent/50"
                  )}
                >
                  <div
                    className="flex min-w-0 items-start gap-2 pr-3"
                    style={{ paddingLeft: (depth + 1) * 12 + 4 }}
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
                        "mt-0.75 flex size-3.5 shrink-0 items-center justify-center",
                        hasChildren
                          ? "cursor-pointer text-muted-foreground/50 hover:text-foreground"
                          : "pointer-events-none opacity-0"
                      )}
                    >
                      <IconChevronRight
                        className={cn(
                          "size-3 transition-transform",
                          hasChildren && !isCollapsed && "rotate-90"
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
                          !modelColor && "bg-muted"
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
                      {/* Single line — long tool names truncate (full name on
                          hover) instead of wrapping and stretching the row. */}
                      <span className="truncate" title={span.name}>
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
                            {/* Base track. Up to TTFT the bar renders as the
                                "waiting" treatment (dev-toolbar selectable) —
                                and the solid fill starts from there. */}
                            {ttftPct != null && ttftPct > 0 ? (
                              <>
                                <TtftWait
                                  variant={ttftVariant}
                                  widthPct={ttftPct}
                                  barClass={barClass}
                                  borderClass={
                                    isError
                                      ? "border-rose-500"
                                      : isAborted
                                        ? "border-amber-500"
                                        : "border-violet-500"
                                  }
                                />
                                <div
                                  className={cn(
                                    "absolute inset-y-0 right-0 rounded-r-xs",
                                    barClass
                                  )}
                                  style={{
                                    ...barStyle,
                                    width: `${100 - ttftPct}%`,
                                  }}
                                />
                              </>
                            ) : (
                              <div
                                className={cn(
                                  "h-full w-full rounded-xs",
                                  barClass
                                )}
                                style={barStyle}
                              />
                            )}
                            {/* Model-call phase — sky tint over the pure
	                              provider call; the tail is tool execution.
	                              Starts at TTFT so the hatched wait stays
	                              legible underneath. */}
                            {modelCallMs != null &&
                              modelCallWidthPct > (ttftPct ?? 0) && (
                                <div
                                  className="absolute inset-y-0 rounded-xs bg-sky-400/30"
                                  style={{
                                    left: `${ttftPct ?? 0}%`,
                                    width: `${modelCallWidthPct - (ttftPct ?? 0)}%`,
                                  }}
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
                          {formatSpanDuration(span.durationMs)} · starts +
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
                        {ttftPct != null && span.ttftMs != null && (
                          <span className="text-muted-foreground">
                            First token: {formatDuration(span.ttftMs)}
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
                  </div>
                  <div className="flex flex-col items-end pr-1 text-right">
                    <span className="text-[11px] font-medium text-foreground/80 tabular-nums">
                      {formatSpanDuration(span.durationMs)}
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

/**
 * One row standing in for a run of identical siblings: `×12 web_search`, their
 * summed duration and cost, and a bar spanning the whole run with a tick per
 * call — so a search loop reads as one loop, and you can still see the rhythm of
 * the calls inside it. Clicking unfolds the run in place.
 */
function GroupedRow({
  row,
  window,
  total,
  onToggle,
}: {
  row: GroupRow;
  window: { start: number; span: number };
  total: number;
  onToggle: () => void;
}) {
  const { spans, depth, expanded } = row;
  const starts = spans.map((s) => toMs(s.startTime) - window.start);
  const first = Math.min(...starts);
  const last = Math.max(...spans.map((s, i) => starts[i] + s.durationMs));
  const offset = (first / total) * 100;
  const width = Math.min(
    Math.max(((last - first) / total) * 100, 1.5),
    Math.max(100 - offset, 0)
  );
  const durationMs = spans.reduce((sum, s) => sum + s.durationMs, 0);
  const tokens = spans.reduce((sum, s) => sum + s.totalTokens, 0);
  const priced = spans.some((s) => s.totalCost != null);
  const cost = priced
    ? spans.reduce((sum, s) => sum + (s.totalCost ?? 0), 0)
    : null;
  const head = spans[0];
  return (
    <button
      type="button"
      onClick={onToggle}
      title={expanded ? "Fold repeated calls" : "Show each call"}
      className="grid cursor-pointer grid-cols-[15rem_minmax(0,1fr)_6.5rem] items-center rounded-md py-1 text-left text-sm hover:bg-accent/50"
    >
      <div
        className="flex min-w-0 items-start gap-2 pr-3"
        style={{ paddingLeft: (depth + 1) * 14 + 4 }}
      >
        <span className="mt-0.75 flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/50">
          <IconChevronRight
            className={cn(
              "size-3 transition-transform",
              expanded && "rotate-90"
            )}
          />
        </span>
        <SpanTypeChip type={head.spanType} />
        <span className="min-w-0 truncate">
          <span className="text-muted-foreground tabular-nums">
            ×{spans.length}
          </span>{" "}
          {head.name}
        </span>
      </div>
      <div className="relative h-5">
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-xs bg-muted-foreground/25"
          style={{ left: `${offset}%`, width: `${width}%` }}
        >
          {/* One tick per call, positioned within the run's span. */}
          {spans.map((s, i) => (
            <div
              key={s.spanId}
              className={cn("absolute inset-y-0 w-px", spanTypeBar(s.spanType))}
              style={{
                left: `${last > first ? ((starts[i] - first) / (last - first)) * 100 : 0}%`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col items-end pr-1 text-right">
        <span className="text-[11px] font-medium text-foreground/80 tabular-nums">
          {formatSpanDuration(durationMs)}
        </span>
        {(cost != null || tokens > 0) && (
          <span className="whitespace-nowrap text-[10px] text-muted-foreground tabular-nums">
            {cost != null && formatCost(cost)}
            {cost != null && tokens > 0 && " · "}
            {tokens > 0 && formatTokens(tokens)}
          </span>
        )}
      </div>
    </button>
  );
}

// Vertical gridline fractions across the track — quarter marks, doubling as the
// ruler's tick positions so the gridlines and time labels all align.
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;

// Diagonal-stripe mask for the "stripes" TTFT variant: the bar's own color
// shows in the stripes, the row background in the gaps.
const TTFT_HATCH_MASK =
  "repeating-linear-gradient(45deg, black 0 2.5px, transparent 2.5px 5px)";

/**
 * The pre-first-token stretch of an LLM bar, rendered per the dev-toolbar's
 * TTFT variant (production always gets the default). `barClass` is the solid
 * fill's bg-*, `borderClass` its matching border-* hue.
 */
function TtftWait({
  variant,
  widthPct,
  barClass,
  borderClass,
}: {
  variant: ReturnType<typeof useTtftVariant>;
  widthPct: number;
  barClass: string | undefined;
  borderClass: string;
}) {
  const width = { width: `${widthPct}%` };
  switch (variant) {
    case "stripes":
      return (
        <div
          className={cn("absolute inset-y-0 left-0 rounded-l-xs", barClass)}
          style={{
            ...width,
            maskImage: TTFT_HATCH_MASK,
            WebkitMaskImage: TTFT_HATCH_MASK,
          }}
        />
      );
    case "faded":
      return (
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-l-xs opacity-30",
            barClass
          )}
          style={width}
        />
      );
    case "thin":
      return (
        <div
          className={cn(
            "absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-l-xs",
            barClass
          )}
          style={width}
        />
      );
    case "gap":
      return (
        <div
          className="absolute inset-y-0 left-0 rounded-l-xs bg-muted-foreground/20"
          style={width}
        />
      );
    case "dots":
      return (
        <div
          className={cn(
            "absolute top-1/2 left-0 -translate-y-1/2 border-t-2 border-dotted",
            borderClass
          )}
          style={width}
        />
      );
    default:
      return (
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-l-xs border border-r-0 border-dashed",
            borderClass
          )}
          style={width}
        />
      );
  }
}

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
            "absolute top-0 text-[10px] text-muted-foreground/50 tabular-nums",
            frac === 1 && "-translate-x-full"
          )}
          style={{ left: `${frac * 100}%` }}
        >
          {formatDuration(total * frac)}
        </span>
      ))}
    </div>
  );
}
