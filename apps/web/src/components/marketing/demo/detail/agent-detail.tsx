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
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconArrowUpRight,
  IconBoltFilled,
  IconChevronRight,
  IconClockFilled,
  IconCoinFilled,
  IconCpu,
  IconTool,
} from "@tabler/icons-react";
import { Fragment, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import {
  SortableHead,
  sortRows,
  useTableSort,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import { type FlowNode, NodeFlow } from "@/components/app/node-flow";
import { StatCard } from "@/components/app/page-parts";
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
import { ModelLogo } from "@/components/model-logo";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatPercent,
  formatSpanDuration,
  formatTokens,
} from "@/lib/format";

import { DemoRange, DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import {
  AGENT_FLOW,
  AGENT_SERIES,
  AGENT_TRACES,
  AGENTS,
  type AgentTrace,
  quintiles,
  TRACE_MESSAGES,
} from "../mock-data";
import {
  DemoCostBreakdownCard,
  DemoToolBreakdownCard,
} from "./breakdown-cards";

// The demo window is a fixed "Last 24 hours", so the bucket axis renders
// time-of-day labels.
const WINDOW_MS = 24 * 60 * 60 * 1000;
const bucketLabel = makeBucketLabel(WINDOW_MS);
const edgeTick = makeEdgeTick(bucketLabel);
const seriesTicks = thinTicks(
  AGENT_SERIES.map((d) => d.bucket),
  bucketLabel
);

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

// Latency as a stacked *band* (p50, p95−p50, p99−p95); the absolutes ride
// along for the tooltip. Same transform as the real agent detail.
const latencyData = AGENT_SERIES.map((r) => ({
  bucket: r.bucket,
  p50: r.p50,
  p95: Math.max(0, r.p95 - r.p50),
  p99: Math.max(0, r.p99 - r.p95),
  p50Abs: r.p50,
  p95Abs: r.p95,
  p99Abs: r.p99,
}));

function stepIcon(spanType: string, modelId: string | null) {
  if (spanType === "llm")
    return <ModelLogo modelId={modelId} className="size-5" />;
  if (spanType === "tool")
    return <IconTool className="size-5 text-muted-foreground" />;
  return <IconCpu className="size-5 text-muted-foreground" />;
}

const DURATION_QUANTILES = quintiles(AGENT_TRACES.map((t) => t.durationMs));
const COST_QUANTILES = quintiles(AGENT_TRACES.map((t) => t.cost));

type TraceSortKey = "when" | "duration" | "tokens" | "spans" | "cost";

export function AgentDetail({ agentName }: { agentName: string }) {
  const { closeDetail, openDetail } = useDemo();
  const agent = AGENTS.find((a) => a.name === agentName) ?? AGENTS[0]!;

  const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
  const [latencySelected, setLatencySelected] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Which trace row is expanded to glimpse its input/output (by traceId).
  const [expanded, setExpanded] = useState<string | null>(null);
  const { sort, toggle } = useTableSort<TraceSortKey>();

  const traceRows = sortRows<AgentTrace, TraceSortKey>(AGENT_TRACES, sort, {
    when: (t) => -AGENT_TRACES.indexOf(t),
    duration: (t) => t.durationMs,
    tokens: (t) => t.tokens,
    spans: (t) => t.spans,
    cost: (t) => t.cost,
  });

  // Default the flow to the most recent trace (list is newest-first).
  const activeTraceId = selected ?? traceRows[0]?.traceId ?? null;
  const activeTrace = traceRows.find((t) => t.traceId === activeTraceId);

  const errorRate = agent.errorCount / agent.spanCount;
  const llmSpanCount = Math.round(agent.spanCount * 0.62);

  const nodes: FlowNode[] = AGENT_FLOW.map((s) => ({
    id: s.id,
    icon: stepIcon(s.type, s.type === "llm" ? s.sublabel : null),
    label: s.label,
    sublabel: s.type === "llm" ? s.sublabel : null,
    status: s.status,
    timestamp: s.timestamp,
    durationMs: s.durationMs,
  }));

  return (
    <>
      <DetailHeader
        backHref="/agents"
        title={agent.name}
        titleLeading={<AgentIcon name={agent.name} className="size-4.5" />}
        actions={<DemoRange />}
        onBack={closeDetail}
      />

      {/* Stat strip — totals over all spans in the window. */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4 px-8">
        <StatCard
          icon={IconBoltFilled}
          iconClassName="text-orange-500 dark:text-orange-500"
          size="sm"
          label="Spans"
          value={agent.spanCount}
          formatValue={formatCount}
          hint={`${formatCount(llmSpanCount)} LLM`}
        />
        <StatCard
          icon={IconAlertTriangleFilled}
          iconClassName="text-red-500 dark:text-red-600"
          size="sm"
          label="Error rate"
          value={errorRate}
          formatValue={formatPercent}
          hint={`${formatCount(agent.errorCount)} errors`}
        />
        <StatCard
          icon={IconClockFilled}
          iconClassName="text-sky-500 dark:text-sky-500"
          size="sm"
          label="p95 latency"
          value={agent.p95Ms}
          formatValue={formatDuration}
          hint={`p50 ${formatDuration(agent.p50Ms)}`}
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-yellow-400 dark:text-yellow-500"
          size="sm"
          label="Total cost"
          value={agent.costValue}
          formatValue={(n) => formatCost(n, 4)}
          hint={`${formatTokens(agent.totalTokens)} tokens`}
        />
      </section>

      {/* Trend: span volume + LLM latency percentiles over the window. */}
      <section className="grid gap-4 lg:grid-cols-2 px-8">
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
            <AreaChart.EvilAreaChart
              config={volumeConfig}
              data={AGENT_SERIES}
              xDataKey="bucket"
              selectedDataKey={volumeSelected}
              onSelectionChange={setVolumeSelected}
              className="h-55 w-full"
              chartProps={{
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
            <AreaChart.EvilAreaChart
              config={latencyConfig}
              data={latencyData}
              xDataKey="bucket"
              stackType="stacked"
              selectedDataKey={latencySelected}
              onSelectionChange={setLatencySelected}
              className="h-55 w-full"
              chartProps={{
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
          </CardContent>
        </Card>
      </section>

      {/* Where this agent's spend and time go: cost per price dimension
          over the window, beside the per-tool runtime breakdown. */}
      <section className="grid gap-4 lg:grid-cols-2 px-8">
        <DemoCostBreakdownCard />
        <DemoToolBreakdownCard />
      </section>

      {/* Step flow for the selected trace. */}
      <div className="px-8">
        <Card size="sm" className="pb-4">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Trace flow
            </CardTitle>
            {activeTrace && (
              <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                <span>{formatCount(activeTrace.spans)} spans</span>
                <span>·</span>
                <span>{formatSpanDuration(activeTrace.durationMs)}</span>
                <span>·</span>
                <span>{formatCost(activeTrace.cost)}</span>
                <span>·</span>
                <span>{formatTokens(activeTrace.tokens)} tokens</span>
                {activeTrace.errors ? (
                  <Badge variant="rose" className="font-sans">
                    <IconAlertTriangle />
                    {formatCount(activeTrace.errors)}
                    {activeTrace.errors === 1 ? "error" : "errors"}
                  </Badge>
                ) : null}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="px-4 mt-3">
            <NodeFlow nodes={nodes} />
          </CardContent>
        </Card>
      </div>

      {/* Traces table — click a row to drive the flow above. */}
      <div className="flex flex-col gap-3 mt-4">
        <div className="flex flex-col gap-3">
          <TooltipProvider delay={150}>
            <Table>
              <TableHeader>
                <TableRow>
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
                          t.traceId === activeTraceId &&
                            "bg-accent/60 dark:bg-accent/30",
                          // Left accent bar on errored traces — scannable at a glance.
                          t.errors &&
                            "shadow-[inset_1px_0_0_0_var(--color-rose-500)]"
                        )}
                        onClick={() => {
                          // Row click both drives the flow above and
                          // toggles the input/output preview.
                          setSelected(t.traceId);
                          setExpanded(isOpen ? null : t.traceId);
                        }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <IconChevronRight
                              className={cn(
                                "size-3.5 transition-transform",
                                isOpen && "rotate-90"
                              )}
                            />
                            <span className="truncate font-medium">
                              {t.name}
                            </span>
                            {t.errors ? (
                              <Badge
                                variant="rose"
                                className="shrink-0 font-sans ml-auto"
                              >
                                <IconAlertTriangle />
                                {formatCount(t.errors)}
                                {t.errors === 1 ? "error" : "errors"}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {t.workflow ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetail({
                                  type: "workflow",
                                  id: t.workflow!,
                                });
                              }}
                              title="View workflow"
                            >
                              <Badge
                                variant="secondary"
                                className="cursor-pointer transition-colors hover:bg-secondary/80"
                              >
                                {t.workflow}
                              </Badge>
                            </button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCount(t.spans)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatTokens(t.tokens)}
                        </TableCell>
                        <HeatCell
                          value={t.durationMs}
                          thresholds={DURATION_QUANTILES}
                          metric="duration"
                        >
                          {formatSpanDuration(t.durationMs)}
                        </HeatCell>
                        <HeatCell
                          value={t.cost}
                          thresholds={COST_QUANTILES}
                          metric="cost"
                          bold
                        >
                          {formatCost(t.cost)}
                        </HeatCell>
                        <TableCell className="text-right text-muted-foreground">
                          {t.when}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TracePreview traceId={t.traceId} colSpan={8} />
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>

          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-muted-foreground/50 tabular-nums">
              Showing 1–{traceRows.length} of {formatCount(traceRows.length)}
            </span>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    aria-disabled
                    className="pointer-events-none opacity-50"
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink isActive>1</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    aria-disabled
                    className="pointer-events-none opacity-50"
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </div>
    </>
  );
}

/** Expanded row: shows a glimpse of the run's input/output plus a deep link
 * into the full trace. Mirrors the real page's TracePreview. */
function TracePreview({
  traceId,
  colSpan,
}: {
  traceId: string;
  colSpan: number;
}) {
  const { openDetail } = useDemo();
  const input = TRACE_MESSAGES.find((m) => m.role === "user")?.content;
  const output = TRACE_MESSAGES.find((m) => m.role === "assistant")?.content;

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="bg-muted/30 p-0">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openDetail({ type: "trace", id: traceId })}
            >
              See full trace
              <IconArrowUpRight />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Glimpse label="Input" value={input} />
            <Glimpse label="Output" value={output} />
          </div>
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
          <p className="text-[13px] whitespace-pre-wrap wrap-break-word">
            {value}
          </p>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}
