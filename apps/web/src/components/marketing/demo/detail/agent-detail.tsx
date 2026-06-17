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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconBolt,
  IconBoltFilled,
  IconClockFilled,
  IconCoinFilled,
  IconGhost,
  IconSparkles,
  IconTool,
} from "@tabler/icons-react";
import { useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { navItem } from "@/components/app/nav";
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
import {
  formatCost,
  formatCount,
  formatDuration,
  formatTokens,
} from "@/lib/format";

import { DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { AGENT_FLOW, AGENT_SERIES, AGENT_TRACES, AGENTS } from "../mock-data";

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
  p50: { label: "p50", colors: themed("var(--chart-2)") },
  p95: { label: "p95", colors: themed("#0090FD") },
  p99: { label: "p99", colors: themed("#FF5513") },
} satisfies ChartConfig;

// Latency as a stacked band (p50, p95−p50, p99−p95); absolutes ride along for
// the tooltip. Same transform as the real agent detail.
const latencyData = AGENT_SERIES.map((r) => ({
  bucket: r.bucket,
  p50: r.p50,
  p95: Math.max(0, r.p95 - r.p50),
  p99: Math.max(0, r.p99 - r.p95),
  p50Abs: r.p50,
  p95Abs: r.p95,
  p99Abs: r.p99,
}));

const stepIcon: Record<string, React.ReactNode> = {
  llm: <IconSparkles className="size-5 text-violet-500" />,
  tool: <IconTool className="size-5 text-blue-500" />,
  agent: <IconBolt className="size-5 text-amber-500" />,
};

export function AgentDetail({ agentName }: { agentName: string }) {
  const { closeDetail, openDetail } = useDemo();
  const agent = AGENTS.find((a) => a.name === agentName) ?? AGENTS[0]!;
  const agentsNav = navItem("/agents")!;

  const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
  const [latencySelected, setLatencySelected] = useState<string | null>(null);

  const nodes: FlowNode[] = AGENT_FLOW.map((s) => ({
    id: s.id,
    icon: stepIcon[s.type],
    label: s.label,
    sublabel: s.sublabel,
    status: s.status,
    timestamp: s.timestamp,
    durationMs: s.durationMs,
  }));

  return (
    <>
      <DetailHeader
        backIcon={agentsNav.icon}
        backLabel="Agents"
        backIconClassName={agentsNav.iconClassName}
        title={agent.name}
        description={`Trends, traces, and step flow · ${agent.models.join(", ")}`}
        onBack={closeDetail}
      />

      {/* Stat strip — totals over all spans in the window. */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={IconBoltFilled}
          iconClassName="text-violet-300 dark:text-violet-700"
          size="sm"
          label="Spans"
          value={agent.spanCount}
          hint={`${agent.llmSpanCount} LLM`}
        />
        <StatCard
          icon={IconAlertTriangleFilled}
          iconClassName="text-rose-300 dark:text-rose-700"
          size="sm"
          label="Error rate"
          value={agent.errorRate}
          hint={`${agent.errorCount} errors`}
        />
        <StatCard
          icon={IconClockFilled}
          iconClassName="text-sky-300 dark:text-sky-700"
          size="sm"
          label="p95 latency"
          value={agent.p95}
          hint={`p50 ${agent.p50}`}
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-yellow-300 dark:text-yellow-600"
          size="sm"
          label="Total cost"
          value={agent.cost}
          hint={`${agent.totalTokens} tokens`}
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
            <AreaChart.EvilAreaChart
              config={volumeConfig}
              data={AGENT_SERIES}
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
              <AreaChart.Area dataKey="p50" strokeVariant="solid" />
              <AreaChart.Area dataKey="p95" strokeVariant="solid" />
              <AreaChart.Area dataKey="p99" strokeVariant="solid" />
            </AreaChart.EvilAreaChart>
          </CardContent>
        </Card>
      </section>

      {/* Typical call flow for a representative trace. */}
      <Card size="sm" className="pb-4">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Typical call flow
          </CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1.5">
              <IconGhost className="size-3.5" /> One representative run, step by
              step.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 mt-3">
          <NodeFlow nodes={nodes} />
        </CardContent>
      </Card>

      {/* Traces table — recent traces for this agent. */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Traces</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trace</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead className="text-right">Spans</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {AGENT_TRACES.map((t) => (
              <TableRow
                key={t.traceId}
                interactive
                onClick={() => openDetail({ type: "trace", id: t.traceId })}
                className={cn(
                  t.errors &&
                    "shadow-[inset_1px_0_0_0_var(--color-rose-500)]",
                )}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{t.name}</span>
                    {t.errors ? (
                      <Badge variant="rose" className="shrink-0 font-sans ml-auto">
                        <IconAlertTriangle />
                        {t.errors}
                        {t.errors === 1 ? " error" : " errors"}
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
                        openDetail({ type: "workflow", id: t.workflow! });
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
                <TableCell className="text-right tabular-nums">
                  {formatDuration(t.durationMs)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCost(t.cost)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {t.when}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
