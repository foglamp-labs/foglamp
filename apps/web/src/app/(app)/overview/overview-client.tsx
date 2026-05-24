"use client";

import { IconChartArea } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@watchtower/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@watchtower/ui/components/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@watchtower/ui/components/table";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis } from "recharts";

import { useProject } from "@/components/app/project-context";
import {
  CardsSkeleton,
  EmptyState,
  NoProject,
  PageHeader,
  StatCard,
} from "@/components/app/page-parts";
import { RangePicker } from "@/components/app/range-picker";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatPercent,
  formatTokens,
} from "@/lib/format";
import { resolveRange, type RangeKey } from "@/lib/range";
import { trpc } from "@/utils/trpc";

const costConfig = {
  totalCost: { label: "Cost", color: "var(--chart-1)" },
} satisfies ChartConfig;

const latencyConfig = {
  p50: { label: "p50", color: "var(--chart-2)" },
  p95: { label: "p95", color: "var(--chart-1)" },
  p99: { label: "p99", color: "var(--chart-3)" },
} satisfies ChartConfig;

function bucketLabel(bucket: string) {
  const d = new Date(`${bucket.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime())
    ? bucket
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function OverviewClient() {
  const { projectId } = useProject();
  const [range, setRange] = useState<RangeKey>("24h");
  const { from, to } = useMemo(() => resolveRange(range), [range]);
  const enabled = !!projectId;
  const args = { projectId: projectId!, from, to };

  const summary = useQuery({
    ...trpc.metrics.summary.queryOptions(args),
    enabled,
  });
  const timeseries = useQuery({
    ...trpc.metrics.timeseries.queryOptions(args),
    enabled,
  });
  const models = useQuery({
    ...trpc.metrics.models.queryOptions(args),
    enabled,
  });

  const chartData = useMemo(
    () =>
      (timeseries.data ?? []).map((r) => ({
        label: bucketLabel(r.bucket),
        totalCost: r.totalCost ?? 0,
        p50: r.latencyMs.p50,
        p95: r.latencyMs.p95,
        p99: r.latencyMs.p99,
      })),
    [timeseries.data],
  );

  if (!projectId) {
    return (
      <>
        <PageHeader title="Overview" />
        <NoProject />
      </>
    );
  }

  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Cost, latency, and token usage across this project."
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      {summary.isLoading ? (
        <CardsSkeleton />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total cost"
            value={formatCost(s?.totalCost)}
            hint={`Coverage ${formatPercent(s?.costCoverage)} of LLM spans priced`}
          />
          <StatCard
            label="Requests"
            value={formatCount(s?.spanCount ?? 0)}
            hint={`${formatCount(s?.llmSpanCount ?? 0)} LLM · ${formatCount(
              s?.errorCount ?? 0,
            )} errors`}
          />
          <StatCard
            label="Latency p95"
            value={formatDuration(s?.latencyMs.p95 ?? 0)}
            hint={`p50 ${formatDuration(s?.latencyMs.p50 ?? 0)} · p99 ${formatDuration(
              s?.latencyMs.p99 ?? 0,
            )}`}
          />
          <StatCard
            label="Tokens"
            value={formatTokens(s?.totalTokens ?? 0)}
            hint={`TTFT p95 ${formatDuration(s?.ttftMs.p95 ?? 0)}`}
          />
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cost over time</CardTitle>
          <CardDescription>Spend per minute bucket.</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <EmptyState
              icon={IconChartArea}
              title="No data in this range"
              description="Instrument a call with the SDK to populate this chart."
            />
          ) : (
            <ChartContainer
              config={costConfig}
              className="aspect-auto h-[260px] w-full"
            >
              <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      formatter={(value) => formatCost(Number(value))}
                    />
                  }
                />
                <Area
                  dataKey="totalCost"
                  type="monotone"
                  fill="var(--color-totalCost)"
                  fillOpacity={0.15}
                  stroke="var(--color-totalCost)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latency</CardTitle>
          <CardDescription>p50 / p95 / p99 per bucket (ms).</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <EmptyState
              icon={IconChartArea}
              title="No data in this range"
            />
          ) : (
            <ChartContainer
              config={latencyConfig}
              className="aspect-auto h-[260px] w-full"
            >
              <LineChart data={chartData} margin={{ left: 0, right: 0, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => `${name}: ${formatDuration(Number(value))}`}
                    />
                  }
                />
                <Line dataKey="p50" stroke="var(--color-p50)" dot={false} strokeWidth={2} />
                <Line dataKey="p95" stroke="var(--color-p95)" dot={false} strokeWidth={2} />
                <Line dataKey="p99" stroke="var(--color-p99)" dot={false} strokeWidth={2} />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By model</CardTitle>
          <CardDescription>Spend and usage per model.</CardDescription>
        </CardHeader>
        <CardContent>
          {(models.data ?? []).length === 0 ? (
            <EmptyState icon={IconChartArea} title="No model usage yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(models.data ?? []).map((m) => (
                  <TableRow key={m.modelId}>
                    <TableCell className="font-mono text-xs">{m.modelId}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(m.spanCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(m.totalTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCost(m.totalCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
