"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import { Skeleton } from "@foglamp/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
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
  IconSitemapFilled,
  IconAffiliateFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { DRAWER_BUTTON_CLASS } from "@/components/app/button-styles";
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
  DrawerColumns,
  CustomerValue,
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
import {
  formatCost,
  formatCostFixed,
  formatCount,
  formatDateTime,
  formatDuration,
  formatSpanDuration,
  formatPercent,
  formatTokens,
  parseDateTime,
} from "@/lib/format";
import { customRange } from "@/lib/range";
import { cn } from "@/lib/utils";
import { type RouterOutputs, trpc } from "@/utils/trpc";

type RunRow = RouterOutputs["workflowRuns"]["list"][number];

import { UNGROUPED } from "../workflows-client";

const PAGE_SIZES = [25, 50, 100];

// Skeleton column spec for the loading body rows (see TableRowsSkeleton).
const SKELETON_COLS = [
  { icon: true, w: "w-64" },
  { align: "right", w: "w-8" },
  { align: "right", w: "w-12" },
  { align: "right", w: "w-14" },
  { align: "right", w: "w-16" },
] as const;

type RunSortKey = "when" | "duration" | "traces" | "errors" | "cost";

const volumeConfig = {
  runs: { label: "Runs", colors: themed("var(--chart-2)") },
  errors: { label: "Errored", colors: themed("var(--destructive)") },
} satisfies ChartConfig;

const latencyConfig = {
  // neutral-800 on light, neutral-200 on dark — matches the Overview latency chart
  p50: { label: "p50", colors: { light: ["#262626"], dark: ["#e5e5e5"] } },
  p95: { label: "p95", colors: themed("#0090FD") },
  p99: { label: "p99", colors: themed("#FF5513") },
} satisfies ChartConfig;

export function WorkflowDetailClient({ nameParam }: { nameParam: string }) {
  const entrance = useEntranceOnce();
  const { projectId } = useProject();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Shared time window drives the stats, trend charts, and runs table.
  const { range, setRange } = useRange();
  const zoom = useZoomRange();
  // A `?run=` deep link focuses one run: its row opens and is tinted.
  const focusRun = searchParams.get("run");
  // Which run row is expanded (agent flow + exchange drawer). Mirrors `?run=`
  // so an open drawer is deep-linkable.
  const [expanded, setExpanded] = useState<string | null>(focusRun);
  // The row the page was *opened on* (deep link) gets the focused tint and a
  // scroll-into-view; rows the user expands themselves are plain card, like
  // the evals table. Cleared on the first toggle so the tint doesn't follow
  // the `?run=` mirror around.
  const [deepLinked, setDeepLinked] = useState<string | null>(focusRun);
  const focusRef = useRef<HTMLTableRowElement>(null);
  // The deep-linked run, fetched on its own (no window, no paging) so the link
  // always lands on it: it pins above the table whenever the window or the
  // current page doesn't hold it. Captured once so it stays put while the
  // drawer's `?run=` mirror moves to other rows.
  const [pinnedId] = useState(focusRun);
  const pinned = useQuery({
    ...trpc.workflowRuns.list.queryOptions({
      projectId: projectId!,
      workflowRunId: pinnedId ?? "",
      limit: 1,
    }),
    enabled: !!projectId && !!pinnedId,
  });
  const pinnedRow = pinned.data?.[0] ?? null;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  // Selected series for each trend chart, driven by the header legends.
  const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
  const [latencySelected, setLatencySelected] = useState<string | null>(null);
  const { sort, toggle } = useTableSort<RunSortKey>();

  const ungrouped = nameParam === UNGROUPED;
  const workflowName = ungrouped ? "" : nameParam;
  const label = ungrouped ? "Ungrouped" : nameParam;

  // Stats + charts always reflect *all* runs in the window (no errors-only), so
  // the error-rate stat stays meaningful when the table is filtered down.
  const summary = useQuery({
    ...trpc.workflowRuns.summary.queryOptions({
      projectId: projectId!,
      workflowName,
      from: range.from,
      to: range.to,
    }),
    enabled: !!projectId,
    placeholderData: (prev) => prev,
  });

  const series = useQuery({
    ...trpc.workflowRuns.timeseries.queryOptions({
      projectId: projectId!,
      workflowName,
      from: range.from,
      to: range.to,
    }),
    enabled: !!projectId,
    placeholderData: (prev) => prev,
  });

  const runs = useQuery({
    ...trpc.workflowRuns.list.queryOptions({
      projectId: projectId!,
      workflowName,
      from: range.from,
      to: range.to,
      sort: sort ? { field: sort.key, dir: sort.dir } : undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
    enabled: !!projectId,
    // Keep the current page visible while the next one loads.
    placeholderData: (prev) => prev,
  });

  // Widen the window to the pinned run, once, so the stats and charts agree
  // with the row the link asked for instead of reporting an empty range. The
  // filter reset below must not close the deep-linked drawer when this fires.
  const widened = useRef(false);
  const skipReset = useRef(false);
  useEffect(() => {
    if (!pinnedRow || widened.current) return;
    widened.current = true;
    const start = parseDateTime(pinnedRow.startTime);
    const end = parseDateTime(pinnedRow.endTime);
    if (start >= range.from && end <= range.to) return;
    skipReset.current = true;
    setRange(
      customRange(
        new Date(Math.min(start.getTime(), range.from.getTime())),
        new Date(Math.max(end.getTime(), range.to.getTime())),
      ),
    );
  }, [pinnedRow, range, setRange]);

  // Reset paging + any open drawer when the query that defines the result set
  // changes (skipping mount, so a deep-linked drawer survives the first render).
  const mounted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on filter changes only
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (skipReset.current) {
      skipReset.current = false;
      return;
    }
    setPage(0);
    setExpanded(null);
  }, [range, projectId, sort]);

  const runRows = runs.data ?? [];
  // The pinned run renders above the page only while the page itself doesn't
  // hold it — once the widened window (or a page flip) brings it into the
  // list, it takes its natural place.
  const showPinned =
    !!pinnedRow &&
    !runRows.some((r) => r.workflowRunId === pinnedRow.workflowRunId);

  // Toggle a row's drawer and mirror it in the URL (`?run=`), so the open run
  // can be shared and survives a reload.
  const toggleRun = (id: string) => {
    const next = expanded === id ? null : id;
    setExpanded(next);
    setDeepLinked(null);
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    if (next) sp.set("run", next);
    else sp.delete("run");
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };
  // Once the deep-linked run is on the loaded page, scroll it into view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run as runs load
  useEffect(() => {
    if (deepLinked && focusRef.current) {
      focusRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [deepLinked, runs.data]);
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showRunsSkeleton = useDelayedLoading(runs.isLoading);
  // Latch for the entrance fade: the runs table only fades in if this slot
  // never painted a skeleton first (see useSkeletonShown).
  const runsSkeletonShown = useSkeletonShown(showRunsSkeleton);

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
  // the ticks and edge-anchor the first/last labels. Zero-filled so quiet
  // stretches keep their width on the x-axis.
  const seriesData = useMemo(
    () =>
      fillBuckets(
        (chartView.series ?? []).map((r) => ({
          bucket: r.bucket,
          runs: r.runCount,
          errors: r.erroredRunCount,
          p50: r.durationMs.p50,
          p95: r.durationMs.p95,
          p99: r.durationMs.p99,
        })),
        chartView.from,
        chartView.to,
        (bucket) => ({ bucket, runs: 0, errors: 0, p50: 0, p95: 0, p99: 0 }),
      ),
    [chartView],
  );
  // Latency as a stacked *band* chart: each area plots the delta to the band
  // below it (p50, p95−p50, p99−p95), so its gradient fill is bounded between
  // two percentile lines instead of bleeding down to the axis. The stack tops
  // land exactly on p50/p95/p99; the absolutes ride along for the tooltip.
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

  const back = navItem("/workflows");

  if (!projectId) {
    return (
      <>
        <PageHeader title={label} back={back} />
        <NoProject />
      </>
    );
  }

  const stats = summary.data;
  // Global 20/40/60/80th-percentile thresholds for the heat-tinted cells,
  // computed server-side over the whole filtered window (not just this page).
  const costQuantiles = stats?.costQuantiles ?? [];
  const durationQuantiles = stats?.durationQuantiles ?? [];
  const totalRuns = stats?.runCount ?? 0;
  // No runs at all in this window (not just filtered away). Wait for the
  // summary so a slow rollup doesn't flash the empty state before stats land.
  // A pinned deep-link run counts as a run, even before the window widens to
  // include it.
  const noRuns =
    !runs.isLoading &&
    !summary.isLoading &&
    (stats?.runCount ?? 0) === 0 &&
    !pinnedRow &&
    !(pinnedId && pinned.isLoading);
  const seriesLoading = series.isLoading;

  // One run row plus, when open, its drawer — shared by the paged rows and
  // the pinned deep-link run.
  const renderRun = (r: RunRow) => {
    const isOpen = expanded === r.workflowRunId;
    const isFocused = r.workflowRunId === deepLinked;
    return (
      <Fragment key={r.workflowRunId}>
        <TableRow
          ref={isFocused ? focusRef : undefined}
          interactive
          aria-expanded={isOpen}
          onClick={() => toggleRun(r.workflowRunId)}
          className={cn(
            "group",
            isOpen && OPEN_ROW_CLASS,
            isFocused && FOCUSED_ROW_CLASS,
          )}
        >
          {/* Content-first: the run's opening user message
              (from its first trace), falling back to the
              id; the agents involved trail on the right. */}
          <TableCell className="h-12 font-normal">
            <div className="flex items-center gap-2">
              <ExpandChevron open={isOpen} />
              <span className="truncate">
                {r.userMessage ?? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.workflowRunId}
                  </span>
                )}
              </span>
              {/* Compact error count — colored text, no pill. */}
              {r.errorCount > 0 && (
                <span
                  title={`${r.errorCount} ${r.errorCount === 1 ? "error" : "errors"}`}
                  className="flex shrink-0 items-center gap-0.75 font-sans text-sm text-red-600 dark:text-red-400"
                >
                  <IconAlertTriangle className="size-3.5 fill-current/20" />
                  {r.errorCount}
                </span>
              )}
              <AgentStack names={r.agentNames} />
            </div>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {formatCount(r.traceCount)}
          </TableCell>
          <HeatCell
            value={r.durationMs}
            thresholds={durationQuantiles}
            metric="duration"
          >
            {formatSpanDuration(r.durationMs)}
          </HeatCell>
          <HeatCell
            value={r.totalCost}
            thresholds={costQuantiles}
            metric="cost"
            bold
          >
            {formatCost(r.totalCost)}
          </HeatCell>
          <TableCell className="text-right text-muted-foreground">
            <RelativeTime value={r.startTime} />
          </TableCell>
        </TableRow>
        {isOpen && (
          <RunDrawer
            run={r}
            projectId={projectId}
            colSpan={5}
          />
        )}
      </Fragment>
    );
  };

  return (
    <>
      <div className={cn(entrance && "page-fade-in")}>
        <PageHeader
          title={label}
          back={back}
          actions={<RangeControl value={range} onChange={setRange} />}
        />
      </div>

      {noRuns ? (
        <div className={cn(entrance && "page-fade-in", "px-8")}>
          <EmptyState
            icon={IconSitemapFilled}
            title="No runs in this range"
            description="Try widening the time range, or this workflow has no runs yet."
          />
        </div>
      ) : (
        <>
          {/* Stat strip — totals over all runs in the window. */}
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
              value={stats?.errorRate ?? "—"}
              formatValue={formatPercent}
              hint={`${formatCount(stats?.erroredRunCount ?? 0)} errored`}
            />
            <StatCard
              icon={IconClockFilled}
              iconClassName="text-sky-400 dark:text-sky-500"
              size="sm"
              label="p95 duration"
              value={stats?.durationMs.p95 ?? 0}
              formatValue={formatDuration}
              hint={`p50 ${formatDuration(stats?.durationMs.p50 ?? 0)}`}
            />
            <StatCard
              icon={IconBoltFilled}
              iconClassName="text-orange-500 dark:text-orange-500"
              size="sm"
              label="Runs"
              value={stats?.runCount ?? 0}
              formatValue={formatCount}
              hint={`${formatCount(stats?.traceCount ?? 0)} traces`}
            />
          </section>

          {/* Trend: run volume + run-duration percentiles over the window. */}
          <section className="grid gap-4 lg:grid-cols-2 px-8">
            <Card size="sm" className={cn(entrance && "page-fade-in")}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle>Runs & errors</CardTitle>
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
                    syncId="workflow-trends"
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
                    <AreaChart.Area dataKey="runs" strokeVariant="solid" />
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
                <CardTitle>Run duration</CardTitle>
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
                    syncId="workflow-trends"
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
                  </AreaChart.EvilAreaChart>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Runs table — click a row to open its agent flow + exchange. */}
          <div className="flex flex-col gap-3 mt-4">
            {!runs.isLoading && runRows.length === 0 && !showPinned ? (
              <div
                className={cn(
                  entrance && !runsSkeletonShown && "page-fade-in",
                  "px-8",
                )}
              >
                <EmptyState
                  icon={IconSitemapFilled}
                  title="No runs in this range"
                  description="Try widening the time range."
                />
              </div>
            ) : (
              // Table mounted while loading (skeleton rows in the body) so the
              // swap to data doesn't reflow; footer flush with the last row.
              <div
                className={cn(
                  "flex flex-col",
                  entrance && !runsSkeletonShown && "page-fade-in",
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
                      <TableHead>Run</TableHead>
                      <SortableHead
                        sortKey="traces"
                        sort={sort}
                        onSort={toggle}
                        align="right"
                        className="w-24"
                      >
                        Traces
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
                    {runs.isLoading ? (
                      showRunsSkeleton ? (
                        <TableRowsSkeleton cols={SKELETON_COLS} />
                      ) : null
                    ) : (
<>
                        {showPinned && pinnedRow && renderRun(pinnedRow)}
                        {runRows.map(renderRun)}
                      </>
                    )}
                  </TableBody>
                </Table>

                {!runs.isLoading && (
                  <PaginationFooter
                    page={page}
                    pageSize={pageSize}
                    total={totalRuns}
                    shown={runRows.length}
                    noun={["run", "runs"]}
                    isFetching={runs.isFetching}
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

/** The agents a run touched, in first-run order: a tight stack of their
 * tinted ghosts (up to four, then "+n"), each named on hover. Sits at the end
 * of the Run cell so the message text truncates before the agents do. */
function AgentStack({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, 4);
  const rest = names.length - shown.length;
  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-1 pl-2"
      title={names.join(" → ")}
    >
      {shown.map((n) => (
        <AgentIcon key={n} name={n} className="size-3.5" />
      ))}
      {rest > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          +{rest}
        </span>
      )}
    </span>
  );
}

/** Expanded row: the run's overview on the left (timing, size, cost), its
 * agent hand-offs as a flow and the whole run's exchange — the first trace's
 * opening message to the last trace's answer — on the right. Lazy-fetches the
 * run's traces and the two traces that bracket it. */
function RunDrawer({
  run,
  projectId,
  colSpan,
}: {
  run: RunRow;
  projectId: string;
  colSpan: number;
}) {
  const router = useRouter();
  const detail = useQuery(
    trpc.workflowRuns.get.queryOptions({
      projectId,
      workflowRunId: run.workflowRunId,
    }),
  );
  const traces = detail.data?.traces ?? [];
  // The run's traces come start-ordered; prefer the ids the list already
  // resolved so the exchange can load alongside the flow.
  const firstId = run.firstTraceId ?? traces[0]?.traceId ?? null;
  const lastId = run.lastTraceId ?? traces[traces.length - 1]?.traceId ?? null;
  const first = useQuery({
    ...trpc.traces.get.queryOptions({ projectId, traceId: firstId ?? "" }),
    enabled: !!firstId,
  });
  const last = useQuery({
    ...trpc.traces.get.queryOptions({ projectId, traceId: lastId ?? "" }),
    enabled: !!lastId && lastId !== firstId,
  });
  type Span = NonNullable<typeof first.data>["spans"][number];
  const rootOf = (spans: Span[] | undefined) =>
    spans?.find((s) => !s.parentSpanId) ?? spans?.[0];
  const firstRoot = rootOf(first.data?.spans);
  const lastRoot = lastId === firstId ? firstRoot : rootOf(last.data?.spans);
  const exchangeLoading =
    first.isLoading || (lastId !== firstId && last.isLoading);

  // Run-level context from its traces: the first trace's customer/session
  // (a run belongs to one conversation), and every model any trace used, in
  // first-use order.
  const customer = traces.find((t) => t.customerId) ?? null;
  const sessionId = traces.find((t) => t.sessionId)?.sessionId ?? null;
  const models = [...new Set(traces.flatMap((t) => t.models))];

  const nodes: FlowNode[] = traces.map((t) => ({
    id: t.traceId,
    icon: <AgentIcon name={t.agentName} className="size-3.25" />,
    label: t.agentName ?? t.traceName ?? "trace",
    sublabel: t.agentName && t.traceName !== t.agentName ? t.traceName : null,
    status: t.errorCount > 0 ? "error" : t.abortedCount > 0 ? "aborted" : "ok",
    timestamp: t.startTime,
    durationMs: t.durationMs,
  }));

  return (
    <DrawerRow colSpan={colSpan} className="pt-6">
      <DrawerColumns
        overview={
          <>
            {run.errorCount > 0 && (
              <div className="flex h-5 items-center">
                <Badge variant="rose" className="font-sans">
                  <IconAlertTriangle />
                  {formatCount(run.errorCount)}
                  {run.errorCount === 1 ? " error" : " errors"}
                </Badge>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Meta label="Started" value={formatDateTime(run.startTime)} />
              <Meta
                label="Duration"
                value={formatSpanDuration(run.durationMs)}
              />
              <Meta label="Traces" value={formatCount(run.traceCount)} />
              <Meta label="Tokens" value={formatTokens(run.totalTokens)} />
              <Meta
                label="Cost"
                value={
                  run.totalCost == null ? (
                    <MetaEmpty />
                  ) : (
                    formatCost(run.totalCost, 4)
                  )
                }
              />
              <Meta
                label="Customer"
                value={
                  detail.isLoading ? (
                    <Skeleton className="h-3.5 w-20" />
                  ) : (
                    <CustomerValue
                      customerId={customer?.customerId ?? null}
                      customerName={customer?.customerName}
                      imageUrl={customer?.customerImageUrl}
                    />
                  )
                }
              />

              <Meta
                label={models.length === 1 ? "Model" : "Models"}
                className="col-span-2"
                value={
                  detail.isLoading ? (
                    <Skeleton className="h-3.5 w-24" />
                  ) : (
                    <ModelsValue models={models} />
                  )
                }
              />
            </div>
            <div className="flex flex-wrap gap-2.5 mt-3">
              {firstId && (
                <Button
                  size="sm"
                  variant="secondary"
                  className={cn("w-fit", DRAWER_BUTTON_CLASS)}
                  render={
                    // biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
                    <Link
                      href={`/traces/${encodeURIComponent(firstId)}` as any}
                    />
                  }
                >
                  <IconAffiliateFilled className="text-[#8b5e34] dark:text-[#c9a888]" />
                  See first trace
                  <IconArrowUpRight className="mt-px" />
                </Button>
              )}
              {sessionId && <SessionButton sessionId={sessionId} />}
            </div>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <DrawerSection label="Agents">
            {detail.isLoading ? (
              <NodeFlowSkeleton count={Math.min(run.traceCount, 6)} />
            ) : nodes.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                No traces in this run.
              </span>
            ) : (
              <NodeFlow
                nodes={nodes}
                onNodeClick={(id) =>
                  router.push(`/traces/${encodeURIComponent(id)}`)
                }
              />
            )}
          </DrawerSection>
          <DrawerSection label="Exchange">
            {exchangeLoading ? (
              <ConversationSkeleton />
            ) : !firstRoot ? (
              <span className="text-xs text-muted-foreground">
                Trace payload unavailable.
              </span>
            ) : (
              <Conversation
                input={firstRoot.input}
                output={lastRoot?.output ?? null}
                emptyHint={emptyOutputHint(
                  (lastId === firstId ? first.data?.spans : last.data?.spans) ??
                    [],
                )}
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
