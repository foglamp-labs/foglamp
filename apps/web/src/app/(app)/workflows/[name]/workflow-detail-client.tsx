"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Skeleton } from "@foglamp/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
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
  IconBoltFilled,
  IconChartAreaFilled,
  IconClockFilled,
  IconCoinFilled,
  IconGhost,
  IconSitemapFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
  ChartLegend,
  formatBucketFull,
  makeBucketLabel,
  makeEdgeTick,
  themed,
  thinTicks,
} from "@/components/app/trend-charts";
import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatSpanDuration,
  formatPercent,
  formatTokens,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

import { UNGROUPED } from "../workflows-client";

const PAGE_SIZES = [25, 50, 100];

// Skeleton column spec for the loading body rows (see TableRowsSkeleton).
const SKELETON_COLS = [
  { w: "w-48" },
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
  // Selected run mirrors the `?run=` query param so the flow is deep-linkable.
  const [selected, setSelected] = useState<string | null>(() =>
    searchParams.get("run")
  );
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

  // Reset paging when the query that defines the result set changes.
  useEffect(() => setPage(0), [range, projectId, sort]);

  const runRows = runs.data ?? [];
  // Default the flow to the most recent run on the page (list is newest-first).
  const activeRunId = selected ?? runRows[0]?.workflowRunId ?? null;

  const selectRun = (id: string) => {
    setSelected(id);
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    sp.set("run", id);
    router.replace(`?${sp.toString()}`, { scroll: false });
  };

  const runDetail = useQuery({
    ...trpc.workflowRuns.get.queryOptions({
      projectId: projectId!,
      workflowRunId: activeRunId!,
    }),
    enabled: !!projectId && !!activeRunId,
  });
  // Skeleton whenever the selected run's flow isn't loaded yet — on first
  // load and on every row switch (no placeholderData, so a different run's
  // flow never lingers under the new selection).
  const flowLoading = !activeRunId || runDetail.isPending;

  // The selected run's row (for the flow header chips + skeleton sizing).
  const activeRun = runRows.find((r) => r.workflowRunId === activeRunId);
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showRunsSkeleton = useDelayedLoading(runs.isLoading);
  // Latch for the entrance fade: the runs table only fades in if this slot
  // never painted a skeleton first (see useSkeletonShown).
  const runsSkeletonShown = useSkeletonShown(showRunsSkeleton);

  const windowMs = range.to.getTime() - range.from.getTime();
  const bucketLabel = useMemo(() => makeBucketLabel(windowMs), [windowMs]);
  const edgeTick = useMemo(() => makeEdgeTick(bucketLabel), [bucketLabel]);
  // Keep the raw bucket as the x value (formatted on the axis) so we can thin
  // the ticks and edge-anchor the first/last labels.
  const seriesData = useMemo(
    () =>
      (series.data ?? []).map((r) => ({
        bucket: r.bucket,
        runs: r.runCount,
        errors: r.erroredRunCount,
        p50: r.durationMs.p50,
        p95: r.durationMs.p95,
        p99: r.durationMs.p99,
      })),
    [series.data]
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
    [seriesData]
  );
  const seriesTicks = useMemo(
    () =>
      thinTicks(
        seriesData.map((d) => d.bucket),
        bucketLabel
      ),
    [seriesData, bucketLabel]
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

  const nodes: FlowNode[] = (runDetail.data?.traces ?? []).map((t) => ({
    id: t.traceId,
    icon: <IconGhost className="size-5" />,
    label: t.traceName ?? t.agentName ?? "trace",
    status: t.errorCount > 0 ? "error" : "ok",
    timestamp: t.startTime,
    durationMs: t.durationMs,
  }));

  const stats = summary.data;
  // Global 20/40/60/80th-percentile thresholds for the heat-tinted cells,
  // computed server-side over the whole filtered window (not just this page).
  const costQuantiles = stats?.costQuantiles ?? [];
  const durationQuantiles = stats?.durationQuantiles ?? [];
  const totalRuns = stats?.runCount ?? 0;
  // No runs at all in this window (not just filtered away). Wait for the
  // summary so a slow rollup doesn't flash the empty state before stats land.
  const noRuns =
    !runs.isLoading && !summary.isLoading && (stats?.runCount ?? 0) === 0;
  const seriesLoading = series.isLoading;

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
              "grid grid-cols-2 gap-4 md:grid-cols-4 px-8",
              entrance && "page-fade-in"
            )}
          >
            <StatCard
              icon={IconBoltFilled}
              iconClassName="text-orange-500 dark:text-orange-500"
              size="sm"
              label="Runs"
              value={stats?.runCount ?? 0}
              formatValue={formatCount}
              hint={`${formatCount(stats?.traceCount ?? 0)} traces`}
            />
            <StatCard
              icon={IconAlertTriangleFilled}
              iconClassName="text-red-500 dark:text-red-600"
              size="sm"
              label="Error rate"
              value={stats?.errorRate ?? "—"}
              formatValue={formatPercent}
              hint={`${formatCount(stats?.erroredRunCount ?? 0)} errored`}
            />
            <StatCard
              icon={IconClockFilled}
              iconClassName="text-sky-500 dark:text-sky-500"
              size="sm"
              label="p95 duration"
              value={stats?.durationMs.p95 ?? 0}
              formatValue={formatDuration}
              hint={`p50 ${formatDuration(stats?.durationMs.p50 ?? 0)}`}
            />
            <StatCard
              icon={IconCoinFilled}
              iconClassName="text-yellow-400 dark:text-yellow-500"
              size="sm"
              label="Total cost"
              value={stats?.totalCost ?? "—"}
              formatValue={(n) => formatCost(n, 4)}
              hint={`${formatTokens(stats?.totalTokens ?? 0)} tokens`}
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
                    xDataKey="bucket"
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
                    xDataKey="bucket"
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

          {/* Step flow for the selected run. Mounted while the runs list
              loads too (skeleton body), since the selection defaults to the
              first row — otherwise the card pops in below the stats. */}
          {(activeRunId || runs.isLoading) && (
            <div className="px-8">
              <Card
                size="sm"
                className={cn("pb-4", entrance && "page-fade-in")}
              >
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    Run flow
                  </CardTitle>
                  {activeRun ? (
                    <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                      <span>{formatCount(activeRun.traceCount)} traces</span>
                      <span>·</span>
                      <span>{formatSpanDuration(activeRun.durationMs)}</span>
                      <span>·</span>
                      <span>{formatCost(activeRun.totalCost)}</span>
                      <span>·</span>
                      <span>{formatTokens(activeRun.totalTokens)} tokens</span>
                      {activeRun.errorCount > 0 && (
                        <Badge variant="rose" className="font-sans">
                          <IconAlertTriangle />
                          {formatCount(activeRun.errorCount)}
                          {activeRun.errorCount === 1 ? "error" : "errors"}
                        </Badge>
                      )}
                    </CardDescription>
                  ) : (
                    <CardDescription className="flex h-5 items-center">
                      <Skeleton className="h-3.5 w-56" />
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="px-4 mt-3">
                  {flowLoading ? (
                    <NodeFlowSkeleton count={activeRun?.traceCount} />
                  ) : nodes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No traces in this run.
                    </p>
                  ) : (
                    <NodeFlow
                      nodes={nodes}
                      onNodeClick={(id) =>
                        router.push(`/traces/${encodeURIComponent(id)}`)
                      }
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Runs table — click a row to drive the flow above. */}
          <div className="flex flex-col gap-3 mt-4">
            {!runs.isLoading && runRows.length === 0 ? (
              <div
                className={cn(
                  entrance && !runsSkeletonShown && "page-fade-in",
                  "px-8"
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
                  entrance && !runsSkeletonShown && "page-fade-in"
                )}
              >
                <Table stickyHeader>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <SortableHead
                        sortKey="traces"
                        sort={sort}
                        onSort={toggle}
                        align="right"
                        className="w-28"
                      >
                        Traces
                      </SortableHead>
                      <SortableHead
                        sortKey="duration"
                        sort={sort}
                        onSort={toggle}
                        align="right"
                        className="w-32"
                      >
                        Duration
                      </SortableHead>
                      <SortableHead
                        sortKey="cost"
                        sort={sort}
                        onSort={toggle}
                        align="right"
                        className="w-32"
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
                      runRows.map((r) => (
                        <TableRow
                          key={r.workflowRunId}
                          interactive
                          className={cn(
                            r.workflowRunId === activeRunId &&
                              "bg-accent/60 dark:bg-accent/30"
                          )}
                          onClick={() => selectRun(r.workflowRunId)}
                        >
                          <TableCell className="h-12 max-w-96 font-medium">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-mono text-xs text-muted-foreground">
                                {r.workflowRunId}
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
                      ))
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
