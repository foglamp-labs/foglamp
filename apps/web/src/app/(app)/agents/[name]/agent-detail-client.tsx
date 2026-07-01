"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
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
  IconArrowUpRight,
  IconBoltFilled,
  IconChartAreaFilled,
  IconChevronRight,
  IconClockFilled,
  IconCoinFilled,
  IconCpu,
  IconGhostFilled,
  IconTool,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import {
  SortableHead,
  ToggleChip,
  Toolbar,
  useTableSort,
} from "@/components/app/data-table";
import { useDelayedLoading } from "@/components/app/hooks";
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
import { PayloadView } from "@/components/app/payload-view";
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
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { ModelLogo } from "@/components/model-logo";
import { RelativeTime } from "@/components/app/relative-time";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatPercent,
  formatTokens,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

const PAGE_SIZE = 25;

type TraceSortKey = "when" | "duration" | "tokens" | "spans" | "cost";

const volumeConfig = {
  spans: { label: "Spans", colors: themed("var(--chart-2)") },
  errors: { label: "Errored", colors: themed("var(--destructive)") },
} satisfies ChartConfig;

const latencyConfig = {
  p50: { label: "p50", colors: themed("var(--chart-2)") },
  p95: { label: "p95", colors: themed("#0090FD") },
  p99: { label: "p99", colors: themed("#FF5513") },
} satisfies ChartConfig;

function stepIcon(spanType: string, modelId: string | null) {
  if (spanType === "llm")
    return <ModelLogo modelId={modelId} className="size-5" />;
  if (spanType === "tool")
    return <IconTool className="size-5 text-muted-foreground" />;
  return <IconCpu className="size-5 text-muted-foreground" />;
}

export function AgentDetailClient({ agentName }: { agentName: string }) {
  const { projectId } = useProject();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { range, setRange } = useRange();
  // Selected trace mirrors the `?trace=` query param so the flow is deep-linkable.
  const [selected, setSelected] = useState<string | null>(() =>
    searchParams.get("trace")
  );
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [page, setPage] = useState(0);
  // Which trace row is expanded to glimpse its input/output (by traceId).
  const [expanded, setExpanded] = useState<string | null>(null);
  // Selected series for each trend chart, driven by the header legends.
  const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
  const [latencySelected, setLatencySelected] = useState<string | null>(null);
  const { sort, toggle } = useTableSort<TraceSortKey>();

  const { from, to } = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range]
  );
  const enabled = !!projectId;

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

  const traces = useQuery({
    ...trpc.traces.list.queryOptions({
      projectId: projectId!,
      agentName,
      from,
      to,
      errorsOnly: errorsOnly || undefined,
      sort: sort ? { field: sort.key, dir: sort.dir } : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled,
    // Keep the current page visible while the next one loads.
    placeholderData: (prev) => prev,
  });

  // Reset paging + any open preview when the query that defines the result set
  // changes.
  useEffect(() => {
    setPage(0);
    setExpanded(null);
  }, [range, projectId, errorsOnly, sort]);

  const traceRows = traces.data?.traces ?? [];
  // Default the flow to the most recent trace on the page (list is newest-first).
  const activeTraceId = selected ?? traceRows[0]?.traceId ?? null;

  const selectTrace = (id: string) => {
    setSelected(id);
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    sp.set("trace", id);
    router.replace(`?${sp.toString()}`, { scroll: false });
  };

  const traceDetail = useQuery({
    ...trpc.traces.get.queryOptions({
      projectId: projectId!,
      traceId: activeTraceId!,
    }),
    enabled: enabled && !!activeTraceId,
    // Keep the prior trace's flow on screen while switching refetches.
    placeholderData: (prev) => prev,
  });

  // The selected trace's row (for the flow header chips + skeleton sizing).
  const activeTrace = traceRows.find((t) => t.traceId === activeTraceId);
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showTracesSkeleton = useDelayedLoading(traces.isLoading);

  const windowMs = range.to.getTime() - range.from.getTime();
  const bucketLabel = useMemo(() => makeBucketLabel(windowMs), [windowMs]);
  const edgeTick = useMemo(() => makeEdgeTick(bucketLabel), [bucketLabel]);
  // Keep the raw bucket as the x value (formatted on the axis) so we can thin the
  // ticks and edge-anchor the first/last labels.
  const seriesData = useMemo(
    () =>
      (series.data ?? []).map((r) => ({
        bucket: r.bucket,
        spans: r.spanCount,
        errors: r.errorCount,
        p50: r.latencyMs.p50,
        p95: r.latencyMs.p95,
        p99: r.latencyMs.p99,
      })),
    [series.data]
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

  const nodes: FlowNode[] = (traceDetail.data?.spans ?? []).map((s) => ({
    id: s.spanId,
    icon: stepIcon(s.spanType, s.modelId),
    label: s.name,
    sublabel: s.modelId,
    status:
      s.status === "error" ? "error" : s.status === "aborted" ? "aborted" : "ok",
    timestamp: s.startTime,
    durationMs: s.durationMs,
  }));

  const totalTraces = traces.data?.summary.traceCount ?? 0;
  const totalPages = Math.max(
    page + 1,
    Math.ceil(totalTraces / PAGE_SIZE) || 1
  );
  const currentPage = page + 1;
  const pages = pageWindow(currentPage, totalPages);
  // No activity for this agent at all (not just filtered away). Wait for the
  // stats so a slow rollup doesn't flash the empty state before they land.
  const noData = !detail.isLoading && (stats === null || stats.spanCount === 0);
  const seriesLoading = series.isLoading;

  return (
    <>
      <PageHeader
        title={agentName}
        titleLeading={<AgentIcon name={agentName} className="size-4.5" />}
        back={back}
        description="Trends, traces, and step flow for this agent."
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      {noData ? (
        <EmptyState
          icon={IconGhostFilled}
          title="No activity in this range"
          description="Try widening the time range, or this agent has no traces yet."
        />
      ) : (
        <>
          {/* Stat strip — totals over all spans in the window. */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              icon={IconBoltFilled}
              iconClassName="text-violet-300 dark:text-violet-700"
              size="sm"
              label="Spans"
              value={formatCount(stats?.spanCount ?? 0)}
              hint={`${formatCount(stats?.llmSpanCount ?? 0)} LLM`}
            />
            <StatCard
              icon={IconAlertTriangleFilled}
              iconClassName="text-rose-300 dark:text-rose-700"
              size="sm"
              label="Error rate"
              value={formatPercent(errorRate)}
              hint={`${formatCount(stats?.errorCount ?? 0)} errors`}
            />
            <StatCard
              icon={IconClockFilled}
              iconClassName="text-sky-300 dark:text-sky-700"
              size="sm"
              label="p95 latency"
              value={formatDuration(stats?.latencyMs.p95 ?? 0)}
              hint={`p50 ${formatDuration(stats?.latencyMs.p50 ?? 0)}`}
            />
            <StatCard
              icon={IconCoinFilled}
              iconClassName="text-yellow-300 dark:text-yellow-600"
              size="sm"
              label="Total cost"
              value={formatCost(stats?.totalCost ?? null, 4)}
              hint={`${formatTokens(stats?.totalTokens ?? 0)} tokens`}
            />
          </section>

          {/* Trend: span volume + LLM latency percentiles over the window. */}
          <section className="grid gap-4 lg:grid-cols-2">
            <Card size="sm">
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

            <Card size="sm">
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
                      width={52}
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

          {/* Step flow for the selected trace. */}
          {activeTraceId && (
            <Card size="sm" className="pb-4">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Trace flow
                </CardTitle>
                {activeTrace && (
                  <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                    <span>{formatCount(activeTrace.spanCount)} spans</span>
                    <span>·</span>
                    <span>{formatDuration(activeTrace.durationMs)}</span>
                    <span>·</span>
                    <span>{formatCost(activeTrace.totalCost)}</span>
                    <span>·</span>
                    <span>{formatTokens(activeTrace.totalTokens)} tokens</span>
                    {activeTrace.errorCount > 0 && (
                      <Badge variant="rose" className="font-sans">
                        <IconAlertTriangle />
                        {formatCount(activeTrace.errorCount)}
                        {activeTrace.errorCount === 1 ? "error" : "errors"}
                      </Badge>
                    )}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="px-4 mt-3">
                {traceDetail.isLoading ? (
                  <NodeFlowSkeleton count={activeTrace?.spanCount} />
                ) : nodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No steps in this trace.
                  </p>
                ) : (
                  <NodeFlow
                    nodes={nodes}
                    onNodeClick={(spanId) =>
                      router.push(
                        `/traces/${encodeURIComponent(activeTraceId)}?span=${encodeURIComponent(spanId)}`
                      )
                    }
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Traces table — click a row to drive the flow above. */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Traces</h2>
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

            {traces.isLoading && traceRows.length === 0 ? (
              showTracesSkeleton ? (
                <TableSkeleton />
              ) : null
            ) : traceRows.length === 0 ? (
              <EmptyState
                icon={IconGhostFilled}
                title={
                  errorsOnly ? "No errored traces" : "No traces in this range"
                }
                description={
                  errorsOnly
                    ? "No traces in this window had errors."
                    : "Try widening the time range."
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Trace</TableHead>
                      <TableHead>Workflow</TableHead>
                      <SortableHead
                        sortKey="spans"
                        sort={sort}
                        onSort={toggle}
                        align="right"
                        className="w-24"
                      >
                        Spans
                      </SortableHead>
                      <SortableHead
                        sortKey="tokens"
                        sort={sort}
                        onSort={toggle}
                        align="right"
                        className="w-28"
                      >
                        Tokens
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
                    {traceRows.map((t) => {
                      const isOpen = expanded === t.traceId;
                      return (
                        <Fragment key={t.traceId}>
                          <TableRow
                            interactive
                            className={cn(
                              t.traceId === activeTraceId && "bg-accent/30",
                              // Left accent bar on errored traces — scannable at a glance.
                              t.errorCount > 0 &&
                                "shadow-[inset_1px_0_0_0_var(--color-rose-500)]"
                            )}
                            onClick={() => {
                              // Row click both drives the flow above and
                              // toggles the input/output preview.
                              selectTrace(t.traceId);
                              setExpanded(isOpen ? null : t.traceId);
                            }}
                          >
                            <TableCell className="text-muted-foreground/50 pr-2">
                              <IconChevronRight
                                className={cn(
                                  "size-3.5 transition-transform",
                                  isOpen && "rotate-90"
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium">
                                  {t.traceName ?? (
                                    <span className="font-mono text-xs text-muted-foreground">
                                      {t.traceId}
                                    </span>
                                  )}
                                </span>
                                {t.errorCount > 0 && (
                                  <Badge
                                    variant="rose"
                                    className="shrink-0 font-sans ml-auto"
                                  >
                                    <IconAlertTriangle />
                                    {formatCount(t.errorCount)}
                                    {t.errorCount === 1 ? "error" : "errors"}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {t.workflowName ? (
                                <Link
                                  href={`/workflows/${encodeURIComponent(
                                    t.workflowName
                                  )}`}
                                  onClick={(e) => e.stopPropagation()}
                                  title="View workflow"
                                >
                                  <Badge
                                    variant="secondary"
                                    className="transition-colors hover:bg-secondary/80"
                                  >
                                    {t.workflowName}
                                  </Badge>
                                </Link>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCount(t.spanCount)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatTokens(t.totalTokens)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatDuration(t.durationMs)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {formatCost(t.totalCost)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              <RelativeTime value={t.startTime} />
                            </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TracePreview
                              traceId={t.traceId}
                              projectId={projectId}
                              colSpan={8}
                            />
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between px-1">
                  <span className="text-sm text-muted-foreground/50 tabular-nums">
                    {traceRows.length === 0
                      ? `Showing 0 of ${formatCount(totalTraces)}`
                      : `Showing ${page * PAGE_SIZE + 1}–${
                          page * PAGE_SIZE + traceRows.length
                        } of ${formatCount(totalTraces)}`}
                  </span>
                  <Pagination className="mx-0 w-auto justify-end">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          aria-disabled={page === 0 || traces.isFetching}
                          className={cn(
                            (page === 0 || traces.isFetching) &&
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
                                traces.isFetching && "pointer-events-none"
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
                            currentPage >= totalPages || traces.isFetching
                          }
                          className={cn(
                            (currentPage >= totalPages || traces.isFetching) &&
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

/** Expanded row: lazy-fetches the trace and shows a glimpse of the run's
 * input/output (taken from the root span), plus a deep link into the full
 * trace. Mirrors the eval page's score preview. */
function TracePreview({
  traceId,
  projectId,
  colSpan,
}: {
  traceId: string;
  projectId: string;
  colSpan: number;
}) {
  const detail = useQuery(trpc.traces.get.queryOptions({ projectId, traceId }));
  const spans = detail.data?.spans ?? [];
  // The whole-run input/output lives on the root span (fall back to the first).
  const root = spans.find((s) => !s.parentSpanId) ?? spans[0];

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="bg-muted/30 p-0">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              variant="outline"
              // biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
              render={
                <Link href={`/traces/${encodeURIComponent(traceId)}` as any} />
              }
            >
              See full trace
              <IconArrowUpRight />
            </Button>
          </div>
          {detail.isLoading ? (
            <span className="text-xs text-muted-foreground">
              Loading trace…
            </span>
          ) : !root ? (
            <span className="text-xs text-muted-foreground">
              Trace payload unavailable.
            </span>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Glimpse label="Input" value={root.input} />
              <Glimpse label="Output" value={root.output} />
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function Glimpse({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {value ? (
        <div className="max-h-64 overflow-x-hidden overflow-y-auto rounded-md bg-muted p-2.5">
          <PayloadView value={value} />
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}
