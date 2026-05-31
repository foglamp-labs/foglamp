"use client";

import { IconActivity, IconChartAreaFilled } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
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
import { useMemo } from "react";

import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import * as BarChart from "@/components/evilcharts/charts/bar-chart";
import * as LineChart from "@/components/evilcharts/charts/line-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { useProject } from "@/components/app/project-context";
import { OnboardingPanel } from "@/components/app/onboarding-panel";
import {
  CardsSkeleton,
  EmptyState,
  NoProject,
  PageHeader,
  StatCard,
  TableSkeleton,
} from "@/components/app/page-parts";
import { RangePicker } from "@/components/app/range-picker";
import {
  formatCost,
  formatCount,
  formatDelta,
  formatDuration,
  formatPercent,
  formatRelative,
  formatTokens,
  projectMonthlyCost,
} from "@/lib/format";
import { useRange } from "@/components/app/range-context";
import { trpc } from "@/utils/trpc";
import { useRouter } from "next/navigation";

const MODEL_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// Evil Charts wants `colors: { light: [...], dark: [...] }`. Our --chart-* vars
// already adapt to the theme, so the same value works for both.
const themed = (color: string) => ({ light: [color], dark: [color] });

const latencyConfig = {
  p50: { label: "p50", colors: themed("var(--chart-2)") },
  p95: { label: "p95", colors: themed("var(--chart-1)") },
  p99: { label: "p99", colors: themed("var(--chart-3)") },
} satisfies ChartConfig;

const volumeConfig = {
  requests: { label: "Requests", colors: themed("var(--chart-2)") },
  errors: { label: "Errors", colors: themed("var(--destructive)") },
} satisfies ChartConfig;

function bucketLabel(bucket: string) {
  const d = new Date(`${bucket.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime())
    ? bucket
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function OverviewClient() {
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const router = useRouter();
  const { from, to } = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range],
  );
  const windowMs = range.to.getTime() - range.from.getTime();
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
  const costByModel = useQuery({
    ...trpc.metrics.costByModel.queryOptions(args),
    enabled,
  });
  const agents = useQuery({ ...trpc.agents.list.queryOptions(args), enabled });
  // Latest traces, polled for a live feel (independent of the range filter).
  const liveFeed = useQuery({
    ...trpc.traces.list.queryOptions({ projectId: projectId!, limit: 8 }),
    enabled,
    refetchInterval: 5000,
  });

  // p50/p95/p99 latency + TTFT and requests/errors per bucket.
  const seriesData = useMemo(
    () =>
      (timeseries.data ?? []).map((r) => ({
        label: bucketLabel(r.bucket),
        p50: r.latencyMs.p50,
        p95: r.latencyMs.p95,
        p99: r.latencyMs.p99,
        requests: r.spanCount,
        errors: r.errorCount,
      })),
    [timeseries.data]
  );

  // Top-5 models become stacked series (safe keys, since model ids contain
  // "/" and "."); everything else rolls into "Other".
  const { costData, costConfig } = useMemo(() => {
    const top = (models.data ?? []).slice(0, 5).map((m) => m.modelId);
    const keyOf = new Map(top.map((id, i) => [id, `m${i}`]));
    const config: ChartConfig = {};
    top.forEach((id, i) => {
      config[`m${i}`] = { label: id, colors: themed(MODEL_COLORS[i]!) };
    });
    let sawOther = false;
    const byBucket = new Map<string, Record<string, number>>();
    for (const r of costByModel.data ?? []) {
      const key = keyOf.get(r.modelId) ?? "other";
      if (key === "other") sawOther = true;
      const row = byBucket.get(r.bucket) ?? {};
      row[key] = (row[key] ?? 0) + (r.totalCost ?? 0);
      byBucket.set(r.bucket, row);
    }
    if (sawOther)
      config.other = {
        label: "Other",
        colors: themed("var(--muted-foreground)"),
      };
    // Typed with a string index so Evil Charts' ValidateConfigKeys accepts the
    // dynamic model keys (m0…/other) on the config.
    const data: Record<string, string | number>[] = [...byBucket.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([bucket, costs]) => ({ label: bucketLabel(bucket), ...costs }));
    return { costData: data, costConfig: config };
  }, [costByModel.data, models.data]);

  if (!projectId) {
    return (
      <>
        <PageHeader title="Overview" />
        <NoProject />
      </>
    );
  }

  const cur = summary.data?.current;
  const prev = summary.data?.previous;
  const costSeriesKeys = Object.keys(costConfig);
  const modelRows = models.data ?? [];
  const agentRows = agents.data ?? [];
  // Charts render their own shimmer via the `isLoading` prop instead of a skeleton.
  const costLoading = costByModel.isLoading || models.isLoading;
  const seriesLoading = timeseries.isLoading;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Cost, reliability, latency, and usage across this project."
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      {/* Onboarding — shown until this project has ever received a trace.
          liveFeed is range-independent, so empty == never received one; it
          flips to non-empty on the first span and this unmounts. */}
      {!liveFeed.isLoading && (liveFeed.data ?? []).length === 0 && (
        <OnboardingPanel />
      )}

      {/* KPIs */}
      {summary.isLoading ? (
        <CardsSkeleton count={6} />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard
            label="Total cost"
            value={formatCost(cur?.totalCost)}
            delta={formatDelta(cur?.totalCost, prev?.totalCost)}
            deltaInverted
            hint={`~${formatCost(projectMonthlyCost(cur?.totalCost ?? null, windowMs))}/mo · ${formatPercent(cur?.costCoverage)} priced`}
          />
          <StatCard
            label="Error rate"
            value={formatPercent(cur?.errorRate)}
            delta={formatDelta(cur?.errorRate, prev?.errorRate)}
            deltaInverted
            hint={`${formatCount(cur?.errorCount ?? 0)} of ${formatCount(cur?.spanCount ?? 0)} spans`}
          />
          <StatCard
            label="Eval pass rate"
            value={formatPercent(cur?.passRate)}
            delta={formatDelta(cur?.passRate, prev?.passRate)}
            hint={
              cur?.checkCount
                ? `${formatCount(cur.checkCount)} checks · scored traffic`
                : "No checks scored yet"
            }
          />
          <StatCard
            label="Latency p95"
            value={formatDuration(cur?.latencyMs.p95 ?? 0)}
            delta={formatDelta(cur?.latencyMs.p95, prev?.latencyMs.p95)}
            deltaInverted
            hint={`p50 ${formatDuration(cur?.latencyMs.p50 ?? 0)} · TTFT p95 ${formatDuration(cur?.ttftMs.p95 ?? 0)}`}
          />
          <StatCard
            label="Requests"
            value={formatCount(cur?.spanCount ?? 0)}
            delta={formatDelta(cur?.spanCount, prev?.spanCount)}
            hint={`${formatCount(cur?.llmSpanCount ?? 0)} LLM spans`}
          />
          <StatCard
            label="Tokens"
            value={formatTokens(cur?.totalTokens ?? 0)}
            delta={formatDelta(cur?.totalTokens, prev?.totalTokens)}
            hint={`${formatTokens(cur?.inputTokens ?? 0)} in · ${formatTokens(cur?.outputTokens ?? 0)} out`}
          />
        </section>
      )}

      {/* Cost over time, stacked by model */}
      <Card>
        <CardHeader>
          <CardTitle>Cost over time</CardTitle>
          <CardDescription>Spend per minute, stacked by model.</CardDescription>
        </CardHeader>
        <CardContent>
          {!costLoading && costData.length === 0 ? (
            <EmptyState
              icon={IconChartAreaFilled}
              title="No data in this range"
              description="Instrument a call with the SDK to populate this chart."
            />
          ) : (
            <AreaChart.EvilAreaChart
              config={costConfig}
              data={costData}
              isLoading={costLoading}
              xDataKey="label"
              stackType="stacked"
              curveType="monotone"
              className="h-[260px] w-full"
            >
              <AreaChart.Grid />
              <AreaChart.XAxis dataKey="label" />
              <AreaChart.Tooltip />
              {costSeriesKeys.map((k) => (
                <AreaChart.Area key={k} dataKey={k} />
              ))}
              <AreaChart.Legend />
            </AreaChart.EvilAreaChart>
          )}
        </CardContent>
      </Card>

      {/* Volume + errors and latency, side by side */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Requests & errors</CardTitle>
            <CardDescription>
              Spans per minute; errors overlaid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!seriesLoading && seriesData.length === 0 ? (
              <EmptyState
                icon={IconChartAreaFilled}
                title="No data in this range"
              />
            ) : (
              <BarChart.EvilBarChart
                config={volumeConfig}
                data={seriesData}
                isLoading={seriesLoading}
                xDataKey="label"
                className="h-[260px] w-full"
              >
                <BarChart.Grid />
                <BarChart.XAxis dataKey="label" />
                <BarChart.Tooltip />
                <BarChart.Bar dataKey="requests" />
                <BarChart.Bar dataKey="errors" />
              </BarChart.EvilBarChart>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latency</CardTitle>
            <CardDescription>p50 / p95 / p99 per minute (ms).</CardDescription>
          </CardHeader>
          <CardContent>
            {!seriesLoading && seriesData.length === 0 ? (
              <EmptyState
                icon={IconChartAreaFilled}
                title="No data in this range"
              />
            ) : (
              <LineChart.EvilLineChart
                config={latencyConfig}
                data={seriesData}
                isLoading={seriesLoading}
                xDataKey="label"
                className="h-[260px] w-full"
              >
                <LineChart.Grid />
                <LineChart.XAxis dataKey="label" />
                <LineChart.Tooltip />
                <LineChart.Line dataKey="p50" />
                <LineChart.Line dataKey="p95" />
                <LineChart.Line dataKey="p99" />
              </LineChart.EvilLineChart>
            )}
          </CardContent>
        </Card>
      </section>

      {/* By model + by agent, side by side */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By model</CardTitle>
            <CardDescription>
              Spend, usage, and latency per model.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {models.isLoading ? (
              <TableSkeleton />
            ) : modelRows.length === 0 ? (
              <EmptyState
                icon={IconChartAreaFilled}
                title="No model usage yet"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">p95</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelRows.map((m) => (
                    <TableRow key={m.modelId}>
                      <TableCell className="font-mono text-xs">
                        {m.modelId}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(m.spanCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTokens(m.totalTokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(m.latencyMs.p95)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCost(m.totalCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By agent</CardTitle>
            <CardDescription>
              Spend, errors, and latency per agent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {agents.isLoading ? (
              <TableSkeleton />
            ) : agentRows.length === 0 ? (
              <EmptyState
                icon={IconChartAreaFilled}
                title="No agent activity yet"
                description="Set agentName on a call to group it under an agent."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                    <TableHead className="text-right">p95</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentRows.map((a) => (
                    <TableRow key={a.agentName}>
                      <TableCell className="truncate font-medium">
                        {a.agentName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(a.spanCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(a.errorCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(a.latencyMs.p95)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCost(a.totalCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Live feed — latest traces, auto-refreshed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live feed
          </CardTitle>
          <CardDescription>
            The latest traces, refreshed automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {liveFeed.isLoading ? (
            <TableSkeleton rows={4} />
          ) : (liveFeed.data ?? []).length === 0 ? (
            <EmptyState
              icon={IconActivity}
              title="No traces yet"
              description="Instrument a call with the SDK to see it appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trace</TableHead>
                  <TableHead className="text-right">Spans</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(liveFeed.data ?? []).map((t) => (
                  <TableRow
                    key={t.traceId}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/traces/${encodeURIComponent(t.traceId)}`)
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="truncate">
                          {t.traceName ??
                            t.agentName ??
                            `${t.traceId.slice(0, 12)}…`}
                        </span>
                        {t.errorCount > 0 && (
                          <Badge variant="rose">{t.errorCount} err</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(t.spanCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(t.totalTokens)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCost(t.totalCost)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatRelative(t.startTime)}
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
