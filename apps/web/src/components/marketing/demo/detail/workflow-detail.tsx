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
  IconTool,
} from "@tabler/icons-react";
import { useState } from "react";

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
} from "@/lib/format";

import { DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { WORKFLOW_FLOW, WORKFLOW_RUNS, WORKFLOW_SERIES, WORKFLOWS } from "../mock-data";

// The demo window is a fixed "Last 24 hours", so the bucket axis renders
// time-of-day labels.
const WINDOW_MS = 24 * 60 * 60 * 1000;
const bucketLabel = makeBucketLabel(WINDOW_MS);
const edgeTick = makeEdgeTick(bucketLabel);
const seriesTicks = thinTicks(
  WORKFLOW_SERIES.map((d) => d.bucket),
  bucketLabel,
);

const volumeConfig = {
  runs: { label: "Runs", colors: themed("var(--chart-2)") },
  errors: { label: "Errored", colors: themed("var(--destructive)") },
} satisfies ChartConfig;

const latencyConfig = {
  p50: { label: "p50", colors: themed("var(--chart-2)") },
  p95: { label: "p95", colors: themed("#0090FD") },
  p99: { label: "p99", colors: themed("#FF5513") },
} satisfies ChartConfig;

// Latency as a stacked band (p50, p95−p50, p99−p95); absolutes ride along for
// the tooltip. Same transform as the real workflow detail.
const latencyData = WORKFLOW_SERIES.map((r) => ({
  bucket: r.bucket,
  p50: r.p50,
  p95: Math.max(0, r.p95 - r.p50),
  p99: Math.max(0, r.p99 - r.p95),
  p50Abs: r.p50,
  p95Abs: r.p95,
  p99Abs: r.p99,
}));

export function WorkflowDetail({ workflowName }: { workflowName: string }) {
  const { closeDetail } = useDemo();
  const wf = WORKFLOWS.find((w) => w.name === workflowName) ?? WORKFLOWS[0]!;
  const wfNav = navItem("/workflows")!;

  const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
  const [latencySelected, setLatencySelected] = useState<string | null>(null);

  const nodes: FlowNode[] = WORKFLOW_FLOW.map((s) => ({
    id: s.id,
    icon:
      s.sublabel === "agent" ? (
        <IconBolt className="size-5 text-amber-500" />
      ) : (
        <IconTool className="size-5 text-blue-500" />
      ),
    label: s.label,
    sublabel: s.sublabel,
    status: s.status,
    timestamp: s.timestamp,
    durationMs: s.durationMs,
  }));

  return (
    <>
      <DetailHeader
        backIcon={wfNav.icon}
        backLabel="Workflows"
        backIconClassName={wfNav.iconClassName}
        title={wf.name}
        description="Grouped runs for this workflow."
        onBack={closeDetail}
      />

      {/* Stat strip — totals over all runs in the window. */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={IconBoltFilled}
          iconClassName="text-violet-300 dark:text-violet-700"
          size="sm"
          label="Runs"
          value={wf.runs}
          hint={`${wf.steps} steps`}
        />
        <StatCard
          icon={IconAlertTriangleFilled}
          iconClassName="text-rose-300 dark:text-rose-700"
          size="sm"
          label="Error rate"
          value={wf.errorRate}
          hint={`${wf.errors} errored`}
        />
        <StatCard
          icon={IconClockFilled}
          iconClassName="text-sky-300 dark:text-sky-700"
          size="sm"
          label="p95 duration"
          value={wf.p95}
          hint={`p50 ${wf.p50}`}
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-yellow-300 dark:text-yellow-600"
          size="sm"
          label="Total cost"
          value={wf.cost}
          hint={`${wf.tokens} tokens`}
        />
      </section>

      {/* Trend: run volume + run-duration percentiles over the window. */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Runs & errors</CardTitle>
            <ChartLegend
              config={volumeConfig}
              selected={volumeSelected}
              onSelect={setVolumeSelected}
            />
          </CardHeader>
          <CardContent className="mt-2">
            <AreaChart.EvilAreaChart
              config={volumeConfig}
              data={WORKFLOW_SERIES}
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
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Run duration</CardTitle>
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
              <AreaChart.Area dataKey="p50" strokeVariant="solid" />
              <AreaChart.Area dataKey="p95" strokeVariant="solid" />
              <AreaChart.Area dataKey="p99" strokeVariant="solid" />
            </AreaChart.EvilAreaChart>
          </CardContent>
        </Card>
      </section>

      {/* Step flow for the most recent run. */}
      <Card size="sm" className="pb-4">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Run flow
          </CardTitle>
          <CardDescription>One representative run, step by step.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 mt-3">
          <NodeFlow nodes={nodes} />
        </CardContent>
      </Card>

      {/* Runs table — recent runs for this workflow. */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Runs</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead className="text-right">Traces</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {WORKFLOW_RUNS.map((r) => (
              <TableRow
                key={r.runId}
                className={cn(
                  // Left accent bar on errored runs — scannable at a glance.
                  r.errorCount > 0 &&
                    "shadow-[inset_1px_0_0_0_var(--color-rose-500)]",
                )}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {r.displayName ?? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.runId}
                        </span>
                      )}
                    </span>
                    {r.errorCount > 0 && (
                      <Badge variant="rose" className="shrink-0 font-sans ml-auto">
                        <IconAlertTriangle />
                        {r.errorCount}
                        {r.errorCount === 1 ? " error" : " errors"}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(r.traces)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDuration(r.durationMs)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCost(r.cost)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {r.when}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
