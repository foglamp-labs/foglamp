"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { Tabs, TabsContent } from "@foglamp/ui/components/tabs";
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
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCircleCheckFilled,
  IconGaugeFilled,
  IconListTree,
  IconMessage2Filled,
  IconPlayerStopFilled,
  IconRoute,
  IconSitemapFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { useShikiHtml } from "@/components/app/code-block";
import { ContextChip } from "@/components/app/context-chip";
import { CopyButton } from "@/components/app/copy-button";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import {
  type EvalMeta,
  ScoreRow,
  type TraceScore,
} from "@/components/app/eval-scores";
import {
  useDelayedLoading,
  useEntranceOnce,
  useSkeletonShown,
} from "@/components/app/hooks";
import { navItem } from "@/components/app/nav";
import {
  EmptyState,
  NoProject,
  PageHeader,
  ScrollFade,
  TableSkeleton,
} from "@/components/app/page-parts";
import { PayloadView } from "@/components/app/payload-view";
import { useProject } from "@/components/app/project-context";
import {
  SpanIconChip,
  TraceTimeline,
  WHOLE_TRACE_ID,
} from "@/components/app/trace-timeline";
import {
  ModelLogo,
  formatModelName,
  modelBrandColor,
} from "@/components/model-logo";
import {
  formatCost,
  formatCount,
  formatDateTime,
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
  errorCount: number;
  scores: TraceScore[];
};

export function TraceDetailClient({ traceId }: { traceId: string }) {
  const entrance = useEntranceOnce();
  const { projectId } = useProject();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // The inspector is always open: no selection means the whole trace.
  const [selected, setSelected] = useState<string>(
    () => searchParams.get("span") ?? WHOLE_TRACE_ID
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
    [evals.data]
  );
  // Preset id → friendly check name ("No PII", "Valid JSON"). Static list.
  const presets = useQuery({
    ...trpc.evals.presets.queryOptions(),
    enabled: (scores.data ?? []).length > 0,
  });
  // Neighbouring traces in this trace's session — the previous/next turn
  // control. Kept out of `traces.get` so the page never blocks on it, and only
  // fetched at all once we know the trace belongs to a session.
  const sessionId = detail.data?.sessionId ?? null;
  const neighbors = useQuery({
    ...trpc.traces.sessionNeighbors.queryOptions({
      projectId: projectId!,
      traceId,
      sessionId: sessionId!,
    }),
    enabled: !!projectId && !!sessionId,
  });
  // Where this trace ranks against its agent's last week — the "p91 · this
  // agent" hints. Deliberately a separate query: it's the slowest thing on the
  // page (a scan over the project's traces) and the header must not wait for
  // it. The number moves slowly and nothing caches it server-side, so hold it
  // for a few minutes.
  const comparison = useQuery({
    ...trpc.traces.comparison.queryOptions({
      projectId: projectId!,
      traceId,
    }),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });
  const rank = comparison.data ?? null;
  const presetName = useMemo(
    () => new Map((presets.data ?? []).map((p) => [p.id, p.name] as const)),
    [presets.data]
  );
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(detail.isLoading);
  // Latch for the entrance fade: content below only fades in if its skeleton
  // never painted first (see useSkeletonShown).
  const skeletonShown = useSkeletonShown(showSkeleton);

  // Whether the waterfall column alone outgrows the viewport. Short traces
  // keep the sheet capped so the page never scrolls just because of the
  // inspector; tall traces scroll anyway, so the sheet may use more height.
  const [timelineEl, setTimelineEl] = useState<HTMLDivElement | null>(null);
  const [tallTrace, setTallTrace] = useState(false);
  useEffect(() => {
    if (!timelineEl) return;
    // `globalThis`, not `window` — a local `window` (the timeline's time
    // window) shadows the global below.
    const check = () =>
      setTallTrace(timelineEl.offsetHeight > globalThis.innerHeight - 14 * 16);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(timelineEl);
    globalThis.addEventListener("resize", check);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", check);
    };
  }, [timelineEl]);

  const spans = detail.data?.spans ?? [];
  const ordered = useMemo(() => orderSpans(spans), [spans]);
  const window = useMemo(() => computeWindow(spans), [spans]);
  const subtreeStats = useMemo(() => computeSubtreeStats(spans), [spans]);

  const active = spans.find((s) => s.spanId === selected) ?? null;
  const erroredSpans = spans.filter((s) => s.status === "error");
  // Aborted spans (AI SDK onAbort) — a clean cancellation, surfaced apart from
  // errors and never counted toward the error stat.
  const abortedSpans = spans.filter((s) => s.status === "aborted");
  // Worst rate-limit headroom reported by any span in the trace — surfaced as
  // a banner when it dips below the threshold, so a trace that ran close to
  // the provider's limit is visible without opening every span inspector.
  const lowHeadroom = useMemo(() => {
    let worst: {
      span: Span;
      pct: number;
      kind: "tokens" | "requests";
    } | null = null;
    for (const s of spans) {
      const rl = s.rateLimit;
      if (!rl) continue;
      const candidates = [
        {
          pct: pctRemaining(rl.tokensRemaining, rl.tokensLimit),
          kind: "tokens" as const,
        },
        {
          pct: pctRemaining(rl.requestsRemaining, rl.requestsLimit),
          kind: "requests" as const,
        },
      ];
      for (const c of candidates) {
        if (
          c.pct != null &&
          c.pct < LOW_HEADROOM_PCT &&
          (!worst || c.pct < worst.pct)
        ) {
          worst = { span: s, pct: c.pct, kind: c.kind };
        }
      }
    }
    return worst;
  }, [spans]);
  // The three trace-level problems, collapsed into one severity-ordered list so
  // they occupy a single strip instead of three stacked banners. The first entry
  // sets the strip's tone and is the one whose detail text shows inline.
  const issues = useMemo(() => {
    const list: Issue[] = [];
    if (erroredSpans.length > 0) {
      list.push({
        tone: "rose",
        icon: IconAlertTriangle,
        label: `${erroredSpans.length} ${erroredSpans.length === 1 ? "span" : "spans"} errored`,
        detail: erroredSpans[0].errorMessage,
        copyLabel: "Copy error",
        spanId: erroredSpans[0].spanId,
      });
    }
    if (abortedSpans.length > 0) {
      list.push({
        tone: "amber",
        icon: IconPlayerStopFilled,
        label:
          abortedSpans.length === 1
            ? "Run aborted"
            : `${abortedSpans.length} spans aborted`,
        detail: abortedSpans[0].errorMessage,
        spanId: abortedSpans[0].spanId,
      });
    }
    if (lowHeadroom) {
      list.push({
        tone: "orange",
        icon: IconGaugeFilled,
        label: "Rate limit nearly exhausted",
        detail: `${lowHeadroom.pct}% of ${lowHeadroom.kind} remaining after ${lowHeadroom.span.name}`,
        spanId: lowHeadroom.span.spanId,
      });
    }
    return list;
  }, [erroredSpans, abortedSpans, lowHeadroom]);
  // Eval scores for the selected span — shown in its inspector (the timeline
  // row only carries compact pass/fail indicators).
  const activeScores = useMemo(
    () =>
      active
        ? (scores.data ?? []).filter(
            (s) => s.targetType === "span" && s.targetId === active.spanId
          )
        : [],
    [scores.data, active]
  );

  // Trace rollups for the summary strip (derived from spans — no extra fetch).
  const stats = useMemo(() => {
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

  // Whole-trace eval scores (everything not targeting an individual span) — for
  // the trace-level inspector opened from the "Whole trace" root row.
  const traceScores = useMemo(
    () => (scores.data ?? []).filter((s) => s.targetType !== "span"),
    [scores.data]
  );
  // A stale ?span= id (aged out, wrong trace) also lands on the whole trace, so
  // the always-open inspector never renders empty.
  const isTraceSelected = selected === WHOLE_TRACE_ID || !active;
  // The trace's own facts, assembled only when its row is selected.
  const traceSummary = useMemo<TraceSummary | null>(() => {
    if (spans.length === 0) return null;
    const startTime = spans.reduce(
      (earliest, s) =>
        toMs(s.startTime) < toMs(earliest) ? s.startTime : earliest,
      spans[0].startTime
    );
    return {
      startTime,
      durationMs: window.span,
      cost: stats.cost,
      tokens: stats.tokens,
      spanCount: spans.length,
      errorCount: erroredSpans.length,
      scores: traceScores,
    };
  }, [spans, window.span, stats, erroredSpans.length, traceScores]);

  // Select a span and reflect it in the URL (?span=) so the selection is
  // shareable; other params are preserved. Deselecting (null) falls back to the
  // whole trace — the inspector never closes.
  const select = useCallback(
    (spanId: string | null) => {
      const id = spanId ?? WHOLE_TRACE_ID;
      setSelected(id);
      const params = new URLSearchParams(searchParams.toString());
      if (id !== WHOLE_TRACE_ID) params.set("span", id);
      else params.delete("span");
      const qs = params.toString();
      router.replace(
        // biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
        (qs ? `${pathname}?${qs}` : pathname) as any,
        { scroll: false }
      );
    },
    [pathname, router, searchParams]
  );

  // Position of the selected span in the flattened waterfall order — drives both
  // the keyboard shortcuts and the inspector's prev/next buttons.
  const selectedIndex = ordered.findIndex((o) => o.span.spanId === selected);
  const stepSelection = useCallback(
    (delta: number) => {
      if (ordered.length === 0) return;
      const i = ordered.findIndex((o) => o.span.spanId === selected);
      // The whole-trace row sits above the spans: ↓ from it enters the list,
      // ↑ from the first span returns to it.
      if (i < 0) {
        if (delta > 0) select(ordered[0].span.spanId);
        return;
      }
      const ni = i + delta;
      if (ni < 0) {
        select(WHOLE_TRACE_ID);
        return;
      }
      select(ordered[Math.min(ni, ordered.length - 1)].span.spanId);
    },
    [ordered, selected, select]
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
      stepSelection(next ? 1 : -1);
    };
    // `window` is shadowed by the timeline memo above — use globalThis.
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [ordered.length, stepSelection]);

  const back = navItem("/traces");
  const ctx = detail.data;

  // Header title: an explicit trace name when one was set, else the raw id.
  // (The user-message snippet stays a list-page affordance — as a title here
  // it read like a system prompt.) With a name, the id demotes to muted mono
  // next to the copy button.
  const traceTitle = ctx?.traceName ?? traceId;

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
      {/* Wrapped here (not inside a shared header component — this route's
			    header renders the traceId itself, so loading.tsx's placeholder
			    RouteHeader is a separate render) so only the page's own header fades. */}
      <div className={cn(entrance && "page-fade-in")}>
        <PageHeader
          title={traceTitle}
          back={back}
          titleTrailing={
            <span className="flex min-w-0 items-center gap-0.5">
              {traceTitle !== traceId && (
                <span className="hidden max-w-44 truncate font-mono text-xs font-normal text-muted-foreground sm:inline">
                  {traceId}
                </span>
              )}
              <CopyButton value={traceId} title="Copy trace ID" />
            </span>
          }
        />
      </div>

      {/* Context chips: link back to the owning session / workflow / agent,
			    plus the end-customer this trace served (links to their traces). */}
      {(ctx?.sessionId ||
        ctx?.workflowName ||
        ctx?.agentName ||
        ctx?.customer) && (
        <div
          className={cn(
            "mt-1 flex flex-wrap items-center gap-2 text-xs px-7",
            entrance && !skeletonShown && "page-fade-in"
          )}
        >
          {ctx.customer && (
            <ContextChip
              href={`/traces?customer=${encodeURIComponent(ctx.customer.id)}`}
              icon={(p) => (
                <CustomerAvatar
                  customerId={ctx.customer!.id}
                  customerName={ctx.customer!.name}
                  imageUrl={ctx.customer!.imageUrl}
                  filled
                  className={p.className}
                />
              )}
              iconClassName=""
              label={ctx.customer.name ?? ctx.customer.id}
            />
          )}
          {ctx.sessionId && (
            <SessionChip
              sessionId={ctx.sessionId}
              prev={neighbors.data?.prev ?? null}
              next={neighbors.data?.next ?? null}
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
          {ctx.workflowName && ctx.workflowRunId && (
            // Deep-links to this run inside the workflow detail (?run=), so the
            // trace's sibling traces in the same run are one hop away.
            <ContextChip
              href={`/workflows/${encodeURIComponent(ctx.workflowName)}?run=${encodeURIComponent(ctx.workflowRunId)}`}
              icon={IconRoute}
              iconClassName="text-emerald-500"
              label={ctx.workflowRunId}
            />
          )}
          {ctx.agentName && (
            <ContextChip
              href={`/agents/${encodeURIComponent(ctx.agentName)}`}
              icon={(p) => (
                <AgentIcon
                  name={ctx.agentName}
                  filled
                  className={p.className}
                />
              )}
              iconClassName=""
              label={ctx.agentName}
            />
          )}
        </div>
      )}

      {detail.isLoading ? (
        showSkeleton ? (
          <div className={cn(entrance && "page-fade-in", "px-8")}>
            <TableSkeleton />
          </div>
        ) : null
      ) : ordered.length === 0 ? (
        <div className="px-8">
          <EmptyState
            icon={IconListTree}
            title="Trace not found"
            description="It may have aged out of retention or never arrived."
            className={cn(entrance && !skeletonShown && "page-fade-in")}
          />
        </div>
      ) : (
        <>
          {/* No stat-card strip — the always-open whole-trace inspector shows
              the same Duration/Cost/Tokens (with the p-rank hints) right next
              to the waterfall, and errors live in the issues strip. */}
          {issues.length > 0 && (
            <IssuesStrip
              issues={issues}
              onSelect={select}
              className={cn(
                "px-8",
                entrance && !skeletonShown && "page-fade-in"
              )}
            />
          )}

          <div
            className={cn(
              "flex items-start gap-6 px-8 mt-2",
              entrance && !skeletonShown && "page-fade-in"
            )}
          >
            <div ref={setTimelineEl} className="min-w-0 flex-1">
              <TraceTimeline
                spans={spans}
                selected={selected}
                onSelect={select}
                scores={scores.data ?? []}
                evalMeta={evalMeta}
                presetName={presetName}
              />
            </div>
            <DetailPanel
              span={isTraceSelected ? null : active}
              scores={activeScores}
              trace={isTraceSelected ? traceSummary : null}
              spans={spans}
              evalMeta={evalMeta}
              presetName={presetName}
              spanIndex={selectedIndex}
              spanCount={ordered.length}
              onStep={stepSelection}
              subtreeStats={subtreeStats}
              rank={rank}
              tall={tallTrace}
            />
          </div>
        </>
      )}
    </>
  );
}

/**
 * One horizontal strip splitting the trace's wall-clock into model time (pure
 * model-call when the SDK reported it, else the whole LLM span), tool
 * execution, other spans, and idle — the trace-level rollup of the waterfall's
 * per-span phase split, in the same palette. Interval unions keep parallel
 * spans from counting double; where categories overlap each other, their
 * widths are scaled to fit the covered window so the strip always sums to the
 * trace duration (the legend shows the exact per-category unions).
 */
function TimeComposition({
  spans,
  totalMs,
  className,
}: {
  spans: Span[];
  totalMs: number;
  className?: string;
}) {
  const segs = useMemo(() => {
    type Interval = [number, number];
    const buckets: Record<"llm" | "tool" | "other", Interval[]> = {
      llm: [],
      tool: [],
      other: [],
    };
    for (const s of spans) {
      // Agent spans are containers — their window spans everything beneath.
      if (s.spanType === "agent") continue;
      const start = toMs(s.startTime);
      const end =
        s.spanType === "llm" && s.modelCallMs != null && s.modelCallMs > 0
          ? start + Math.min(s.modelCallMs, s.durationMs)
          : start + s.durationMs;
      if (end <= start) continue;
      const key =
        s.spanType === "llm" ? "llm" : s.spanType === "tool" ? "tool" : "other";
      buckets[key].push([start, end]);
    }
    const unionMs = (intervals: Interval[]) => {
      if (intervals.length === 0) return 0;
      const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
      let total = 0;
      let [cs, ce] = sorted[0];
      for (const [s, e] of sorted.slice(1)) {
        if (s > ce) {
          total += ce - cs;
          cs = s;
          ce = e;
        } else {
          ce = Math.max(ce, e);
        }
      }
      return total + (ce - cs);
    };
    const llm = unionMs(buckets.llm);
    const tool = unionMs(buckets.tool);
    const other = unionMs(buckets.other);
    const covered = unionMs([
      ...buckets.llm,
      ...buckets.tool,
      ...buckets.other,
    ]);
    const idle = Math.max(0, totalMs - covered);
    const sum = llm + tool + other;
    const fit = sum > covered && sum > 0 ? covered / sum : 1;
    return {
      parts: [
        { key: "Model", exact: llm, width: llm * fit, bar: "bg-violet-500" },
        { key: "Tools", exact: tool, width: tool * fit, bar: "bg-blue-500" },
        { key: "Other", exact: other, width: other * fit, bar: "bg-slate-400" },
        {
          key: "Idle",
          exact: idle,
          width: idle,
          bar: "bg-muted-foreground/15",
        },
      ].filter((p) => p.exact > 0),
    };
  }, [spans, totalMs]);

  if (totalMs <= 0 || segs.parts.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex h-2 w-full gap-px">
        {segs.parts.map((p) => (
          <div
            key={p.key}
            title={`${p.key}: ${formatDuration(p.exact)}`}
            className={cn("h-full rounded-xs", p.bar)}
            style={{ width: `${(p.width / totalMs) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[11px] text-muted-foreground tabular-nums">
        {segs.parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-xs", p.bar)} />
            {p.key} {formatDuration(p.exact)}
          </span>
        ))}
      </div>
    </div>
  );
}

// Fallback segment colors for CostComposition, used when a model has no brand
// color (or two models share one) — the timeline palette, as hex so segments
// and brand colors mix in the same inline style.
const COST_FALLBACK_COLORS = [
  "#8b5cf6", // violet-500
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#64748b", // slate-500
];

/**
 * The money sibling of {@link TimeComposition}: one strip splitting the trace's
 * spend by model, priciest first. Plain proportions — unlike time, cost has no
 * overlap problem — so the strip always sums to the trace total. Brand colors
 * echo the model chips; renders nothing unless the cost actually splits across
 * two or more buckets (a single full-width segment says nothing).
 */
function CostComposition({
  spans,
  className,
}: {
  spans: Span[];
  className?: string;
}) {
  const parts = useMemo(() => {
    const byKey = new Map<
      string,
      { label: string; cost: number; brand: string | null }
    >();
    for (const s of spans) {
      if (s.totalCost == null || s.totalCost <= 0) continue;
      const key = s.modelId ?? `type:${s.spanType}`;
      const cur = byKey.get(key);
      if (cur) {
        cur.cost += s.totalCost;
      } else {
        byKey.set(key, {
          label: s.modelId ? formatModelName(s.modelId) : s.spanType,
          cost: s.totalCost,
          brand: s.modelId ? modelBrandColor(s.provider, s.modelId) : null,
        });
      }
    }
    const sorted = [...byKey.values()].sort((a, b) => b.cost - a.cost);
    // Two models of one provider share a brand color, which would merge their
    // adjacent segments — later duplicates take fallback shades instead.
    const used = new Set<string>();
    let fi = 0;
    return sorted.map((p) => {
      let color = p.brand;
      if (!color || used.has(color)) {
        color = COST_FALLBACK_COLORS[fi % COST_FALLBACK_COLORS.length];
        fi += 1;
      }
      used.add(color);
      return { label: p.label, cost: p.cost, color };
    });
  }, [spans]);
  const total = parts.reduce((acc, p) => acc + p.cost, 0);
  if (parts.length < 2 || total <= 0) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-xs text-muted-foreground">Cost distribution</span>
      <div className="flex flex-col gap-1.5">
        <div className="flex h-2 w-full gap-px">
          {parts.map((p) => (
            <div
              key={p.label}
              title={`${p.label}: ${formatCost(p.cost)}`}
              className="h-full rounded-xs"
              style={{
                width: `${(p.cost / total) * 100}%`,
                backgroundColor: p.color,
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[11px] text-muted-foreground tabular-nums">
          {parts.map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-xs"
                style={{ backgroundColor: p.color }}
              />
              {p.label} {formatCost(p.cost)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Where this trace ranks against its agent's last week — nulls when the query
 * declines to answer (no agent, too few traces, unpriced). */
type TraceRank = {
  durationPercentile: number | null;
  costPercentile: number | null;
  tokenPercentile: number | null;
};

/** A Field value with a "p91 · this agent" hint beside it — where this trace's
 * value falls among the same agent's traces over the last week. The hint is
 * purely additive: while the query is in flight, fails, or declines to answer
 * (no agent, too few traces, unpriced), the bare value renders alone. */
function rankedValue(value: React.ReactNode, percentile?: number | null) {
  if (percentile == null) return value;
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      {value}
      <span
        className="text-[11px] text-muted-foreground"
        title={`Higher than ${percentile}% of this agent's traces this week`}
      >
        p{percentile} · this agent
      </span>
    </span>
  );
}

/** The session context chip with the turn nav built in — "session | ‹ ›".
 * Session traces are conversation turns (the sessions page frames them that
 * way, so this does too), and the arrows render dimmed (not hidden) at the
 * ends of the session, so the control doesn't appear and disappear as you
 * walk a conversation. Hand-rolls the ContextChip surface: a chip that also
 * contains nav links can't be a single Button-as-Link. */
function SessionChip({
  sessionId,
  prev,
  next,
}: {
  sessionId: string;
  prev: { traceId: string } | null;
  next: { traceId: string } | null;
}) {
  const link = (t: { traceId: string } | null) =>
    t ? `/traces/${encodeURIComponent(t.traceId)}` : null;
  return (
    <span className="flex h-8 max-w-sm items-center rounded-full bg-background text-sm shadow-(--custom-outline-shadow) dark:bg-card">
      <Link
        // biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
        href={`/sessions/${encodeURIComponent(sessionId)}` as any}
        className="flex h-full min-w-0 items-center gap-[5.5px] rounded-full pl-2.5 pr-2 outline-none transition-colors hover:bg-muted focus-visible:ring-[1.5px] focus-visible:ring-ring/50"
      >
        <IconMessage2Filled className="size-3.5 shrink-0 text-sky-500" />
        <span className="truncate">{sessionId}</span>
        <IconArrowUpRight className="-ml-0.5 mt-px size-3.5 shrink-0 text-muted-foreground" />
      </Link>
      <span className="h-4 w-px shrink-0 bg-border mx-1" />
      <TurnNavSegment
        href={link(prev)}
        label="Previous turn"
        icon={IconChevronLeft}
        className="rounded-full p-2"
      />
      <TurnNavSegment
        href={link(next)}
        label="Next turn"
        icon={IconChevronRight}
        className="rounded-full p-2"
      />
    </span>
  );
}

function TurnNavSegment({
  href,
  label,
  icon: Icon,
  className,
}: {
  href: string | null;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}) {
  const cls = cn(
    "flex h-full items-center text-muted-foreground outline-none transition-colors focus-visible:ring-[1.5px] focus-visible:ring-ring/50",
    href ? "hover:bg-muted hover:text-foreground" : "opacity-50",
    className
  );
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        {href ? (
          <TooltipTrigger
            render={
              // biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
              <Link href={href as any} aria-label={label} className={cls}>
                <Icon className="size-3.5" />
              </Link>
            }
          />
        ) : (
          // The end of the session: inert, but still explains itself on hover.
          <TooltipTrigger
            render={
              <span aria-disabled className={cls}>
                <Icon className="size-3.5" />
              </span>
            }
          />
        )}
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type Issue = {
  tone: "rose" | "amber" | "orange";
  icon: React.ComponentType<{ className?: string }>;
  /** Chip text — short enough to sit alongside the other issues. */
  label: string;
  /** Longer context, shown inline only for the leading (most severe) issue. */
  detail: string | null;
  /** When set, the detail gets a copy control. */
  copyLabel?: string;
  /** The span the chip selects. */
  spanId: string;
};

// Tailwind can't build class names at runtime, so each tone spells its classes
// out in full.
const ISSUE_TONES: Record<
  Issue["tone"],
  { strip: string; chip: string; detail: string; copy: string }
> = {
  rose: {
    strip:
      "bg-rose-500/10 shadow-(--custom-shadow-rose) dark:bg-rose-500/15 text-rose-600 dark:text-rose-400",
    chip: "text-rose-600 hover:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/25",
    detail: "text-rose-600/80 dark:text-rose-400/80",
    copy: "text-rose-600/70 hover:text-rose-600 dark:text-rose-400/70 dark:hover:text-rose-400",
  },
  amber: {
    strip:
      "bg-amber-500/10 shadow-(--custom-shadow-amber) dark:bg-amber-500/15 text-amber-700 dark:text-amber-400",
    chip: "text-amber-700 hover:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/25",
    detail: "text-amber-700/80 dark:text-amber-400/80",
    copy: "text-amber-700/70 hover:text-amber-700 dark:text-amber-400/70 dark:hover:text-amber-400",
  },
  orange: {
    strip:
      "bg-orange-500/10 shadow-(--custom-shadow-orange) dark:bg-orange-500/15 text-orange-700 dark:text-orange-400",
    chip: "text-orange-700 hover:bg-orange-500/20 dark:text-orange-400 dark:hover:bg-orange-500/25",
    detail: "text-orange-700/80 dark:text-orange-400/80",
    copy: "text-orange-700/70 hover:text-orange-700 dark:text-orange-400/70 dark:hover:text-orange-400",
  },
};

/** Every trace-level problem in one severity-ordered strip: one chip each, and
 * the leading issue's detail text inline underneath — so the common
 * single-error trace reads the same as the dedicated banner it replaces. */
function IssuesStrip({
  issues,
  onSelect,
  className,
}: {
  issues: Issue[];
  onSelect: (spanId: string) => void;
  className?: string;
}) {
  const lead = issues[0];
  if (!lead) return null;
  const tone = ISSUE_TONES[lead.tone];
  return (
    <div className={className}>
      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-lg px-2 py-2 text-sm",
          tone.strip
        )}
      >
        <div className="flex flex-wrap items-center gap-1">
          {issues.map((issue) => {
            const t = ISSUE_TONES[issue.tone];
            return (
              <button
                key={issue.tone}
                type="button"
                onClick={() => onSelect(issue.spanId)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left font-medium transition-colors",
                  t.chip
                )}
              >
                <issue.icon className="size-4 shrink-0" />
                <span>{issue.label}</span>
              </button>
            );
          })}
        </div>
        {lead.detail && (
          // The copy control is a sibling of the detail text, not nested inside
          // a chip button — nested buttons are invalid markup.
          <div className="flex items-start justify-between gap-2 px-2 pb-0.5">
            <span className={cn("min-w-0 truncate", tone.detail)}>
              {lead.detail}
            </span>
            {lead.copyLabel && (
              <CopyButton
                value={lead.detail}
                title={lead.copyLabel}
                className={cn("-mt-0.5 shrink-0", tone.copy)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Rolled-up totals for everything beneath a span — what an `agent` span is
 * actually worth knowing, since its own counters are empty. */
type SubtreeStats = { spans: number; cost: number | null; tokens: number };

/**
 * Subtree totals for every span, keyed by span id. Cost stays `null` when no
 * descendant carried one, so an unpriced subtree renders no cost field rather
 * than a misleading $0.
 */
function computeSubtreeStats(spans: Span[]): Map<string, SubtreeStats> {
  const children = new Map<string, Span[]>();
  for (const s of spans) {
    if (!s.parentSpanId) continue;
    const bucket = children.get(s.parentSpanId);
    if (bucket) bucket.push(s);
    else children.set(s.parentSpanId, [s]);
  }
  const memo = new Map<string, SubtreeStats>();
  const walk = (span: Span): SubtreeStats => {
    const hit = memo.get(span.spanId);
    if (hit) return hit;
    const out: SubtreeStats = { spans: 0, cost: null, tokens: 0 };
    // Seed before recursing so a malformed parent cycle bottoms out at zero
    // instead of hanging the render.
    memo.set(span.spanId, out);
    for (const child of children.get(span.spanId) ?? []) {
      const sub = walk(child);
      out.spans += 1 + sub.spans;
      out.tokens += child.inputTokens + child.outputTokens + sub.tokens;
      if (child.totalCost != null || sub.cost != null) {
        out.cost = (out.cost ?? 0) + (child.totalCost ?? 0) + (sub.cost ?? 0);
      }
    }
    return out;
  };
  for (const s of spans) walk(s);
  return memo;
}

/**
 * The fields worth showing for a span, by type. Absent values are omitted
 * outright rather than rendered as a dash — an empty slot says "not applicable
 * here", which a dash cannot. The two places a dash survives are deliberate:
 * the header stat strip (the grid needs a card-shaped thing) and cost on an
 * `llm` span, where a null means "we failed to price this", not "no cost".
 */
function spanFields(
  span: Span,
  subtree: SubtreeStats | undefined
): { label: string; value: React.ReactNode }[] {
  const fields: { label: string; value: React.ReactNode }[] = [];
  const add = (label: string, value: React.ReactNode) => {
    if (value != null) fields.push({ label, value });
  };
  const status =
    span.status === "ok" ? (
      <span className="flex items-center gap-1">
        <IconCircleCheckFilled className="size-3.5 shrink-0 text-emerald-500" />
        Ok
      </span>
    ) : (
      <span className="flex items-center gap-1">
        <IconAlertTriangleFilled
          className={cn(
            "size-3.5 shrink-0",
            span.status === "aborted" ? "text-amber-500" : "text-rose-500"
          )}
        />
        {span.status.charAt(0).toUpperCase() + span.status.slice(1)}
      </span>
    );
  const model = span.modelId ? (
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
  ) : null;

  add("Started", formatDateTime(span.startTime));
  add("Duration", formatSpanDuration(span.durationMs));

  switch (span.spanType) {
    case "llm": {
      add("Model", model);
      // No Provider field — the model logo/name already carries it.
      add("Cost", formatCost(span.totalCost));
      add(
        "Tokens",
        <span className="flex flex-col gap-1.5">
          <span>
            {formatTokens(span.inputTokens)} in ·{" "}
            {formatTokens(span.outputTokens)} out
          </span>
          <TokenSplitBar
            input={span.inputTokens}
            cached={span.cachedInputTokens ?? 0}
            output={span.outputTokens}
          />
        </span>
      );
      if (span.ttftMs !== null) {
        add(
          "TTFT",
          <span className="flex flex-col gap-1.5">
            {span.reasoningDurationMs != null &&
            span.reasoningDurationMs > 0 ? (
              // Reasoning models: show how much of the wait was thinking.
              <span>
                {formatDuration(span.ttftMs)}{" "}
                <span className="text-muted-foreground">
                  ({formatDuration(span.reasoningDurationMs)} thinking)
                </span>
              </span>
            ) : (
              <span>{formatDuration(span.ttftMs)}</span>
            )}
            <TtftSplitBar ttftMs={span.ttftMs} durationMs={span.durationMs} />
          </span>
        );
      }
      // No "Model call" field — the llm span now closes at the model-call end,
      // so modelCallMs ≈ durationMs and tool time lives in tool child spans.
      break;
    }
    case "embedding": {
      add("Model", model);
      add("Provider", span.provider);
      if (span.inputTokens > 0)
        add("Input tokens", formatTokens(span.inputTokens));
      if (span.totalCost != null) add("Cost", formatCost(span.totalCost));
      break;
    }
    case "agent": {
      if (subtree && subtree.spans > 0) {
        if (subtree.tokens > 0) add("Tokens", formatTokens(subtree.tokens));
        if (subtree.cost != null) add("Cost", formatCost(subtree.cost));
      }
      if (span.status !== "ok") add("Status", status);
      break;
    }
    // `tool` and `other` carry none of the model fields — guessing at them is
    // how you end up with a grid of dashes. No Status field either: the sheet
    // header shows the status icon next to the name (see SpanStatusIcon).
    default: {
      if (span.totalCost != null && span.totalCost !== 0)
        add("Cost", formatCost(span.totalCost));
      break;
    }
  }
  return fields;
}

/** The span's status as a bare icon — green check (ok), rose triangle (error),
 * amber triangle (aborted) — for the sheet header, where a labeled field would
 * be noise. The capitalized status is the tooltip. */
function SpanStatusIcon({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span title={label} className="flex shrink-0 items-center">
      {status === "ok" ? (
        <IconCircleCheckFilled className="size-3.5 text-emerald-500" />
      ) : (
        <IconAlertTriangleFilled
          className={cn(
            "size-3.5",
            status === "aborted" ? "text-amber-500" : "text-rose-500"
          )}
        />
      )}
    </span>
  );
}

/** Thin bar under the TTFT number splitting the llm span's wall into the
 * pre-first-token wait (faded, matching the waterfall's TTFT treatment) and
 * generation. */
function TtftSplitBar({
  ttftMs,
  durationMs,
}: {
  ttftMs: number;
  durationMs: number;
}) {
  if (durationMs <= 0 || ttftMs <= 0) return null;
  const wait = Math.min(ttftMs, durationMs);
  return (
    <span className="flex h-1 w-full overflow-hidden rounded-full">
      <span
        title={`Waiting for first token: ${formatDuration(wait)}`}
        className="h-full bg-violet-500/30"
        style={{ width: `${(wait / durationMs) * 100}%` }}
      />
      <span
        title={`Generating: ${formatDuration(Math.max(0, durationMs - wait))}`}
        className="h-full flex-1 bg-violet-500"
      />
    </span>
  );
}

/** Thin proportion bar under the token headline: cached input (faded — it
 * rhymes with "barely cost anything"), fresh input, and output. */
function TokenSplitBar({
  input,
  cached,
  output,
}: {
  input: number;
  cached: number;
  output: number;
}) {
  const total = input + output;
  if (total <= 0) return null;
  const cachedPart = Math.min(Math.max(cached, 0), input);
  const fresh = input - cachedPart;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <span className="flex h-1 w-full gap-px overflow-hidden rounded-full">
      {cachedPart > 0 && (
        <span
          title={`Cached input: ${formatTokens(cachedPart)}`}
          className="h-full bg-sky-500/35"
          style={{ width: pct(cachedPart) }}
        />
      )}
      {fresh > 0 && (
        <span
          title={`Input: ${formatTokens(fresh)}`}
          className="h-full bg-sky-500"
          style={{ width: pct(fresh) }}
        />
      )}
      {output > 0 && (
        <span
          title={`Output: ${formatTokens(output)}`}
          className="h-full bg-emerald-500"
          style={{ width: pct(output) }}
        />
      )}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.75">
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
      const o =
        s && typeof s === "object" ? (s as Record<string, unknown>) : {};
      return {
        title: typeof o.title === "string" ? o.title : undefined,
        url: typeof o.url === "string" ? o.url : undefined,
      };
    });
  } catch {
    return [];
  }
}

// Below this % of remaining rate-limit quota, the trace gets a warning banner.
const LOW_HEADROOM_PCT = 10;

// Percent of a rate-limit quota still available, or null when not computable.
function pctRemaining(
  remaining: number | null | undefined,
  limit: number | null | undefined
): number | null {
  if (remaining == null || limit == null || limit <= 0) return null;
  return Math.round((remaining / limit) * 100);
}

// Default width of the span inspector. The timeline (a flex sibling, flex-1)
// gives up exactly this much room, so the panel reads as carved out of the same
// canvas — same technique as the Foggy chat.
const PANEL_WIDTH = 420;

// Resize limits: thin enough to give the waterfall room, wide enough that the
// two-column field grid and payloads stay readable.
const PANEL_MIN_WIDTH = 340;
const PANEL_MAX_WIDTH = 720;

// The chosen width survives navigation — resizing is a workspace preference,
// not a per-trace one.
const PANEL_WIDTH_KEY = "foglamp:trace-panel-width";

const clampPanelWidth = (w: number) =>
  Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, w));

/**
 * The right-hand inspector — always open, showing either a single span or the
 * whole trace (the default). Switching targets swaps the content in place. The
 * left edge is a drag handle: the panel resizes between fixed limits and the
 * timeline (flex-1 beside it) absorbs the difference.
 */
function DetailPanel({
  span,
  scores,
  trace,
  spans,
  evalMeta,
  presetName,
  spanIndex,
  spanCount,
  onStep,
  subtreeStats,
  rank,
  tall,
}: {
  span: Span | null;
  scores: TraceScore[];
  trace: TraceSummary | null;
  /** All spans of the trace — the whole-trace view derives its time
   * distribution and root payloads from them. */
  spans: Span[];
  evalMeta: Map<string, EvalMeta>;
  presetName: Map<string, string>;
  /** Position of the selected span in waterfall order; -1 when none. */
  spanIndex: number;
  spanCount: number;
  onStep: (delta: number) => void;
  subtreeStats: Map<string, SubtreeStats>;
  rank: TraceRank | null;
  /** True when the waterfall outgrows the viewport — the page scrolls anyway,
   * so the sheet may take more height (-6rem instead of -14rem). */
  tall: boolean;
}) {
  // Input of the LLM call that started closest before the selected one — the
  // baseline the Input transcript diffs against. Any llm span in the trace
  // counts (agent loops interleave tool spans between calls).
  const previousInput = useMemo(() => {
    if (!span || span.spanType !== "llm" || !span.input) return null;
    const start = toMs(span.startTime);
    let best: Span | null = null;
    for (const s of spans) {
      if (s.spanType !== "llm" || s.spanId === span.spanId || !s.input)
        continue;
      if (
        toMs(s.startTime) < start &&
        (!best || toMs(s.startTime) > toMs(best.startTime))
      )
        best = s;
    }
    return best?.input ?? null;
  }, [span, spans]);
  const [width, setWidth] = useState(PANEL_WIDTH);
  // Mirror for the pointer-up persist, so the handler doesn't need to re-bind
  // on every pixel of drag.
  const widthRef = useRef(width);
  widthRef.current = width;
  // Stored width is applied after mount (not in the initializer) so server and
  // client render the same initial markup.
  useEffect(() => {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    if (Number.isFinite(stored) && stored > 0)
      setWidth(clampPanelWidth(stored));
  }, []);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  // Live while a drag is in flight — keeps the edge light on after the pointer
  // leaves the thin handle (same trick as the Foggy panel).
  const [resizing, setResizing] = useState(false);
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    setResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    localStorage.setItem(PANEL_WIDTH_KEY, String(widthRef.current));
  };

  return (
    <aside
      className="group/panel sticky top-4 shrink-0 self-start"
      style={{ width }}
    >
      {/* Resize handle on the panel's left edge. Pointer capture keeps the
			    drag alive when the cursor outruns the 12px hit area. */}
      {/* biome-ignore lint/a11y/useFocusableInteractive: pointer-only affordance; the width is cosmetic */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        data-trace-resize=""
        data-resizing={resizing || undefined}
        onPointerDown={(e) => {
          e.preventDefault();
          drag.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startWidth: widthRef.current,
          };
          setResizing(true);
          // The pointer leaves the thin handle immediately while dragging, so
          // pin the resize cursor (and disable text selection) globally until
          // release.
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.pointerId !== e.pointerId) return;
          // The panel sits on the right, so dragging left widens it.
          setWidth(clampPanelWidth(d.startWidth + (d.startX - e.clientX)));
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="absolute inset-y-0 -left-3 z-10 w-3 cursor-col-resize touch-none"
      />
      {/* Lights up the sheet's left edge while the handle is hovered or
			    dragged — the same affordance as the Foggy panel, whose shell edge
			    lights via these data attributes and :has(). Follows the Card's
			    rounding so the lit border hugs its corners. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-lg squircle:rounded-3xl corner-squircle border-l border-border opacity-0 transition-opacity duration-200 group-has-[[data-trace-resize]:hover]/panel:opacity-100 group-has-[[data-trace-resize][data-resizing]]/panel:opacity-100"
      />
      {trace ? (
        <TraceDetail
          trace={trace}
          spans={spans}
          evalMeta={evalMeta}
          presetName={presetName}
          onStep={onStep}
          rank={rank}
          tall={tall}
        />
      ) : span ? (
        <SpanDetail
          span={span}
          scores={scores}
          evalMeta={evalMeta}
          presetName={presetName}
          spanIndex={spanIndex}
          spanCount={spanCount}
          onStep={onStep}
          subtree={subtreeStats.get(span.spanId)}
          previousInput={previousInput}
          tall={tall}
        />
      ) : null}
    </aside>
  );
}

/**
 * The whole-trace inspector — the default (and un-closable) target of the
 * always-open panel, built to be where debugging starts: the trace's rollup,
 * its time distribution, and the root span's tools/input/output so the
 * conversation is readable without hunting down the waterfall. Mirrors
 * {@link SpanDetail}'s Card chrome so the two read as one inspector that
 * simply swaps contents.
 */
function TraceDetail({
  trace,
  spans,
  evalMeta,
  presetName,
  onStep,
  rank,
  tall,
}: {
  trace: TraceSummary;
  spans: Span[];
  evalMeta: Map<string, EvalMeta>;
  presetName: Map<string, string>;
  onStep: (delta: number) => void;
  rank: TraceRank | null;
  tall: boolean;
}) {
  // Same Overview/Raw split as SpanDetail — the whole-trace view is curated,
  // Raw is the verbatim summary + root payloads.
  const [tab, setTab] = useState("overview");
  // The trace's root span carries the conversation-level payloads: the messages
  // in, the final output, and the tool catalog the model was offered. Prefer
  // the earliest top-level `agent` span (the SDK's container), else the
  // earliest top-level span of any type.
  const root = useMemo(() => {
    const ids = new Set(spans.map((s) => s.spanId));
    const tops = spans
      .filter((s) => !s.parentSpanId || !ids.has(s.parentSpanId))
      .sort((a, b) => toMs(a.startTime) - toMs(b.startTime));
    return tops.find((s) => s.spanType === "agent") ?? tops[0] ?? null;
  }, [spans]);
  // Short traces size the sheet so the page never scrolls (-14rem accounts for
  // the chrome above + below it); once the waterfall outgrows the viewport the
  // page scrolls anyway, so the sheet takes the extra room (-6rem).
  return (
    <Card
      className={cn(
        tall ? "max-h-[calc(100svh-6rem)]" : "max-h-[calc(100svh-14rem)]",
        "gap-0 py-0"
      )}
    >
      <CardHeader className="flex shrink-0 items-center gap-2 p-5 px-5 pb-1">
        <CardTitle className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex size-4.5 shrink-0 items-center shadow-[inset_0_0_0_1px_rgba(100,116,139,0.14),0_2px_6px_-2px_rgba(100,116,139,0.25)] dark:shadow-(--custom-shadow) justify-center rounded-md corner-squircle bg-primary/15 text-primary">
            <IconAffiliate className="size-3" />
          </span>
          <span className="truncate">Whole trace</span>
        </CardTitle>
        {/* Same control trio as SpanDetail, so the panel's chrome doesn't jump
            when the selection moves between the trace and a span. */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted-foreground/60 hover:text-foreground"
            onClick={() => setTab(tab === "raw" ? "overview" : "raw")}
          >
            {tab === "raw" ? "Overview" : "Raw"}
          </Button>
          {/* The trace row sits above the span list, so ↑ has nowhere to go. */}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground/60 hover:text-foreground"
            disabled
            aria-label="Previous span"
            title="Previous span (↑)"
          >
            <IconChevronUp className="size-4 text-current" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground/60 hover:text-foreground"
            onClick={() => onStep(1)}
            disabled={spans.length === 0}
            aria-label="Next span"
            title="First span (↓)"
          >
            <IconChevronDown className="size-4 text-current" />
          </Button>
          <CopyButton
            value={JSON.stringify(trace, null, 2)}
            title="Copy trace summary as JSON"
          />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(String(v))}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          {/* No TabsList — the header's Raw/Overview toggle drives `tab`. */}
          <TabsContent
            value="overview"
            className="flex min-h-0 flex-1 flex-col"
          >
            <ScrollFade
              containerClassName="flex min-h-0 flex-1 flex-col"
              className="flex min-h-0 flex-1 flex-col gap-4 py-5"
            >
              <div className="grid grid-cols-2 gap-4 border-b border-border/40 pb-5 px-5">
                <Field
                  label="Started"
                  value={formatDateTime(trace.startTime)}
                />
                <Field
                  label="Duration"
                  value={rankedValue(
                    formatSpanDuration(trace.durationMs),
                    rank?.durationPercentile
                  )}
                />
                <Field
                  label="Cost"
                  value={rankedValue(
                    formatCost(trace.cost),
                    rank?.costPercentile
                  )}
                />
                <Field
                  label="Tokens"
                  value={rankedValue(
                    formatTokens(trace.tokens),
                    rank?.tokenPercentile
                  )}
                />
                {/* No Spans/Errors counters — the waterfall shows the spans and the
                issues strip already surfaces errors. */}
              </div>

              {trace.durationMs > 0 && (
                <div className="flex flex-col gap-2 border-b border-border/40 py-5 px-5">
                  <span className="text-xs text-muted-foreground">
                    Time distribution
                  </span>
                  <TimeComposition spans={spans} totalMs={trace.durationMs} />
                </div>
              )}

              {/* Renders only when the spend splits across 2+ models. */}
              <CostComposition
                spans={spans}
                className="border-b border-border/40 py-5 px-5"
              />

              {trace.scores.length > 0 && (
                <div className="flex flex-col gap-1 border-b border-border/40 py-5 px-3">
                  <span className="text-xs text-muted-foreground px-2">
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

              {root?.toolCatalog && (
                <ToolsAvailable
                  catalog={root.toolCatalog}
                  className="border-b border-border/40 px-5 py-5"
                />
              )}

              {root?.input && (
                <Transcript
                  label="Input"
                  value={root.input}
                  className="border-b border-border/40 px-5 py-5"
                />
              )}
              {root?.output && (
                <Transcript
                  label="Output"
                  value={root.output}
                  className="px-5 pt-5"
                />
              )}
            </ScrollFade>
          </TabsContent>
          <TabsContent value="raw" className="flex min-h-0 flex-1 flex-col">
            <ScrollFade
              containerClassName="flex min-h-0 flex-1 flex-col"
              className="flex min-h-0 flex-1 flex-col gap-4 py-5 pt-0"
            >
              <Payload
                label="Trace"
                value={JSON.stringify(trace)}
                className="border-b border-border/40 px-5 py-5 pt-4"
              />
              {root?.input && (
                <Payload
                  label="Root input"
                  value={root.input}
                  className="border-b border-border/40 px-5 py-5"
                />
              )}
              {root?.output && (
                <Payload
                  label="Root output"
                  value={root.output}
                  className="px-5 pt-5"
                />
              )}
            </ScrollFade>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function SpanDetail({
  span,
  scores,
  evalMeta,
  presetName,
  spanIndex,
  spanCount,
  onStep,
  subtree,
  previousInput,
  tall,
}: {
  span: Span;
  scores: TraceScore[];
  evalMeta: Map<string, EvalMeta>;
  presetName: Map<string, string>;
  spanIndex: number;
  spanCount: number;
  onStep: (delta: number) => void;
  subtree: SubtreeStats | undefined;
  /** Input of the trace's previous LLM call — folds the unchanged message
   * prefix out of this span's Input transcript. Null for the first call. */
  previousInput: string | null;
  tall: boolean;
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
    // No "Requests" row — it's 1 for virtually every LLM call, so it only ever
    // added a noise section. Raw still has requestCount.
  ].filter((p) => p.value > 0);
  const hasBreakdown =
    costParts.length > 0 ||
    usageExtras.length > 0 ||
    !!span.pricedModelId ||
    !!span.pricedAt;
  // Secondary provider signals: grounding sources and rate-limit headroom.
  // Headroom shows only when it's actually low — "98% left" on every span is
  // reassurance noise, and the issues strip already points here when it dips.
  // Fingerprint/safety metadata live in Raw only.
  const sources = parseSources(span.sources);
  const rl = span.rateLimit;
  const tokenPct = pctRemaining(rl?.tokensRemaining, rl?.tokensLimit);
  const requestPct = pctRemaining(rl?.requestsRemaining, rl?.requestsLimit);
  const lowTokenHeadroom = tokenPct != null && tokenPct < LOW_HEADROOM_PCT;
  const lowRequestHeadroom =
    requestPct != null && requestPct < LOW_HEADROOM_PCT;
  const fields = useMemo(() => spanFields(span, subtree), [span, subtree]);
  const hasSignals =
    sources.length > 0 || lowTokenHeadroom || lowRequestHeadroom;
  // Overview is curated and per-type, so it can omit fields; Raw is the
  // always-complete escape hatch. Reset to Overview when the panel swaps to a
  // different span — otherwise every subsequent selection lands on Raw.
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    setTab("overview");
  }, [span.spanId]);
  // Same sheet-height rule as TraceDetail: fit the page when the trace is
  // short, take the extra room once the waterfall makes the page scroll.
  return (
    <Card
      className={cn(
        tall ? "max-h-[calc(100svh-6rem)]" : "max-h-[calc(100svh-14rem)]",
        "gap-0 py-0"
      )}
    >
      <CardHeader className="flex shrink-0 items-center gap-2 p-5 px-5 pb-1">
        <CardTitle className="flex min-w-0 flex-1 items-center gap-2">
          {/* Same identity chip as the span's waterfall row — which also
              makes a type badge redundant. */}
          <SpanIconChip span={span} />
          <span className="truncate">{span.name}</span>
          {(span.spanType === "tool" || span.spanType === "other") && (
            <SpanStatusIcon status={span.status} />
          )}
        </CardTitle>
        <div className="flex shrink-0 items-center gap-1">
          {/* Overview is curated; Raw is the always-complete escape hatch.
              One toggle instead of a tab strip — the label names where it
              takes you, not where you are. */}
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted-foreground/60 hover:text-foreground"
            onClick={() => setTab(tab === "raw" ? "overview" : "raw")}
          >
            {tab === "raw" ? "Overview" : "Raw"}
          </Button>
          {/* The ↑/↓ shortcuts have always worked; these buttons are what make
					    them discoverable, so both name the key in their tooltip. */}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground/60 hover:text-foreground"
            onClick={() => onStep(-1)}
            disabled={spanIndex < 0}
            aria-label="Previous span"
            title="Previous span (↑, back to whole trace from the first)"
          >
            <IconChevronUp className="size-4 text-current" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground/60 hover:text-foreground"
            onClick={() => onStep(1)}
            disabled={spanIndex < 0 || spanIndex >= spanCount - 1}
            aria-label="Next span"
            title="Next span (↓)"
          >
            <IconChevronDown className="size-4 text-current" />
          </Button>
          <CopyButton
            value={JSON.stringify(span, null, 2)}
            title="Copy span as JSON"
          />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(String(v))}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          {/* No TabsList — the header's Raw/Overview toggle drives `tab`. */}
          <TabsContent
            value="overview"
            className="flex min-h-0 flex-1 flex-col"
          >
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
                {fields.map((f) => (
                  <Field key={f.label} label={f.label} value={f.value} />
                ))}
              </div>

              {scores.length > 0 && (
                <div className="flex flex-col gap-1 border-b border-border/40 py-5 px-3">
                  <span className="text-xs text-muted-foreground px-2">
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
                  <span className="text-xs text-muted-foreground px-1">
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
                  {/* The usage-count side of the breakdown — cached/reasoning
                  tokens, retries — so the costs above have their volumes. */}
                  {usageExtras.length > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground px-1">
                        Usage
                      </span>
                      <div className="grid grid-cols-2 gap-4 px-1">
                        {usageExtras.map((p) => (
                          <Field
                            key={p.label}
                            label={p.label}
                            value={
                              p.unit === " tok"
                                ? `${formatTokens(p.value)} tok`
                                : formatCount(p.value)
                            }
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {hasSignals && (
                <div className="flex flex-col gap-3 border-b border-border/40 py-5 px-5">
                  <span className="text-xs text-muted-foreground px-1">
                    Provider signals
                  </span>
                  {(lowTokenHeadroom || lowRequestHeadroom) && (
                    <div className="grid grid-cols-2 gap-4 px-1">
                      {lowTokenHeadroom && (
                        <Field
                          label="Token headroom"
                          value={
                            <span>
                              {formatTokens(rl!.tokensRemaining!)} /{" "}
                              {formatTokens(rl!.tokensLimit!)}
                              <span className="text-muted-foreground">
                                {" "}
                                ({tokenPct}% left)
                              </span>
                            </span>
                          }
                        />
                      )}
                      {lowRequestHeadroom && (
                        <Field
                          label="Request headroom"
                          value={
                            <span>
                              {formatCount(rl!.requestsRemaining!)} /{" "}
                              {formatCount(rl!.requestsLimit!)}
                              <span className="text-muted-foreground">
                                {" "}
                                ({requestPct}% left)
                              </span>
                            </span>
                          }
                        />
                      )}
                      {/* Reset time only matters while headroom is the problem. */}
                      {lowTokenHeadroom && rl?.tokensResetMs != null && (
                        <Field
                          label="Tokens reset"
                          value={`in ${formatDuration(rl.tokensResetMs)}`}
                        />
                      )}
                    </div>
                  )}
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
                          )
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

              {metaEntries.length > 0 && (
                <div className="flex flex-col gap-2 border-b border-border/40 px-5 py-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Metadata
                    </span>
                    <CopyButton
                      value={metaEntries
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n")}
                      title="Copy metadata"
                    />
                  </div>
                  {/* TOC-style monospace lines. The dot leader is real "."
                      text (selectable), overflowing its flex slot so every
                      value lands flush against the sheet's right edge; the
                      copy button copies plain `key: value` lines instead, so
                      pasted output isn't full of clipped dots. */}
                  <div className="flex flex-col gap-1 font-mono text-xs pr-1">
                    {metaEntries.map(([k, v]) => (
                      <div key={k} className="flex items-baseline">
                        <span className="shrink-0 text-muted-foreground">
                          {k}
                        </span>
                        <span className="min-w-4 flex-1 overflow-hidden whitespace-nowrap text-muted-foreground/20">
                          {".".repeat(300)}
                        </span>
                        <span className="min-w-0 truncate" title={v}>
                          {v}
                        </span>
                      </div>
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

              {/* Readable transcript here; the Raw tab keeps the verbatim JSON. */}
              {span.input && (
                <Transcript
                  label={span.spanType === "tool" ? "Arguments" : "Input"}
                  value={span.input}
                  previousValue={previousInput}
                  className="border-b border-border/40 px-5 py-5"
                />
              )}
              {span.output && (
                <Transcript
                  label={span.spanType === "tool" ? "Result" : "Output"}
                  value={span.output}
                  className="px-5 pt-5"
                />
              )}
            </ScrollFade>
          </TabsContent>
          <TabsContent value="raw" className="flex min-h-0 flex-1 flex-col">
            <ScrollFade
              containerClassName="flex min-h-0 flex-1 flex-col"
              className="flex min-h-0 flex-1 flex-col gap-4 py-5 pt-4"
            >
              <SpanRaw span={span} />
            </ScrollFade>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/** The complete span, unfiltered and uncurated — the escape hatch for anything
 * the per-type Overview layout omits, and the only view guaranteed to render
 * something for span types we don't have a layout for. Payloads are split out
 * of the field blob so they stay readable (and copyable) on their own; they're
 * shown in full, never truncated. */
function SpanRaw({ span }: { span: Span }) {
  const fields = useMemo(() => {
    const { input, output, ...rest } = span;
    // Absent fields are noise here — the point of Raw is to show what was
    // captured, and a wall of nulls buries it.
    const present = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => {
        if (v == null || v === "") return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === "object") return Object.keys(v).length > 0;
        return true;
      })
    );
    return JSON.stringify(present);
  }, [span]);
  return (
    <>
      <Payload
        label="Span"
        value={fields}
        className="border-b border-border/40 px-5 py-5 pt-1"
      />
      {span.input && (
        <Payload
          label="Input"
          value={span.input}
          className="border-b border-border/40 px-5 py-5"
        />
      )}
      {span.output && (
        <Payload label="Output" value={span.output} className="px-5 pt-5" />
      )}
    </>
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
        }
      );
    } catch {
      return null;
    }
  }, [catalog]);

  // Collapsed by default: the catalog is static per app and often the longest
  // block in the sheet — the count is the useful part at a glance.
  const [open, setOpen] = useState(false);

  if (!tools)
    return (
      <Payload label="Tools available" value={catalog} className={className} />
    );

  return (
    <div className={cn("flex flex-col", open && "gap-2", className)}>
      <div className="flex items-center justify-between">
        {/* CopyButton stays a sibling, not a child — nested buttons are
            invalid HTML (same workaround as the issues strip). */}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconChevronRight
            className={cn("size-3.5 transition-transform", open && "rotate-90")}
          />
          Tools available ({tools.length})
        </button>
        <CopyButton value={catalog} title="Copy tool catalog" />
      </div>
      {open && (
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
            )
          )}
        </div>
      )}
    </div>
  );
}

/** A payload rendered as a conversation rather than JSON — same label + copy
 * header as {@link Payload}, which still backs the Raw tab and the tool catalog.
 * Copy yields the original string, not the rendered view. */
function Transcript({
  label,
  value,
  previousValue,
  className,
}: {
  label: string;
  value: string;
  /** Same payload from the previous LLM call — lets PayloadView fold the
   * unchanged message prefix (see its prop doc). */
  previousValue?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <CopyButton value={value} title={`Copy ${label.toLowerCase()}`} />
      </div>
      <PayloadView value={value} previousValue={previousValue} />
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
      <span className="text-xs font-medium">{label}</span>
      {/* The copy button floats inside the block's top-right corner — pinned
          to this wrapper, not the scroll content, so it stays put while the
          payload scrolls under it. bg-muted keeps it legible over code.
          top-2 + the button's own p-1 puts the icon level with the first text
          line (the pre's p-3), which doubles as dead-center on one-liners. */}
      <div className="relative">
        <CopyButton
          value={formatted}
          title={`Copy ${label.toLowerCase()}`}
          className="absolute top-2 right-2 z-10 bg-muted"
        />
        {html ? (
          // Shiki sets the pre's background via an inline style; `bg-muted!`
          // overrides it (an !important class beats a non-important inline style)
          // so the block matches the panel's other muted surfaces.
          <div
            className="max-h-80 overflow-auto overscroll-none rounded-md text-xs [&_pre]:m-0 [&_pre]:bg-muted! [&_pre]:p-3 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-break-word"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki output
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="max-h-80 overflow-auto overscroll-none rounded-md bg-muted p-3 text-xs whitespace-pre-wrap wrap-break-word">
            {formatted}
          </pre>
        )}
      </div>
    </div>
  );
}
