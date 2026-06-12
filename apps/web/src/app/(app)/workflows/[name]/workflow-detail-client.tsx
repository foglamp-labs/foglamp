"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@foglamp/ui/components/pagination";
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
  SortableHead,
  ToggleChip,
  Toolbar,
  useDelayedLoading,
  useTableSort,
} from "@/components/app/data-table";
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
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangePicker } from "@/components/app/range-picker";
import {
  ChartLegend,
  formatBucketFull,
  makeBucketLabel,
  makeEdgeTick,
  pageWindow,
  themed,
  thinTicks,
} from "@/components/app/trend-charts";
import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import { RelativeTime } from "@/components/app/relative-time";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatPercent,
  formatTokens,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

import { UNGROUPED } from "../workflows-client";

const PAGE_SIZE = 25;

type RunSortKey = "when" | "duration" | "traces" | "errors" | "cost";

const volumeConfig = {
  runs: { label: "Runs", colors: themed("var(--chart-2)") },
  errors: { label: "Errored", colors: themed("var(--destructive)") },
} satisfies ChartConfig;

const latencyConfig = {
  p50: { label: "p50", colors: themed("var(--chart-2)") },
  p95: { label: "p95", colors: themed("#0090FD") },
  p99: { label: "p99", colors: themed("#FF5513") },
} satisfies ChartConfig;

export function WorkflowDetailClient({ nameParam }: { nameParam: string }) {
  const { projectId } = useProject();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Shared time window drives the stats, trend charts, and runs table.
  const { range, setRange } = useRange();
  // Selected run mirrors the `?run=` query param so the flow is deep-linkable.
  const [selected, setSelected] = useState<string | null>(() =>
    searchParams.get("run")
  );
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [page, setPage] = useState(0);
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
      errorsOnly: errorsOnly || undefined,
      sort: sort ? { field: sort.key, dir: sort.dir } : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled: !!projectId,
    // Keep the current page visible while the next one loads.
    placeholderData: (prev) => prev,
  });

  // Reset paging when the query that defines the result set changes.
  useEffect(() => setPage(0), [range, projectId, errorsOnly, sort]);

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
    // Keep the prior run's flow on screen while switching runs refetches, so the
    // card doesn't flick to a skeleton on every click (isLoading stays false
    // once there's placeholder data — the skeleton only shows on first load).
    placeholderData: (prev) => prev,
  });

  // The selected run's row (for the flow header chips + skeleton sizing).
  const activeRun = runRows.find((r) => r.workflowRunId === activeRunId);
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showRunsSkeleton = useDelayedLoading(runs.isLoading);

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
  // Total runs for pagination: the errored subset when the table is filtered.
  const totalRuns = errorsOnly
    ? (stats?.erroredRunCount ?? 0)
    : (stats?.runCount ?? 0);
  const totalPages = Math.max(page + 1, Math.ceil(totalRuns / PAGE_SIZE) || 1);
  const currentPage = page + 1;
  const pages = pageWindow(currentPage, totalPages);
  // No runs at all in this window (not just filtered away). Wait for the
  // summary so a slow rollup doesn't flash the empty state before stats land.
  const noRuns =
    !runs.isLoading && !summary.isLoading && (stats?.runCount ?? 0) === 0;
  const seriesLoading = series.isLoading;

  return (
    <>
      <PageHeader
        title={label}
        back={back}
        description={
          ungrouped
            ? "Runs with no workflow name."
            : "Grouped runs for this workflow."
        }
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      {noRuns ? (
        <EmptyState
          icon={IconSitemapFilled}
          title="No runs in this range"
          description="Try widening the time range, or this workflow has no runs yet."
        />
      ) : (
        <>
          {/* Stat strip — totals over all runs in the window. */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              icon={IconBoltFilled}
              iconClassName="text-violet-300 dark:text-violet-700"
              size="sm"
              label="Runs"
              value={formatCount(stats?.runCount ?? 0)}
              hint={`${formatCount(stats?.traceCount ?? 0)} traces`}
            />
            <StatCard
              icon={IconAlertTriangleFilled}
              iconClassName="text-rose-300 dark:text-rose-700"
              size="sm"
              label="Error rate"
              value={formatPercent(stats?.errorRate)}
              hint={`${formatCount(stats?.erroredRunCount ?? 0)} errored`}
            />
            <StatCard
              icon={IconClockFilled}
              iconClassName="text-sky-300 dark:text-sky-700"
              size="sm"
              label="p95 duration"
              value={formatDuration(stats?.durationMs.p95 ?? 0)}
              hint={`p50 ${formatDuration(stats?.durationMs.p50 ?? 0)}`}
            />
            <StatCard
              icon={IconCoinFilled}
              iconClassName="text-yellow-300 dark:text-yellow-600"
              size="sm"
              label="Total cost"
              value={formatCost(stats?.totalCost)}
              hint={`${formatTokens(stats?.totalTokens ?? 0)} tokens`}
            />
          </section>

          {/* Trend: run volume + run-duration percentiles over the window. */}
          <section className="grid gap-4 lg:grid-cols-2">
            <Card size="sm">
              <CardHeader className="flex flex-row items-end justify-between gap-4">
                <div className="space-y-1.5">
                  <CardTitle>Runs & errors</CardTitle>
                  <CardDescription>
                    Runs per bucket; errored runs overlaid.
                  </CardDescription>
                </div>
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
                    className="h-[220px] w-full"
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
                      width={30}
                      allowDecimals={false}
                      tickFormatter={(v) => formatCount(Number(v))}
                      dx={-4}
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

            <Card size="sm">
              <CardHeader className="flex flex-row items-end justify-between gap-4">
                <div className="space-y-1.5">
                  <CardTitle>Run duration</CardTitle>
                  <CardDescription>
                    p50 / p95 / p99 per bucket (ms).
                  </CardDescription>
                </div>
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
                    className="h-[220px] w-full"
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
                      width={58}
                      tickFormatter={(v) => formatDuration(Number(v))}
                      dx={-4}
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

          {/* Step flow for the selected run. */}
          {activeRunId && (
            <Card size="sm" className="pb-4">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Run flow
                </CardTitle>
                {activeRun && (
                  <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                    <span>{formatCount(activeRun.traceCount)} traces</span>
                    <span>·</span>
                    <span>{formatDuration(activeRun.durationMs)}</span>
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
                )}
              </CardHeader>
              <CardContent className="px-4 mt-3">
                {runDetail.isLoading ? (
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
          )}

          {/* Runs table — click a row to drive the flow above. */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Runs</h2>
              <Toolbar>
                <ToggleChip
                  active={errorsOnly}
                  onClick={() => setErrorsOnly((v) => !v)}
                >
                  <IconAlertTriangle className="size-3.5" />
                  Errors only
                </ToggleChip>
              </Toolbar>
            </div>

            {runs.isLoading && runRows.length === 0 ? (
              showRunsSkeleton ? (
                <TableSkeleton />
              ) : null
            ) : runRows.length === 0 ? (
              <EmptyState
                icon={IconSitemapFilled}
                title={errorsOnly ? "No errored runs" : "No runs in this range"}
                description={
                  errorsOnly
                    ? "No runs in this window had errors."
                    : "Try widening the time range."
                }
              />
            ) : (
              <>
                <Table>
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
                    {runRows.map((r) => (
                      <TableRow
                        key={r.workflowRunId}
                        interactive
                        className={cn(
                          r.workflowRunId === activeRunId && "bg-accent/30",
                          // Left accent bar on errored runs — scannable at a glance.
                          r.errorCount > 0 &&
                            "shadow-[inset_1px_0_0_0_var(--color-rose-500)]"
                        )}
                        onClick={() => selectRun(r.workflowRunId)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {r.displayName ?? (
                                <span className="font-mono text-xs text-muted-foreground">
                                  {r.workflowRunId}
                                </span>
                              )}
                            </span>
                            {r.errorCount > 0 && (
                              <Badge
                                variant="rose"
                                className="shrink-0 font-sans ml-auto"
                              >
                                <IconAlertTriangle />
                                {formatCount(r.errorCount)}
                                {r.errorCount === 1 ? "error" : "errors"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCount(r.traceCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDuration(r.durationMs)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCost(r.totalCost)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          <RelativeTime value={r.startTime} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between px-1">
                  <span className="text-sm text-muted-foreground/50 tabular-nums">
                    {`Showing ${page * PAGE_SIZE + 1}–${
                      page * PAGE_SIZE + runRows.length
                    } of ${formatCount(totalRuns)}`}
                  </span>
                  <Pagination className="mx-0 w-auto justify-end">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          aria-disabled={page === 0 || runs.isFetching}
                          className={cn(
                            (page === 0 || runs.isFetching) &&
                              "pointer-events-none opacity-50"
                          )}
                          onClick={() => setPage((p) => Math.max(0, p - 1))}
                        />
                      </PaginationItem>
                      {pages.map((p, i) =>
                        p === "ellipsis" ? (
                          // biome-ignore lint/suspicious/noArrayIndexKey: positional separator
                          <PaginationItem key={`ellipsis-${i}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={p}>
                            <PaginationLink
                              isActive={p === currentPage}
                              className={cn(
                                runs.isFetching && "pointer-events-none"
                              )}
                              onClick={() => setPage(p - 1)}
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      )}
                      <PaginationItem>
                        <PaginationNext
                          aria-disabled={
                            currentPage >= totalPages || runs.isFetching
                          }
                          className={cn(
                            (currentPage >= totalPages || runs.isFetching) &&
                              "pointer-events-none opacity-50"
                          )}
                          onClick={() => setPage((p) => p + 1)}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
