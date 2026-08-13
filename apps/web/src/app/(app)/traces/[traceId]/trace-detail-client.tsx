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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@foglamp/ui/components/tabs";
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
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCirclesFilled,
  IconClockFilled,
  IconCoinFilled,
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
  StatCard,
  TableSkeleton,
} from "@/components/app/page-parts";
import { PayloadView } from "@/components/app/payload-view";
import { useProject } from "@/components/app/project-context";
import { SpanTypeBadge } from "@/components/app/span-type";
import { TraceTimeline, WHOLE_TRACE_ID } from "@/components/app/trace-timeline";
import { ModelLogo, formatModelName } from "@/components/model-logo";
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
  llmCount: number;
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
      llmCount: stats.llm,
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
          actions={
            sessionId && (
              <TurnNav
                prev={neighbors.data?.prev ?? null}
                next={neighbors.data?.next ?? null}
              />
            )
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
            "mt-1 flex flex-wrap items-center gap-2 text-xs px-8",
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
          <section
            className={cn(
              "grid grid-cols-2 gap-4 lg:grid-cols-4 px-8 mt-1",
              entrance && !skeletonShown && "page-fade-in"
            )}
          >
            <StatCard
              icon={IconCirclesFilled}
              iconClassName="text-blue-500 dark:text-blue-500"
              size="sm"
              label="Tokens"
              value={stats.tokens}
              formatValue={formatTokens}
              hint={rankHint(rank?.tokenPercentile)}
            />
            <StatCard
              icon={IconAlertTriangleFilled}
              iconClassName="text-red-500 dark:text-red-600"
              size="sm"
              label="Errors"
              value={
                <span
                  className={cn(
                    erroredSpans.length > 0 && "text-red-500 dark:text-red-600"
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
              value={window.span}
              formatValue={formatDuration}
              hint={rankHint(rank?.durationPercentile)}
            />
            <StatCard
              icon={IconCoinFilled}
              iconClassName="text-yellow-300 dark:text-yellow-600"
              size="sm"
              label="Cost"
              value={stats.cost ?? "—"}
              formatValue={(n) => formatCost(n, 4)}
              hint={rankHint(rank?.costPercentile)}
            />
          </section>

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
              "flex items-start gap-6 px-8",
              entrance && !skeletonShown && "page-fade-in"
            )}
          >
            <div className="min-w-0 flex-1">
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

/** "p91 · this agent" — where this trace's value falls among the same agent's
 * traces over the last week. The hint is purely additive: while the query is in
 * flight, fails, or declines to answer (no agent, too few traces, unpriced),
 * it renders nothing and the card looks exactly as it always has. */
function rankHint(percentile?: number | null) {
  if (percentile == null) return null;
  return (
    <span title={`Higher than ${percentile}% of this agent's traces this week`}>
      p{percentile} · this agent
    </span>
  );
}

/** Move between the traces of one session. Session traces are conversation
 * turns — the sessions page frames them that way, so this does too. Rendered
 * disabled (not hidden) at the ends of the session, so the control doesn't
 * appear and disappear as you walk a conversation. */
function TurnNav({
  prev,
  next,
}: {
  prev: { traceId: string } | null;
  next: { traceId: string } | null;
}) {
  const link = (t: { traceId: string } | null) =>
    t ? `/traces/${encodeURIComponent(t.traceId)}` : null;
  return (
    <div className="flex items-center gap-1">
      <TurnNavButton
        href={link(prev)}
        label="Previous turn"
        icon={IconChevronLeft}
      />
      <TurnNavButton
        href={link(next)}
        label="Next turn"
        icon={IconChevronRight}
      />
    </div>
  );
}

function TurnNavButton({
  href,
  label,
  icon: Icon,
}: {
  href: string | null;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  if (!href) {
    return (
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        disabled
        aria-label={label}
        title={label}
      >
        <Icon className="size-4" />
      </Button>
    );
  }
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label={label}
      title={label}
      // biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
      render={<Link href={href as any} />}
    >
      <Icon className="size-4" />
    </Button>
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
      if (span.ttftMs !== null) {
        add(
          "TTFT",
          span.reasoningDurationMs != null && span.reasoningDurationMs > 0 ? (
            // Reasoning models: show how much of the wait was thinking.
            <span>
              {formatDuration(span.ttftMs)}{" "}
              <span className="text-muted-foreground">
                ({formatDuration(span.reasoningDurationMs)} thinking)
              </span>
            </span>
          ) : (
            formatDuration(span.ttftMs)
          )
        );
      }
      add("Model", model);
      add("Provider", span.provider);
      add(
        "Tokens",
        `${formatTokens(span.inputTokens)} in · ${formatTokens(span.outputTokens)} out`
      );
      add("Cost", formatCost(span.totalCost));
      add("Pricing", span.pricingSource);
      if (span.modelCallMs != null) {
        add(
          "Model call",
          <span>
            {formatDuration(span.modelCallMs)}{" "}
            <span className="text-muted-foreground">
              ({formatDuration(Math.max(0, span.durationMs - span.modelCallMs))}{" "}
              tools)
            </span>
          </span>
        );
      }
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
        add("Child spans", formatCount(subtree.spans));
        if (subtree.tokens > 0) add("Tokens", formatTokens(subtree.tokens));
        if (subtree.cost != null) add("Cost", formatCost(subtree.cost));
      }
      if (span.status !== "ok") add("Status", span.status);
      break;
    }
    // `tool` and `other` carry none of the model fields — guessing at them is
    // how you end up with a grid of dashes.
    default: {
      add("Status", span.status);
      if (span.totalCost != null && span.totalCost !== 0)
        add("Cost", formatCost(span.totalCost));
      break;
    }
  }
  return fields;
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
}) {
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
      className="group/panel sticky top-0 shrink-0 self-start"
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
}: {
  trace: TraceSummary;
  spans: Span[];
  evalMeta: Map<string, EvalMeta>;
  presetName: Map<string, string>;
}) {
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
  return (
    <Card className="max-h-[calc(100svh-16rem)] gap-0 py-0 ">
      <CardHeader className="flex shrink-0 items-center gap-2 border-b border-border/40 [.border-b]:pb-5 p-5 px-5">
        <CardTitle className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md corner-squircle bg-primary/15 text-primary">
            <IconAffiliate className="size-3" />
          </span>
          <span className="truncate">Whole trace</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <ScrollFade
          containerClassName="flex min-h-0 flex-1 flex-col"
          className="flex min-h-0 flex-1 flex-col gap-4 py-5"
        >
          <div className="grid grid-cols-2 gap-4 border-b border-border/40 pb-5 px-5">
            <Field label="Started" value={formatDateTime(trace.startTime)} />
            <Field
              label="Duration"
              value={formatSpanDuration(trace.durationMs)}
            />
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

          {trace.durationMs > 0 && (
            <div className="flex flex-col gap-2 border-b border-border/40 py-5 px-5">
              <span className="text-xs font-medium text-muted-foreground">
                Time distribution
              </span>
              <TimeComposition spans={spans} totalMs={trace.durationMs} />
            </div>
          )}

          {trace.scores.length > 0 && (
            <div className="flex flex-col gap-1 border-b border-border/40 py-5 px-3">
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
              className="px-5 py-5"
            />
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
  spanIndex,
  spanCount,
  onStep,
  subtree,
}: {
  span: Span;
  scores: TraceScore[];
  evalMeta: Map<string, EvalMeta>;
  presetName: Map<string, string>;
  spanIndex: number;
  spanCount: number;
  onStep: (delta: number) => void;
  subtree: SubtreeStats | undefined;
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
  const hasTokenHeadroom =
    rl?.tokensRemaining != null && rl?.tokensLimit != null;
  const hasRequestHeadroom =
    rl?.requestsRemaining != null && rl?.requestsLimit != null;
  const fields = useMemo(() => spanFields(span, subtree), [span, subtree]);
  const hasSignals =
    !!span.systemFingerprint ||
    !!span.safetyMetadata ||
    sources.length > 0 ||
    hasTokenHeadroom ||
    hasRequestHeadroom;
  // Overview is curated and per-type, so it can omit fields; Raw is the
  // always-complete escape hatch. Reset to Overview when the panel swaps to a
  // different span — otherwise every subsequent selection lands on Raw.
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    setTab("overview");
  }, [span.spanId]);
  return (
    <Card className="max-h-[calc(100svh-16rem)] gap-0 py-0 ">
      <CardHeader className="flex shrink-0 flex-col items-stretch gap-3 border-b border-border/40 [.border-b]:pb-5 p-5 px-5">
        <div className="flex items-center gap-2">
          <CardTitle className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate">{span.name}</span>
            <SpanTypeBadge type={span.spanType} className="shrink-0" />
          </CardTitle>
        </div>
        <div className="flex items-center gap-1">
          {/* The ↑/↓ shortcuts have always worked; these buttons are what make
					    them discoverable, so both name the key in their tooltip. */}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => onStep(-1)}
            disabled={spanIndex < 0}
            aria-label="Previous span"
            title="Previous span (↑, back to whole trace from the first)"
          >
            <IconChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => onStep(1)}
            disabled={spanIndex < 0 || spanIndex >= spanCount - 1}
            aria-label="Next span"
            title="Next span (↓)"
          >
            <IconChevronDown className="size-4" />
          </Button>
          {spanIndex >= 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {spanIndex + 1} / {spanCount}
            </span>
          )}
          <CopyButton
            value={JSON.stringify(span, null, 2)}
            title="Copy span as JSON"
            className="ml-auto"
          />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(String(v))}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          {/* Outside the ScrollFade below, so the strip stays reachable from
					    the bottom of a long payload. */}
          <TabsList
            variant="line"
            className="shrink-0 gap-3 border-b border-border/40 px-5"
          >
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>
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
                  {/* The usage-count side of the breakdown — cached/reasoning
                  tokens, retries — so the costs above have their volumes. */}
                  {usageExtras.length > 0 && (
                    <>
                      <span className="text-xs font-medium text-muted-foreground px-1">
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
                            {pctRemaining(
                              rl!.tokensRemaining,
                              rl!.tokensLimit
                            ) != null && (
                              <span className="text-muted-foreground">
                                {" "}
                                (
                                {pctRemaining(
                                  rl!.tokensRemaining,
                                  rl!.tokensLimit
                                )}
                                % left)
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
                              rl!.requestsLimit
                            ) != null && (
                              <span className="text-muted-foreground">
                                {" "}
                                (
                                {pctRemaining(
                                  rl!.requestsRemaining,
                                  rl!.requestsLimit
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
                  <span className="text-xs text-muted-foreground">
                    Metadata
                  </span>
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

              {/* Readable transcript here; the Raw tab keeps the verbatim JSON. */}
              {span.input && (
                <Transcript
                  label={span.spanType === "tool" ? "Arguments" : "Input"}
                  value={span.input}
                  className="border-b border-border/40 px-5 py-5"
                />
              )}
              {span.output && (
                <Transcript
                  label={span.spanType === "tool" ? "Result" : "Output"}
                  value={span.output}
                  className="px-5 py-5"
                />
              )}
            </ScrollFade>
          </TabsContent>
          <TabsContent value="raw" className="flex min-h-0 flex-1 flex-col">
            <ScrollFade
              containerClassName="flex min-h-0 flex-1 flex-col"
              className="flex min-h-0 flex-1 flex-col gap-4 py-5"
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
        className="border-b border-border/40 px-5 py-5"
      />
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
          )
        )}
      </div>
    </div>
  );
}

/** A payload rendered as a conversation rather than JSON — same label + copy
 * header as {@link Payload}, which still backs the Raw tab and the tool catalog.
 * Copy yields the original string, not the rendered view. */
function Transcript({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <CopyButton value={value} title={`Copy ${label.toLowerCase()}`} />
      </div>
      <PayloadView value={value} />
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
