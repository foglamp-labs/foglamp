"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {} from "@foglamp/ui/components/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import {
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconArrowUpRight,
  IconBoltFilled,
  IconChartAreaFilled,
  IconClockFilled,
  IconCoinFilled,
  IconGhostFilled,
  IconSitemapFilled,
  IconTool,
  IconAffiliateFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { DRAWER_BUTTON_CLASS } from "@/components/app/button-styles";
import { CostBreakdownCard } from "@/components/app/cost-breakdown-card";
import {
  PaginationFooter,
  SortableHead,
  useTableSort,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import {
  useDelayedLoading,
  useEntranceOnce,
  useSkeletonShown,
} from "@/components/app/hooks";
import { navItem } from "@/components/app/nav";
import { ClampedBody, Prose } from "@/components/app/payload-view";
import {
  type FlowNode,
  NodeFlow,
  NodeFlowSkeleton,
} from "@/components/app/node-flow";
import {
  EmptyState,
  NoProject,
  PageHeader,
  StatCard,
  TableRowsSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangeControl } from "@/components/app/range-picker";
import { RelativeTime } from "@/components/app/relative-time";
import {
  Conversation,
  ConversationSkeleton,
  CustomerValue,
  DrawerColumns,
  DrawerRow,
  ExpandChevron,
  FOCUSED_ROW_CLASS,
  Meta,
  MetaEmpty,
  ModelsValue,
  OPEN_ROW_CLASS,
  SessionButton,
  emptyOutputHint,
} from "@/components/app/run-exchange";
import { spanTypeIcon } from "@/components/app/span-type";
import { ToolBreakdownCard } from "@/components/app/tool-breakdown-card";
import {
  ChartLegend,
  fillBuckets,
  formatBucketFull,
  makeBucketLabel,
  makeEdgeTick,
  themed,
  thinTicks,
  useFrozen,
  useZoomRange,
} from "@/components/app/trend-charts";
import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { ModelLogo } from "@/components/model-logo";
import {
  formatCost,
  formatCostFixed,
  formatCount,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatSpanDuration,
  formatTokens,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { type RouterOutputs, trpc } from "@/utils/trpc";

type TraceRow = RouterOutputs["traces"]["list"]["traces"][number];

const PAGE_SIZES = [25, 50, 100];

// Skeleton column spec for the loading body rows (see TableRowsSkeleton).
const SKELETON_COLS = [
  { icon: true, w: "w-64" },
  { w: "w-20" },
  { align: "right", w: "w-8" },
  { align: "right", w: "w-12" },
  { align: "right", w: "w-14" },
  { align: "right", w: "w-16" },
] as const;

type TraceSortKey = "when" | "duration" | "tokens" | "spans" | "cost";

const volumeConfig = {
  spans: { label: "Spans", colors: themed("var(--chart-2)") },
  errors: { label: "Errored", colors: themed("var(--destructive)") },
} satisfies ChartConfig;

const latencyConfig = {
  // neutral-800 on light, neutral-200 on dark — matches the Overview latency chart
  p50: { label: "p50", colors: { light: ["#262626"], dark: ["#e5e5e5"] } },
  p95: { label: "p95", colors: themed("#0090FD") },
  p99: { label: "p99", colors: themed("#FF5513") },
} satisfies ChartConfig;

function stepIcon(
  spanType: string,
  modelId: string | null,
  name: string | null,
) {
  if (spanType === "llm" && modelId)
    return <ModelLogo modelId={modelId} className="size-3.25" />;
  if (spanType === "agent")
    return <AgentIcon name={name} className="size-3.25" />;
  if (spanType === "tool")
    return (
      <IconTool className="size-3 shrink-0 fill-current stroke-1 text-blue-500 mb-px" />
    );
  const Icon = spanTypeIcon(spanType);
  return <Icon className="size-3.25 text-muted-foreground" />;
}

export function AgentDetailClient({ agentName }: { agentName: string }) {
  const entrance = useEntranceOnce();
  const { projectId } = useProject();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { range, setRange } = useRange();
  // A `?trace=` deep link focuses one trace: its row opens and is tinted.
  const focusTrace = searchParams.get("trace");
  // Which trace row is expanded (steps + input/output drawer). Mirrors `?trace=`
  // so an open drawer is deep-linkable.
  const [expanded, setExpanded] = useState<string | null>(focusTrace);
  // The row the page was *opened on* (deep link) gets the focused tint and a
  // scroll-into-view; rows the user expands themselves are plain card, like
  // the evals table. Cleared on the first toggle so the tint doesn't follow
  // the `?trace=` mirror around.
  const [deepLinked, setDeepLinked] = useState<string | null>(focusTrace);
  const focusRef = useRef<HTMLTableRowElement>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  // Selected series for each trend chart, driven by the header legends.
  const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
  const [latencySelected, setLatencySelected] = useState<string | null>(null);
  const { sort, toggle } = useTableSort<TraceSortKey>();

  const { from, to } = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range],
  );
  const enabled = !!projectId;
  const zoom = useZoomRange();

  // Stats reflect *all* spans in the window (no errors-only filter), so the
  // error-rate stat stays meaningful when the table below is filtered down.
  const detail = useQuery({
    ...trpc.agents.get.queryOptions({
      projectId: projectId!,
      agentName,
      from,
      to,
    }),
    enabled,
    placeholderData: (prev) => prev,
  });

  const series = useQuery({
    ...trpc.metrics.timeseries.queryOptions({
      projectId: projectId!,
      agentName,
      from,
      to,
    }),
    enabled,
    placeholderData: (prev) => prev,
  });

  // Alert rules, for threshold lines on the latency chart: project-wide
  // latency alerts plus ones scoped to this agent (but not to a specific
  // model/workflow/metadata, which this chart doesn't isolate).
  const alerts = useQuery({
    ...trpc.alerts.list.queryOptions({ projectId: projectId! }),
    enabled,
  });
  const latencyThresholds = useMemo(
    () =>
      (alerts.data ?? []).filter(
        (r) =>
          r.enabled &&
          r.threshold != null &&
          !r.evalId &&
          (r.metric === "latency_p50" ||
            r.metric === "latency_p95" ||
            r.metric === "latency_p99") &&
          (!r.filters?.agentName || r.filters.agentName === agentName) &&
          !r.filters?.modelId &&
          !r.filters?.workflowName &&
          Object.keys(r.filters?.metadata ?? {}).length === 0,
      ),
    [alerts.data, agentName],
  );

  const traces = useQuery({
    ...trpc.traces.list.queryOptions({
      projectId: projectId!,
      agentName,
      from,
      to,
      sort: sort ? { field: sort.key, dir: sort.dir } : undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
    enabled,
    // Keep the current page visible while the next one loads.
    placeholderData: (prev) => prev,
  });

  // Reset paging + any open drawer when the query that defines the result set
  // changes (skipping mount, so a deep-linked drawer survives the first render).
  const mounted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on filter changes only
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPage(0);
    setExpanded(null);
  }, [range, projectId, sort]);

  const traceRows = traces.data?.traces ?? [];
  // Global 20/40/60/80th-percentile thresholds for the heat-tinted cells,
  // computed server-side over the whole filtered window (not just this page).
  const costQuantiles = traces.data?.costQuantiles ?? [];
  const durationQuantiles = traces.data?.durationQuantiles ?? [];

  // Toggle a row's drawer and mirror it in the URL (`?trace=`), so the open
  // trace can be shared and survives a reload.
  const toggleTrace = (id: string) => {
    const next = expanded === id ? null : id;
    setExpanded(next);
    setDeepLinked(null);
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    if (next) sp.set("trace", next);
    else sp.delete("trace");
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };
  // Once the deep-linked trace is on the loaded page, scroll it into view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run as traces load
  useEffect(() => {
    if (deepLinked && focusRef.current) {
      focusRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [deepLinked, traces.data]);
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showTracesSkeleton = useDelayedLoading(traces.isLoading);
  // Latch for the entrance fade: the traces table only fades in if this slot
  // never painted a skeleton first (see useSkeletonShown).
  const tracesSkeletonShown = useSkeletonShown(showTracesSkeleton);

  // While a range change refetches, the trend charts hold the previous view —
  // the rows *and* the window they were fetched for, so fill, ticks, and label
  // format stay mutually consistent — dimmed (isUpdating), then swap to the
  // fresh view in one transition.
  const chartsStale = series.isPlaceholderData;
  const chartView = useFrozen(
    { series: series.data, from: range.from, to: range.to },
    chartsStale,
  );
  const chartWindowMs = chartView.to.getTime() - chartView.from.getTime();
  const bucketLabel = useMemo(
    () => makeBucketLabel(chartWindowMs),
    [chartWindowMs],
  );
  const edgeTick = useMemo(() => makeEdgeTick(bucketLabel), [bucketLabel]);
  // Keep the raw bucket as the x value (formatted on the axis) so we can thin
  // the ticks and edge-anchor the first/last labels. Zero-filled so an agent's
  // quiet stretches keep their width on the x-axis.
  const seriesData = useMemo(
    () =>
      fillBuckets(
        (chartView.series ?? []).map((r) => ({
          bucket: r.bucket,
          spans: r.spanCount,
          errors: r.errorCount,
          p50: r.latencyMs.p50,
          p95: r.latencyMs.p95,
          p99: r.latencyMs.p99,
        })),
        chartView.from,
        chartView.to,
        (bucket) => ({ bucket, spans: 0, errors: 0, p50: 0, p95: 0, p99: 0 }),
      ),
    [chartView],
  );
  // Latency as a stacked *band* chart: each area plots the delta to the band
  // below it (p50, p95−p50, p99−p95), so its gradient fill is bounded between two
  // percentile lines instead of bleeding down to the axis. The stack tops land
  // exactly on p50/p95/p99; the absolutes ride along for the tooltip.
  const latencyData = useMemo(
    () =>
      seriesData.map((r) => ({
        bucket: r.bucket,
        p50: r.p50,
        p95: Math.max(0, r.p95 - r.p50),
        p99: Math.max(0, r.p99 - r.p95),
        p50Abs: r.p50,
        p95Abs: r.p95,
        p99Abs: r.p99,
      })),
    [seriesData],
  );

  const seriesTicks = useMemo(
    () =>
      thinTicks(
        seriesData.map((d) => d.bucket),
        bucketLabel,
      ),
    [seriesData, bucketLabel],
  );

  const back = navItem("/agents");

  if (!projectId) {
    return (
      <>
        <PageHeader
          title={agentName}
          titleLeading={<AgentIcon name={agentName} className="size-4.5" />}
          back={back}
        />
        <NoProject />
      </>
    );
  }

  const stats = detail.data?.stats ?? null;
  const errorRate =
    stats && stats.spanCount > 0 ? stats.errorCount / stats.spanCount : null;

  const totalTraces = traces.data?.summary.traceCount ?? 0;
  // No activity for this agent at all (not just filtered away). Wait for the
  // stats so a slow rollup doesn't flash the empty state before they land.
  const noData = !detail.isLoading && (stats === null || stats.spanCount === 0);
  const seriesLoading = series.isLoading;

  return (
    <>
      <div className={cn(entrance && "page-fade-in")}>
        <PageHeader
          title={agentName}
          titleLeading={<AgentIcon name={agentName} className="size-4.5" />}
          back={back}
          actions={<RangeControl value={range} onChange={setRange} />}
        />
      </div>

      {noData ? (
        <div className={cn(entrance && "page-fade-in", "px-8")}>
          <EmptyState
            icon={IconGhostFilled}
            title="No activity in this range"
            description="Try widening the time range, or this agent has no traces yet."
          />
        </div>
      ) : (
        <>
          {/* Stat strip — totals over all spans in the window. */}
          <section
            className={cn(
              "grid grid-cols-2 gap-4 md:grid-cols-4 px-8 mt-1",
              entrance && "page-fade-in",
            )}
          >
            <StatCard
              icon={IconCoinFilled}
              iconClassName="text-amber-400 dark:text-yellow-500"
              size="sm"
              label="Total cost"
              value={stats?.totalCost ?? "—"}
              formatValue={(n) => formatCostFixed(n, 4)}
              hint={`${formatTokens(stats?.totalTokens ?? 0)} tokens`}
            />
            <StatCard
              icon={IconAlertTriangleFilled}
              iconClassName="text-red-500/90 dark:text-red-600/95 mt-px"
              size="sm"
              label="Error rate"
              value={errorRate ?? "—"}
              formatValue={formatPercent}
              hint={`${formatCount(stats?.errorCount ?? 0)} errors`}
            />
            <StatCard
              icon={IconClockFilled}
              iconClassName="text-sky-400 dark:text-sky-500"
              size="sm"
              label="p95 latency"
              value={stats?.latencyMs.p95 ?? 0}
              formatValue={formatDuration}
              hint={`p50 ${formatDuration(stats?.latencyMs.p50 ?? 0)}`}
            />

            <StatCard
              icon={IconBoltFilled}
              iconClassName="text-orange-500 dark:text-orange-500"
              size="sm"
              label="Spans"
              value={stats?.spanCount ?? 0}
              formatValue={formatCount}
              hint={`${formatCount(stats?.llmSpanCount ?? 0)} LLM`}
            />
          </section>

          {/* Trend: span volume + LLM latency percentiles over the window. */}
          <section className="grid gap-4 lg:grid-cols-2 px-8">
            <Card size="sm" className={cn(entrance && "page-fade-in")}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle>Spans & errors</CardTitle>
                <ChartLegend
                  config={volumeConfig}
                  selected={volumeSelected}
                  onSelect={setVolumeSelected}
                />
              </CardHeader>
              <CardContent className="mt-2">
                {!seriesLoading && seriesData.length === 0 ? (
                  <EmptyState
                    icon={IconChartAreaFilled}
                    title="No data in this range"
                  />
                ) : (
                  <AreaChart.EvilAreaChart
                    config={volumeConfig}
                    data={seriesData}
                    isLoading={seriesLoading}
                    isUpdating={chartsStale}
                    xDataKey="bucket"
                    syncId="agent-trends"
                    onZoomSelect={zoom.zoomTo}
                    onZoomReset={zoom.reset}
                    selectedDataKey={volumeSelected}
                    onSelectionChange={setVolumeSelected}
                    className="h-55 w-full"
                    chartProps={{
                      // left: 2 (vs Recharts' default 5) tucks the auto-width
                      // y-axis labels closer to the card content edge.
                      margin: { top: 5, right: 5, bottom: 5, left: 2 },
                    }}
                  >
                    <AreaChart.Grid />
                    <AreaChart.XAxis
                      dataKey="bucket"
                      ticks={seriesTicks}
                      tickFormatter={bucketLabel}
                      interval={0}
                      tick={edgeTick}
                    />
                    <AreaChart.YAxis
                      allowDecimals={false}
                      tickFormatter={(v) => formatCount(Number(v))}
                    />
                    <AreaChart.Tooltip
                      labelFormatter={(v) => formatBucketFull(String(v))}
                    />
                    <AreaChart.Area dataKey="spans" strokeVariant="solid" />
                    <AreaChart.Area
                      dataKey="errors"
                      strokeVariant="solid"
                      variant="lines"
                    />
                  </AreaChart.EvilAreaChart>
                )}
              </CardContent>
            </Card>

            <Card size="sm" className={cn(entrance && "page-fade-in")}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle>Latency</CardTitle>
                <ChartLegend
                  config={latencyConfig}
                  selected={latencySelected}
                  onSelect={setLatencySelected}
                />
              </CardHeader>
              <CardContent className="mt-2">
                {!seriesLoading && seriesData.length === 0 ? (
                  <EmptyState
                    icon={IconChartAreaFilled}
                    title="No data in this range"
                  />
                ) : (
                  <AreaChart.EvilAreaChart
                    config={latencyConfig}
                    data={latencyData}
                    isLoading={seriesLoading}
                    isUpdating={chartsStale}
                    xDataKey="bucket"
                    syncId="agent-trends"
                    onZoomSelect={zoom.zoomTo}
                    onZoomReset={zoom.reset}
                    stackType="stacked"
                    selectedDataKey={latencySelected}
                    onSelectionChange={setLatencySelected}
                    className="h-55 w-full"
                    chartProps={{
                      // left: 2 (vs Recharts' default 5) tucks the auto-width
                      // y-axis labels closer to the card content edge.
                      margin: { top: 5, right: 5, bottom: 5, left: 2 },
                    }}
                  >
                    <AreaChart.Grid />
                    <AreaChart.XAxis
                      dataKey="bucket"
                      ticks={seriesTicks}
                      tickFormatter={bucketLabel}
                      interval={0}
                      tick={edgeTick}
                    />
                    <AreaChart.YAxis
                      tickFormatter={(v) => formatDuration(Number(v))}
                    />
                    <AreaChart.Tooltip
                      labelFormatter={(v) => formatBucketFull(String(v))}
                      valueFormatter={(_v, key, row) =>
                        formatDuration(Number(row[`${key}Abs`] ?? _v))
                      }
                      reverse
                    />
                    {/* Stacked deltas (see latencyData): draw bottom band → top
                        so the stack reads p50, then p95−p50, then p99−p95. */}
                    <AreaChart.Area dataKey="p50" strokeVariant="solid" />
                    <AreaChart.Area dataKey="p95" strokeVariant="solid" />
                    <AreaChart.Area dataKey="p99" strokeVariant="solid" />
                    {latencyThresholds.map((r) => (
                      <AreaChart.Threshold
                        key={r.id}
                        value={Number(r.threshold)}
                        label={`${r.metric.slice("latency_".length)} alert`}
                      />
                    ))}
                  </AreaChart.EvilAreaChart>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Where this agent's spend and time go: cost per price dimension
              over the window, beside the per-tool runtime breakdown. */}
          <section className="grid gap-4 lg:grid-cols-2 px-8">
            <CostBreakdownCard
              agentName={agentName}
              syncId="agent-trends"
              className={cn(entrance && "page-fade-in")}
            />
            <ToolBreakdownCard
              agentName={agentName}
              className={cn(entrance && "page-fade-in")}
            />
          </section>

          {/* Traces table — click a row to open its steps + exchange. */}
          <div className="flex flex-col gap-3 mt-4">
            {!traces.isLoading && traceRows.length === 0 ? (
              <div
                className={cn(
                  entrance && !tracesSkeletonShown && "page-fade-in",
                  "px-8",
                )}
              >
                <EmptyState
                  icon={IconGhostFilled}
                  title="No traces in this range"
                  description="Try widening the time range."
                />
              </div>
            ) : (
              // Table mounted while loading (skeleton rows in the body) so the
              // swap to data doesn't reflow; footer flush with the last row.
              <div
                className={cn(
                  "flex flex-col",
                  entrance && !tracesSkeletonShown && "page-fade-in",
                )}
              >
                {/* pr-11 (not the default pr-9): the range picker lives in the
                    page header here (px-8) rather than a toolbar (pr-6), so
                    the last column needs 8px more to line up with its chevron
                    the way the list pages do. */}
                <Table
                  className="table-fixed [&_th:last-child]:pr-11 [&_td:last-child]:pr-11"
                  stickyHeader
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trace</TableHead>
                      <TableHead className="w-44">Workflow</TableHead>
                      <SortableHead
                        sortKey="spans"
                        sort={sort}
                        onSort={toggle}
                        align="right"
                        className="w-20"
                      >
                        Spans
                      </SortableHead>
                      <SortableHead
                        sortKey="duration"
                        sort={sort}
                        onSort={toggle}
                        align="right"
                        className="w-28"
                      >
                        Duration
                      </SortableHead>
                      <SortableHead
                        sortKey="cost"
                        sort={sort}
                        onSort={toggle}
                        align="right"
                        className="w-28"
                      >
                        Cost
                      </SortableHead>
                      <SortableHead
                        sortKey="when"
                        sort={sort}
                        onSort={toggle}
                        align="right"
                        className="w-32"
                      >
                        When
                      </SortableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {traces.isLoading ? (
                      showTracesSkeleton ? (
                        <TableRowsSkeleton cols={SKELETON_COLS} />
                      ) : null
                    ) : (
                      traceRows.map((t) => {
                        const isOpen = expanded === t.traceId;
                        const isFocused = t.traceId === deepLinked;
                        return (
                          <Fragment key={t.traceId}>
                            <TableRow
                              ref={isFocused ? focusRef : undefined}
                              interactive
                              aria-expanded={isOpen}
                              onClick={() => toggleTrace(t.traceId)}
                              className={cn(
                                "group",
                                isOpen && OPEN_ROW_CLASS,
                                isFocused && FOCUSED_ROW_CLASS,
                              )}
                            >
                              {/* Content-first, like the traces list: the
                                  trace's user message, then its name, then
                                  the id. */}
                              <TableCell className="h-12 font-normal">
                                <div className="flex items-center gap-2">
                                  <ExpandChevron open={isOpen} />
                                  <span className="truncate">
                                    {t.userMessage ?? t.traceName ?? (
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {t.traceId}
                                      </span>
                                    )}
                                  </span>
                                  {/* Compact error count — colored text, no pill. */}
                                  {t.errorCount > 0 && (
                                    <span
                                      title={`${t.errorCount} ${t.errorCount === 1 ? "error" : "errors"}`}
                                      className="flex shrink-0 items-center gap-0.75 font-sans text-sm text-red-600 dark:text-red-400"
                                    >
                                      <IconAlertTriangle className="size-3.5 fill-current/20" />
                                      {t.errorCount}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-0">
                                {t.workflowName ? (
                                  <Link
                                    href={`/workflows/${encodeURIComponent(
                                      t.workflowName,
                                    )}`}
                                    onClick={(e) => e.stopPropagation()}
                                    title="View workflow"
                                    className="block truncate text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    {t.workflowName}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground/40">
                                    —
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCount(t.spanCount)}
                              </TableCell>
                              <HeatCell
                                value={t.durationMs}
                                thresholds={durationQuantiles}
                                metric="duration"
                              >
                                {formatSpanDuration(t.durationMs)}
                              </HeatCell>
                              <HeatCell
                                value={t.totalCost}
                                thresholds={costQuantiles}
                                metric="cost"
                                bold
                              >
                                {formatCost(t.totalCost)}
                              </HeatCell>
                              <TableCell className="text-right text-muted-foreground">
                                <RelativeTime value={t.startTime} />
                              </TableCell>
                            </TableRow>
                            {isOpen && (
                              <TraceDrawer
                                trace={t}
                                projectId={projectId}
                                colSpan={6}
                              />
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>

                {!traces.isLoading && (
                  <PaginationFooter
                    page={page}
                    pageSize={pageSize}
                    total={totalTraces}
                    shown={traceRows.length}
                    noun={["trace", "traces"]}
                    isFetching={traces.isFetching}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(0);
                    }}
                    pageSizes={PAGE_SIZES}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** Expanded row: the trace's overview on the left (timing, size, cost and
 * where it belongs), its step flow and the run's exchange on the right — the
 * same drawer the eval page opens under a scored run. Lazy-fetches the trace. */
function TraceDrawer({
  trace,
  projectId,
  colSpan,
}: {
  trace: TraceRow;
  projectId: string;
  colSpan: number;
}) {
  const router = useRouter();
  const detail = useQuery(
    trpc.traces.get.queryOptions({ projectId, traceId: trace.traceId }),
  );
  const spans = detail.data?.spans ?? [];
  // The whole-run input/output lives on the root span (fall back to the first).
  const root = spans.find((s) => !s.parentSpanId) ?? spans[0];
  const nodes: FlowNode[] = spans.map((s) => ({
    id: s.spanId,
    icon: stepIcon(s.spanType, s.modelId, s.name),
    label: s.name,
    sublabel: s.modelId,
    status:
      s.status === "error"
        ? "error"
        : s.status === "aborted"
          ? "aborted"
          : "ok",
    timestamp: s.startTime,
    durationMs: s.durationMs,
  }));
  const traceHref = `/traces/${encodeURIComponent(trace.traceId)}`;

  return (
    <DrawerRow colSpan={colSpan} className="pt-6">
      <DrawerColumns
        overview={
          <>
            {trace.errorCount > 0 && (
              <div className="flex h-5 items-center">
                <Badge variant="rose" className="font-sans">
                  <IconAlertTriangle />
                  {formatCount(trace.errorCount)}
                  {trace.errorCount === 1 ? " error" : " errors"}
                </Badge>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Meta label="Started" value={formatDateTime(trace.startTime)} />
              <Meta
                label="Duration"
                value={formatSpanDuration(trace.durationMs)}
              />
              <Meta label="Spans" value={formatCount(trace.spanCount)} />
              <Meta label="Tokens" value={formatTokens(trace.totalTokens)} />
              <Meta
                label="Cost"
                value={
                  trace.totalCost == null ? (
                    <MetaEmpty />
                  ) : (
                    formatCost(trace.totalCost, 4)
                  )
                }
              />
              <Meta
                label="Customer"
                value={
                  <CustomerValue
                    customerId={trace.customerId}
                    customerName={trace.customerName}
                    imageUrl={trace.customerImageUrl}
                  />
                }
              />
              <Meta
                label={trace.models.length === 1 ? "Model" : "Models"}
                className="col-span-2"
                value={<ModelsValue models={trace.models} />}
              />
              {trace.workflowName && (
                <Meta
                  label="Workflow"
                  className="col-span-2"
                  value={
                    <Link
                      href={`/workflows/${encodeURIComponent(trace.workflowName)}`}
                      className="flex min-w-0 items-center gap-1.5 group"
                    >
                      <IconSitemapFilled className="size-3.5 shrink-0 text-emerald-500 mt-px" />
                      <span className="truncate">{trace.workflowName}</span>
                      <IconArrowUpRight className="size-3.5 shrink-0 text-muted-foreground  transition-colors mt-0.75 group-hover:text-foreground" />
                    </Link>
                  }
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2.5 mt-3">
              <Button
                size="sm"
                variant="secondary"
                className={cn("w-fit", DRAWER_BUTTON_CLASS)}
                // biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
                render={<Link href={traceHref as any} />}
              >
                <IconAffiliateFilled className="text-[#8b5e34] dark:text-[#c9a888]" />
                See trace
                <IconArrowUpRight className="mt-px" />
              </Button>
              {trace.sessionId && <SessionButton sessionId={trace.sessionId} />}
            </div>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <DrawerSection label="Steps">
            {detail.isLoading ? (
              <NodeFlowSkeleton count={Math.min(trace.spanCount, 6)} />
            ) : nodes.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                No steps in this trace.
              </span>
            ) : (
              <NodeFlow
                nodes={nodes}
                onNodeClick={(spanId) =>
                  router.push(
                    `/traces/${encodeURIComponent(trace.traceId)}?span=${encodeURIComponent(spanId)}`,
                  )
                }
              />
            )}
          </DrawerSection>
          {root?.systemPrompt && (
            <DrawerSection label="System prompt">
              <ClampedBody maxHeight={200} buttonClassName={DRAWER_BUTTON_CLASS}>
                <Prose>{root.systemPrompt}</Prose>
              </ClampedBody>
            </DrawerSection>
          )}
          <DrawerSection label="Exchange">
            {detail.isLoading ? (
              <ConversationSkeleton />
            ) : !root ? (
              <span className="text-xs text-muted-foreground">
                Trace payload unavailable.
              </span>
            ) : (
              <Conversation
                input={root.input}
                output={root.output}
                emptyHint={emptyOutputHint(spans)}
                clamp={320}
              />
            )}
          </DrawerSection>
        </div>
      </DrawerColumns>
    </DrawerRow>
  );
}

function DrawerSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
