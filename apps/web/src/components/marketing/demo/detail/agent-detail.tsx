"use client";

import { DRAWER_BUTTON_CLASS } from "@/components/app/button-styles";
import { spanTypeIcon } from "@/components/app/span-type";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
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
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconArrowUpRight,
  IconBoltFilled,
  IconClockFilled,
  IconCoinFilled,
  IconSitemapFilled,
  IconTool,
  IconAffiliateFilled,
} from "@tabler/icons-react";
import { Fragment, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import {
  PaginationFooter,
  SortableHead,
  sortRows,
  useTableSort,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import { type FlowNode, NodeFlow } from "@/components/app/node-flow";
import { StatCard } from "@/components/app/page-parts";
import {
  Bubble,
  CustomerValue,
  DrawerColumns,
  DrawerRow,
  ExpandChevron,
  Meta,
  ModelsValue,
  OPEN_ROW_CLASS,
} from "@/components/app/run-exchange";
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
  formatDateTime,
  formatDuration,
  formatPercent,
  formatSpanDuration,
  formatTokens,
} from "@/lib/format";

import { DemoRange, DemoSessionButton, DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import {
  AGENTS,
  AGENT_FLOW,
  AGENT_SERIES,
  AGENT_TRACES,
  type AgentTrace,
  TRACE_MESSAGES,
  quintiles,
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
  bucketLabel,
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

function stepIcon(
  spanType: string,
  modelId: string | null,
  name: string | null,
) {
  if (spanType === "llm" && modelId)
    return <ModelLogo modelId={modelId} className="size-3.5" />;
  if (spanType === "agent")
    return <AgentIcon name={name} className="size-3.25" />;
  if (spanType === "tool")
    return (
      <IconTool className="size-3 shrink-0 fill-current stroke-1 text-blue-500 mb-px" />
    );
  const Icon = spanTypeIcon(spanType);
  return <Icon className="size-3.5 text-muted-foreground" />;
}

const DURATION_QUANTILES = quintiles(AGENT_TRACES.map((t) => t.durationMs));
const COST_QUANTILES = quintiles(AGENT_TRACES.map((t) => t.cost));

type TraceSortKey = "when" | "duration" | "tokens" | "spans" | "cost";

export function AgentDetail({ agentName }: { agentName: string }) {
  const { closeDetail, openDetail } = useDemo();
  const [pageSize, setPageSize] = useState(25);
  const agent = AGENTS.find((a) => a.name === agentName) ?? AGENTS[0]!;

  const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
  const [latencySelected, setLatencySelected] = useState<string | null>(null);
  // Which trace row is expanded into its drawer (steps + exchange).
  const [expanded, setExpanded] = useState<string | null>(null);
  const { sort, toggle } = useTableSort<TraceSortKey>();

  const traceRows = sortRows<AgentTrace, TraceSortKey>(AGENT_TRACES, sort, {
    when: (t) => -AGENT_TRACES.indexOf(t),
    duration: (t) => t.durationMs,
    tokens: (t) => t.tokens,
    spans: (t) => t.spans,
    cost: (t) => t.cost,
  });

  const errorRate = agent.errorCount / agent.spanCount;
  const llmSpanCount = Math.round(agent.spanCount * 0.62);

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
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4 px-8 mt-1">
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-amber-400 dark:text-yellow-500"
          size="sm"
          label="Total cost"
          value={agent.costValue}
          formatValue={(n) => formatCost(n, 4)}
          hint={`${formatTokens(agent.totalTokens)} tokens`}
        />
        <StatCard
          icon={IconAlertTriangleFilled}
          iconClassName="text-red-500/90 dark:text-red-600/95 mt-px"
          size="sm"
          label="Error rate"
          value={errorRate}
          formatValue={formatPercent}
          hint={`${formatCount(agent.errorCount)} errors`}
        />
        <StatCard
          icon={IconClockFilled}
          iconClassName="text-sky-400 dark:text-sky-500"
          size="sm"
          label="p95 latency"
          value={agent.p95Ms}
          formatValue={formatDuration}
          hint={`p50 ${formatDuration(agent.p50Ms)}`}
        />
        <StatCard
          icon={IconBoltFilled}
          iconClassName="text-orange-500 dark:text-orange-500"
          size="sm"
          label="Spans"
          value={agent.spanCount}
          formatValue={formatCount}
          hint={`${formatCount(llmSpanCount)} LLM`}
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

      {/* Traces table — click a row to open its drawer. */}
      <div className="flex flex-col gap-3 mt-4">
        <div className="flex flex-col gap-3">
          <TooltipProvider delay={150}>
            <Table className="table-fixed">
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
                {traceRows.map((t) => {
                  const isOpen = expanded === t.traceId;
                  return (
                    <Fragment key={t.traceId}>
                      <TableRow
                        interactive
                        aria-expanded={isOpen}
                        className={cn("group", isOpen && OPEN_ROW_CLASS)}
                        onClick={() => setExpanded(isOpen ? null : t.traceId)}
                      >
                        {/* Content-first, like the real table: the trace's
                            opening user message. */}
                        <TableCell className="h-12 font-normal">
                          <div className="flex items-center gap-2">
                            <ExpandChevron open={isOpen} />
                            <span className="truncate">{t.userMessage}</span>
                            {/* Compact error count — colored text, no pill. */}
                            {t.errors ? (
                              <span
                                title={`${t.errors} ${t.errors === 1 ? "error" : "errors"}`}
                                className="flex shrink-0 items-center gap-0.75 font-sans text-sm text-red-600 dark:text-red-400"
                              >
                                <IconAlertTriangle className="size-3.5 fill-current/20" />
                                {t.errors}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-0">
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
                              className="block max-w-full truncate text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {t.workflow}
                            </button>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCount(t.spans)}
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
                      {isOpen && <TraceDrawer trace={t} colSpan={6} />}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>

          <PaginationFooter
            page={0}
            pageSize={pageSize}
            total={traceRows.length}
            shown={traceRows.length}
            noun={["trace", "traces"]}
            onPageChange={() => {}}
            onPageSizeChange={setPageSize}
            pageSizes={[25, 50, 100]}
          />
        </div>
      </div>
    </>
  );
}

/** Expanded row: the trace's overview on the left (timing, size, cost,
 * customer, models), its step flow and exchange on the right. Mirrors the real
 * page's TraceDrawer. */
function TraceDrawer({
  trace,
  colSpan,
}: {
  trace: AgentTrace;
  colSpan: number;
}) {
  const { openDetail } = useDemo();
  const input = TRACE_MESSAGES.find((m) => m.role === "user")?.content;
  const output = TRACE_MESSAGES.find((m) => m.role === "assistant")?.content;

  const nodes: FlowNode[] = AGENT_FLOW.map((s) => ({
    id: s.id,
    icon: stepIcon(s.type, s.type === "llm" ? s.sublabel : null, s.label),
    label: s.label,
    sublabel: s.type === "llm" ? s.sublabel : null,
    status: s.status,
    timestamp: s.timestamp,
    durationMs: s.durationMs,
  }));

  return (
    <DrawerRow colSpan={colSpan} className="pt-6">
      <DrawerColumns
        overview={
          <>
            {trace.errors ? (
              <div className="flex h-5 items-center">
                <Badge variant="rose" className="font-sans">
                  <IconAlertTriangle />
                  {formatCount(trace.errors)}
                  {trace.errors === 1 ? " error" : " errors"}
                </Badge>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <Meta label="Started" value={formatDateTime(trace.startedAt)} />
              <Meta
                label="Duration"
                value={formatSpanDuration(trace.durationMs)}
              />
              <Meta label="Spans" value={formatCount(trace.spans)} />
              <Meta label="Tokens" value={formatTokens(trace.tokens)} />
              <Meta label="Cost" value={formatCost(trace.cost, 4)} />
              <Meta
                label="Customer"
                value={
                  <CustomerValue
                    customerId={trace.customer}
                    customerName={trace.customer}
                  />
                }
              />
              <Meta
                label={trace.models.length === 1 ? "Model" : "Models"}
                className="col-span-2"
                value={<ModelsValue models={trace.models} />}
              />
              {trace.workflow && (
                <Meta
                  label="Workflow"
                  className="col-span-2"
                  value={
                    <button
                      type="button"
                      onClick={() =>
                        openDetail({ type: "workflow", id: trace.workflow! })
                      }
                      className="flex min-w-0 max-w-full items-center gap-1.5"
                    >
                      <IconSitemapFilled className="size-3.5 shrink-0 text-emerald-500" />
                      <span className="truncate">{trace.workflow}</span>
                      <IconArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  }
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2.5 mt-3">
              <Button
                size="sm"
                variant="secondary"
                className={cn("w-fit", DRAWER_BUTTON_CLASS)}
                onClick={() => openDetail({ type: "trace", id: trace.traceId })}
              >
                <IconAffiliateFilled className="text-[#8b5e34] dark:text-[#c9a888]" />
                See trace
                <IconArrowUpRight className="mt-px" />
              </Button>
              {trace.sessionId && (
                <DemoSessionButton
                  onClick={() =>
                    openDetail({ type: "session", id: trace.sessionId! })
                  }
                />
              )}
            </div>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <DrawerSection label="Steps">
            <NodeFlow
              nodes={nodes}
              onNodeClick={() =>
                openDetail({ type: "trace", id: trace.traceId })
              }
            />
          </DrawerSection>
          <DrawerSection label="Exchange">
            <div className="flex flex-col gap-4">
              {input ? <Bubble who="user" text={input} /> : null}
              {output ? <Bubble who="assistant" text={output} /> : null}
            </div>
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
