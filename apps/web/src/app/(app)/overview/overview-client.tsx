"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@foglamp/ui/components/empty";
import { Skeleton } from "@foglamp/ui/components/skeleton";
import {
  IconAlertTriangleFilled,
  IconBoxModel,
  IconBoxModel2,
  IconChartAreaFilled,
  IconCircleCheckFilled,
  IconCirclesFilled,
  IconCoinFilled,
  IconCpu,
  IconGaugeFilled,
  IconGhostFilled,
  IconSitemapFilled,
  IconUserFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AgentIcon, agentColor } from "@/components/app/agent-icon";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { useDelayedLoading, useEntranceOnce } from "@/components/app/hooks";
import { navItem } from "@/components/app/nav";
import { OnboardingPanel } from "@/components/app/onboarding-panel";
import {
  CardSparkline,
  CardSparklinePlaceholder,
  EmptyState,
  NoProject,
  PageHeader,
  PillMeter,
  ScrollFade,
  StatCard,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import {
  fillBuckets,
  formatBucketFull,
  makeBucketLabel,
  makeEdgeTick,
  thinTicks,
  useFrozen,
  useZoomRange,
} from "@/components/app/trend-charts";
import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import * as BarChart from "@/components/evilcharts/charts/bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import {
  ModelLogo,
  formatModelName,
  modelBrandColor,
} from "@/components/model-logo";
import { OverviewHeader } from "./header";

import { useRange } from "@/components/app/range-context";
import {
  formatCost,
  formatCount,
  formatDelta,
  formatDuration,
  formatPercent,
  formatTokens,
  projectMonthlyCost,
} from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { cn } from "@foglamp/ui/lib/utils";

// Fallback palette for model series whose vendor has no brand color.
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

/** Mix a hex color toward white (t > 0) or black (t < 0). Non-hex values
 * (CSS vars) pass through untouched. */
function shadeHex(hex: string, t: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m || t === 0) return hex;
  const n = Number.parseInt(m[1]!, 16);
  const target = t > 0 ? 255 : 0;
  const f = Math.abs(t);
  const mix = (c: number) => Math.round(c + (target - c) * f);
  const [r, g, b] = [n >> 16, (n >> 8) & 0xff, n & 0xff].map(mix);
  return `#${((r! << 16) | (g! << 8) | b!).toString(16).padStart(6, "0")}`;
}

// Shade sequence for models sharing a vendor brand color: the first keeps the
// brand tone, later ones lighten/darken it so same-vendor series stay apart.
const VENDOR_SHADE_STEPS = [0, 0.35, -0.28, 0.6];

// Series config for the blurred sample cost chart shown behind the empty state
// (fake but plausible model names — the chart is decorative, never interactive).
const SAMPLE_COST_CONFIG: ChartConfig = {
  m0: { label: "gpt-4o", colors: themed(MODEL_COLORS[0]!) },
  m1: { label: "claude-sonnet-4", colors: themed(MODEL_COLORS[1]!) },
};

// Cost Y-axis ticks: currency capped at 3 decimals so labels stay short
// (e.g. "$0.026"), unlike the full 6-digit precision used elsewhere.
const costAxisUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 3,
});

const latencyConfig = {
  // neutral-800 on light, neutral-200 on dark
  p50: { label: "p50", colors: { light: ["#262626"], dark: ["#e5e5e5"] } },
  p95: { label: "p95", colors: themed("#0090FD") },
  p99: { label: "p99", colors: themed("#FF5513") },
} satisfies ChartConfig;

const volumeConfig = {
  requests: { label: "Requests", colors: themed("var(--chart-2)") },
  errors: { label: "Errors", colors: themed("var(--destructive)") },
} satisfies ChartConfig;

type LegendItem = {
  key: string;
  label: React.ReactNode;
  color?: string;
  logo?: React.ReactNode;
};

/** Clickable legend for the trend charts. Lives in the card header so it lines
 * up with the description, and drives the chart's selection in a controlled way. */
function ChartLegend({
  items,
  selected,
  onSelect,
}: {
  items: LegendItem[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 select-none">
      {items.map((it) => {
        const dimmed = selected !== null && selected !== it.key;
        const active = selected === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onSelect(active ? null : it.key)}
            className={cn(
              "text-muted-foreground flex cursor-pointer items-center gap-1.5 text-sm transition-all hover:text-foreground",
              dimmed && "opacity-30",
              active && "text-foreground"
            )}
          >
            {it.color && (
              <span
                className="h-2 w-2 shrink-0 rounded-2xl corner-squircle"
                style={{ backgroundColor: it.color }}
              />
            )}
            {it.logo}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Loading rows for a breakdown list card — one blob per BreakdownRow slot
 * (icon + name on the left, value + share bar on the right) at the real row
 * height, capped at the list's scroll height.
 * Invisible until `skeleton` flips (see useDelayedLoading), so the card holds
 * its final height from the first paint and fast loads never flash shimmer. */
function BreakdownRowsSkeleton({
  rows = 5,
  skeleton,
}: {
  rows?: number;
  skeleton: boolean;
}) {
  return (
    // Rendered inside the card's one ScrollFade (shared with the loaded rows)
    // so the fade never remounts when the data lands. Invisible until the
    // skeleton delay elapses; the fade over a blank card is invisible too.
    <div
      className={cn("divide-y divide-border/40 pb-6", !skeleton && "invisible")}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-6 px-5 py-3"
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Skeleton className="size-3.5 shrink-0 rounded-full squircle:rounded-full" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-12" />
            </div>
            <Skeleton className="h-0.5 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** When `empty`, the children (a chart fed with sample data) render blurred
 * and inert behind a floating "no data" notice — a preview of what the page
 * will look like, instead of an empty dashed box. Otherwise renders children
 * untouched. */
function MaybeEmptyOverlay({
  empty,
  description,
  children,
}: {
  empty: boolean;
  description?: string;
  children: React.ReactNode;
}) {
  if (!empty) return <>{children}</>;
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none select-none opacity-50 blur-[3px]"
      >
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <Empty className="border-none bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconChartAreaFilled className="opacity-40" />
            </EmptyMedia>
            <EmptyContent>
              <EmptyTitle>No data in this range</EmptyTitle>
              {description && (
                <EmptyDescription>{description}</EmptyDescription>
              )}
            </EmptyContent>
          </EmptyHeader>
        </Empty>
      </div>
    </div>
  );
}

/** A ranked breakdown entry. Left column: a small glyph + name, with secondary
 * metrics beneath. Right column (right-aligned): the cost, and a share bar capped
 * at 60% of the row width. Rows sit in a `divide-y` list, so each is separated by
 * a hairline border. */
function BreakdownRow({
  renderIcon,
  title,
  value,
  fraction,
  color,
  href,
}: {
  renderIcon: (className: string) => React.ReactNode;
  title: string;
  value: React.ReactNode;
  fraction: number;
  color: string;
  href?: Route;
}) {
  // The list is `divide-y`, so each row draws the edge beneath it. Like the
  // table rows, a hovered link hides its own bottom edge and the row above it
  // hides its bottom edge too, so the highlight reads as one seamless block.
  const rowClassName =
    "flex items-center justify-between gap-6 py-3 px-5 has-[+a:hover]:border-transparent";
  const inner = (
    <>
      {/* Left: name + secondary metrics. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {renderIcon("size-3.5 shrink-0")}
          <span className="truncate text-sm font-normal">{title}</span>
        </div>
      </div>
      {/* Right: cost + share bar, both right-aligned. The column sizes to its
          content (never squeezing the value), with a fixed-width bar track. */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-sm tabular-nums">{value}</span>
        <div className="h-0.5 w-14 overflow-hidden rounded-full bg-muted-foreground/10">
          <div
            className="ml-auto h-full rounded-full"
            style={{
              width: `${Math.max(2, fraction * 100)}%`,
              backgroundColor: color,
            }}
          />
        </div>
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          rowClassName,
          "transition-colors hover:border-transparent hover:bg-muted/50"
        )}
      >
        {inner}
      </Link>
    );
  }
  return <div className={rowClassName}>{inner}</div>;
}

export function OverviewClient() {
  const entrance = useEntranceOnce();
  const { projectId } = useProject();
  const { range, setRange } = useRange();
  const { resolvedTheme } = useTheme();
  const { from, to } = useMemo(
    () => ({ from: range.from.toISOString(), to: range.to.toISOString() }),
    [range]
  );
  const windowMs = range.to.getTime() - range.from.getTime();
  const enabled = !!projectId;
  const args = { projectId: projectId!, from, to };
  const zoom = useZoomRange();

  // Per-chart selected series, driven by the header legends.
  const [costSelected, setCostSelected] = useState<string | null>(null);
  const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
  const [latencySelected, setLatencySelected] = useState<string | null>(null);

  // A new range brings a new series set (cost keys are per-model, m0…mN), so a
  // selection carried over from the old range could point at nothing.
  useEffect(() => {
    setCostSelected(null);
    setVolumeSelected(null);
    setLatencySelected(null);
  }, [from, to]);

  // Every range-driven query keeps the previous range's data on screen while
  // the new one loads (placeholderData) — a date change updates the cards in
  // place instead of unmounting them to skeletons and back.
  const summary = useQuery({
    ...trpc.metrics.summary.queryOptions(args),
    enabled,
    placeholderData: (prev) => prev,
  });
  const timeseries = useQuery({
    ...trpc.metrics.timeseries.queryOptions(args),
    enabled,
    placeholderData: (prev) => prev,
  });
  const models = useQuery({
    ...trpc.metrics.models.queryOptions(args),
    enabled,
    placeholderData: (prev) => prev,
  });
  const costByModel = useQuery({
    ...trpc.metrics.costByModel.queryOptions(args),
    enabled,
    placeholderData: (prev) => prev,
  });
  // Top agents by cost for the "By agent" card (server default sort is cost desc).
  const agents = useQuery({
    ...trpc.agents.list.queryOptions({ ...args, limit: 100 }),
    enabled,
    placeholderData: (prev) => prev,
  });
  // Top workflows by cost for the "By workflow" card (the server's default sort
  // is last-run, so ask for cost desc explicitly).
  const workflows = useQuery({
    ...trpc.workflows.list.queryOptions({
      ...args,
      limit: 100,
      sort: { field: "cost", dir: "desc" },
    }),
    enabled,
    placeholderData: (prev) => prev,
  });
  // Top customers by cost for the "Customers" card (server default sort is cost desc).
  const customers = useQuery({
    ...trpc.customers.list.queryOptions({
      ...args,
      limit: 100,
      includeUnidentified: true,
    }),
    enabled,
    placeholderData: (prev) => prev,
  });
  // Range-independent probe: empty == this project has never received a trace,
  // which gates the onboarding panel.
  const everReceived = useQuery({
    ...trpc.traces.list.queryOptions({ projectId: projectId!, limit: 1 }),
    enabled,
  });
  // Alert rules, for threshold lines on the latency chart. Range-independent.
  const alerts = useQuery({
    ...trpc.alerts.list.queryOptions({ projectId: projectId! }),
    enabled,
  });
  // Project-wide latency alerts (no eval, no model/agent/workflow/metadata
  // scoping — those wouldn't match what this chart aggregates), drawn as
  // dashed threshold lines. The stacked bands top out at the absolute
  // percentile values, so a horizontal line at the threshold is exact.
  const latencyThresholds = useMemo(
    () =>
      (alerts.data ?? []).filter(
        (r) =>
          r.enabled &&
          r.threshold != null &&
          !r.evalId &&
          (r.metric === "latency_p50" ||
            r.metric === "latency_p95" ||
            r.metric === "latency_p99") &&
          !r.filters?.modelId &&
          !r.filters?.agentName &&
          !r.filters?.workflowName &&
          Object.keys(r.filters?.metadata ?? {}).length === 0
      ),
    [alerts.data]
  );
  // Every card shell mounts immediately; only the data slots wait. Each slot
  // gates on its own queries, and the skeleton treatment is delayed per slot
  // (see useDelayedLoading) so fast loads paint data straight into the shell
  // while slow ones shimmer. `isLoading` is only true on the first fetch, so a
  // range change keeps placeholderData on screen instead of regressing.
  const statsLoading = summary.isLoading || timeseries.isLoading;
  const modelsLoading = models.isLoading;
  const agentsLoading = agents.isLoading;
  const workflowsLoading = workflows.isLoading;
  const customersLoading = customers.isLoading;
  const statsSkeleton = useDelayedLoading(statsLoading);
  const modelsSkeleton = useDelayedLoading(modelsLoading);
  const agentsSkeleton = useDelayedLoading(agentsLoading);
  const workflowsSkeleton = useDelayedLoading(workflowsLoading);
  const customersSkeleton = useDelayedLoading(customersLoading);

  // While a range change refetches, every chart holds the previous view — the
  // rows *and* the window they were fetched for, so fill, ticks, and label
  // format stay mutually consistent — dimmed (isUpdating), then swaps to the
  // fresh view in one transition. All charts share one freshness flag so the
  // page moves together instead of chart by chart.
  const chartsStale =
    timeseries.isPlaceholderData ||
    costByModel.isPlaceholderData ||
    models.isPlaceholderData;
  const chartView = useFrozen(
    {
      series: timeseries.data,
      cost: costByModel.data,
      models: models.data,
      from: range.from,
      to: range.to,
    },
    chartsStale
  );
  const chartWindowMs = chartView.to.getTime() - chartView.from.getTime();
  const bucketLabel = useMemo(
    () => makeBucketLabel(chartWindowMs),
    [chartWindowMs]
  );
  const edgeTick = useMemo(() => makeEdgeTick(bucketLabel), [bucketLabel]);

  // p50/p95/p99 latency + requests/errors per bucket, zero-filled so quiet
  // stretches keep their width on the x-axis. Keeps the raw bucket as the x
  // value (formatted on the axis) so we can thin the ticks.
  const seriesData = useMemo(
    () =>
      fillBuckets(
        (chartView.series ?? []).map((r) => ({
          bucket: r.bucket,
          p50: r.latencyMs.p50,
          p95: r.latencyMs.p95,
          p99: r.latencyMs.p99,
          requests: r.spanCount,
          errors: r.errorCount,
          tokens: r.totalTokens,
          cost: r.totalCost ?? 0,
        })),
        chartView.from,
        chartView.to,
        (bucket) => ({
          bucket,
          p50: 0,
          p95: 0,
          p99: 0,
          requests: 0,
          errors: 0,
          tokens: 0,
          cost: 0,
        })
      ),
    [chartView]
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

  // Is the final bucket the current, still-filling one? True when "now" still
  // falls inside the last bucket's window (its start + one bucket's width),
  // which holds for now-anchored ranges but not historical ones (e.g. "Last
  // month"). Drives the dashed trailing segment on the trend charts. Bucket
  // width is read from the data so it tracks whatever cadence the server picked.
  const lastBucketLive = useMemo(() => {
    if (seriesData.length < 2) return false;
    const ms = (b: string) => new Date(`${b.replace(" ", "T")}Z`).getTime();
    const last = ms(seriesData[seriesData.length - 1]!.bucket);
    const prev = ms(seriesData[seriesData.length - 2]!.bucket);
    if (Number.isNaN(last) || Number.isNaN(prev)) return false;
    return Date.now() < last + (last - prev);
  }, [seriesData]);

  // Top-5 models become stacked series (safe keys, since model ids contain
  // "/" and "."); everything else rolls into "Other". Colors track each
  // model's brand so the chart and the "By model" list stay consistent.
  const { costData, costConfig, costItems, costTicks } = useMemo(() => {
    const top = (chartView.models ?? []).slice(0, 5).map((m) => m.modelId);
    const keyOf = new Map(top.map((id, i) => [id, `m${i}`]));
    const config: ChartConfig = {};
    const items: LegendItem[] = [];
    // Models from the same vendor share a brand color — count repeats and
    // shift each repeat's shade so their series stay distinguishable.
    const brandSeen = new Map<string, number>();
    top.forEach((id, i) => {
      const key = `m${i}`;
      const base = modelBrandColor(null, id) ?? MODEL_COLORS[i]!;
      const repeat = brandSeen.get(base) ?? 0;
      brandSeen.set(base, repeat + 1);
      const color = shadeHex(
        base,
        VENDOR_SHADE_STEPS[repeat % VENDOR_SHADE_STEPS.length]!
      );
      config[key] = {
        label: formatModelName(id),
        colors: themed(color),
        // Shows the brand logo (instead of a color swatch) in the tooltip.
        icon: () => <ModelLogo modelId={id} className="size-3.5" />,
      };
      items.push({
        key,
        label: formatModelName(id),
        color,
        logo: <ModelLogo modelId={id} className="size-3.5" />,
      });
    });
    let sawOther = false;
    const byBucket = new Map<string, Record<string, number>>();
    // Seed every bucket (including zero-cost ones, taken from the zero-filled
    // series) so the stacked bars stay continuous — and index-aligned with the
    // other synced charts — instead of skipping buckets with no spend.
    for (const r of seriesData) {
      byBucket.set(r.bucket, {});
    }
    for (const r of chartView.cost ?? []) {
      // The series grid is authoritative: while the two queries refetch at
      // different speeds (a range change), rows for buckets outside it would
      // stretch the axis across both the old and new windows — drop them.
      const row = byBucket.get(r.bucket);
      if (!row) continue;
      const key = keyOf.get(r.modelId) ?? "other";
      if (key === "other") sawOther = true;
      row[key] = (row[key] ?? 0) + (r.totalCost ?? 0);
    }
    if (sawOther) {
      config.other = {
        label: "Other",
        colors: themed("var(--muted-foreground)"),
      };
      items.push({
        key: "other",
        label: "Other",
        color: "var(--muted-foreground)",
      });
    }
    const seriesKeys = [
      ...top.map((_, i) => `m${i}`),
      ...(sawOther ? ["other"] : []),
    ];
    // Typed with a string index so Evil Charts' ValidateConfigKeys accepts the
    // dynamic model keys (m0…/other) on the config. Every key is filled to 0 so
    // Recharts never sees an undefined value (which would break the area). The
    // raw bucket stays as the x value so we can thin the ticks on the axis.
    const sorted = [...byBucket.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    const data: Record<string, string | number>[] = sorted.map(
      ([bucket, costs]) => {
        const row: Record<string, string | number> = { bucket };
        for (const k of seriesKeys) row[k] = costs[k] ?? 0;
        return row;
      }
    );
    const ticks = thinTicks(
      sorted.map(([bucket]) => bucket),
      bucketLabel
    );
    return {
      costData: data,
      costConfig: config,
      costItems: items,
      costTicks: ticks,
    };
  }, [chartView, seriesData, bucketLabel]);

  // Deterministic sample series for the blurred empty-state preview: buckets
  // span the selected range like the live query's would; shapes are sine waves
  // with index-seeded jitter (no Math.random, so renders are stable).
  const sample = useMemo(() => {
    const n = 24;
    const from = range.from.getTime();
    const span = range.to.getTime() - from;
    const rows = Array.from({ length: n }, (_, i) => {
      const bucket = new Date(from + (span * i) / (n - 1)).toISOString();
      const wave = 0.5 + 0.5 * Math.sin(i / 2.6);
      const jitter = ((i * 7919) % 13) / 13;
      const requests = Math.round(180 + wave * 520 + jitter * 140);
      const p50 = Math.round(240 + wave * 180 + jitter * 70);
      const p95 = Math.round(p50 * (1.9 + 0.4 * jitter));
      return {
        bucket,
        requests,
        errors: Math.round(requests * (0.01 + 0.035 * (((i * 31) % 7) / 7))),
        p50,
        p95,
        p99: Math.round(p95 * (1.35 + 0.25 * wave)),
      };
    });
    const cost: Record<string, string | number>[] = rows.map((r, i) => {
      const wave = 0.5 + 0.5 * Math.sin(i / 2.6);
      const jitter = ((i * 7919) % 13) / 13;
      return {
        bucket: r.bucket,
        m0: +(0.9 + wave * 2.1 + jitter * 0.5).toFixed(3),
        m1: +(0.4 + (1 - wave) * 1.3 + jitter * 0.3).toFixed(3),
      };
    });
    return {
      series: rows,
      latency: rows.map((r) => ({
        bucket: r.bucket,
        p50: r.p50,
        p95: Math.max(0, r.p95 - r.p50),
        p99: Math.max(0, r.p99 - r.p95),
        p50Abs: r.p50,
        p95Abs: r.p95,
        p99Abs: r.p99,
      })),
      cost,
      ticks: thinTicks(
        rows.map((r) => r.bucket),
        bucketLabel
      ),
    };
  }, [range, bucketLabel]);

  if (!projectId) {
    return (
      <>
        <PageHeader
          title="Overview"
          icon={navItem("/overview")?.icon}
          iconClassName={navItem("/overview")?.iconClassName}
        />
        <NoProject />
      </>
    );
  }

  const cur = summary.data?.current;
  const prev = summary.data?.previous;
  const costSeriesKeys = Object.keys(costConfig);
  const modelRows = models.data ?? [];
  const agentRows = agents.data?.agents ?? [];
  const workflowRows = workflows.data?.workflows ?? [];
  const customerRows = customers.data?.customers ?? [];
  const maxModelCost = Math.max(1, ...modelRows.map((m) => m.totalCost ?? 0));
  const maxAgentCost = Math.max(1, ...agentRows.map((a) => a.totalCost ?? 0));
  const maxWorkflowCost = Math.max(
    1,
    ...workflowRows.map((w) => w.totalCost ?? 0)
  );
  const maxCustomerCost = Math.max(
    1,
    ...customerRows.map((c) => c.totalCost ?? 0)
  );
  // Chart load flags: drive each chart's own loading treatment, and gate the
  // empty state so a chart is only "empty" once its queries have resolved.
  const costLoading = costByModel.isLoading || models.isLoading;
  const seriesLoading = timeseries.isLoading;

  // Empty charts render blurred sample data behind a floating notice instead
  // of a bare empty state (see MaybeEmptyOverlay).
  const costEmpty = !costLoading && costData.length === 0;
  const seriesEmpty = !seriesLoading && seriesData.length === 0;
  const costChartData = costEmpty ? sample.cost : costData;
  const costChartConfig = costEmpty ? SAMPLE_COST_CONFIG : costConfig;
  const costChartKeys = costEmpty
    ? Object.keys(SAMPLE_COST_CONFIG)
    : costSeriesKeys;
  const costChartTicks = costEmpty ? sample.ticks : costTicks;
  const volumeChartData = seriesEmpty ? sample.series : seriesData;
  const latencyChartData = seriesEmpty ? sample.latency : latencyData;
  const seriesChartTicks = seriesEmpty ? sample.ticks : seriesTicks;
  // Dash the trailing segment only on live ranges with real data — never on the
  // blurred sample shown behind an empty state.
  const costBuffer = lastBucketLive && !costEmpty;
  const seriesBuffer = lastBucketLive && !seriesEmpty;

  const volumeItems: LegendItem[] = Object.entries(volumeConfig).map(
    ([key, entry]) => ({
      key,
      label: entry.label,
      color: entry.colors.light[0],
    })
  );
  const latencyItems: LegendItem[] = Object.entries(latencyConfig).map(
    ([key, entry]) => ({
      key,
      label: entry.label,
      color: (resolvedTheme === "dark"
        ? entry.colors.dark
        : entry.colors.light)[0],
    })
  );

  // The fade class goes on each card slot (not the page wrapper) so cards
  // animate at the moment they mount — which is when their query resolves,
  // after the header is already on screen. `entrance` stays true for the whole
  // first visit, so late-mounting cards still fade on a hard load; on later
  // client-side visits everything renders instantly.
  return (
    <>
      {/* Wrapped here (not inside OverviewHeader) so the copy rendered by
          loading.tsx stays unanimated — only the page's own header fades. */}
      <div className={cn(entrance && "page-fade-in")}>
        <OverviewHeader />
      </div>

      {/* Onboarding — shown until this project has ever received a trace.
          Gated on pageLoading so it mounts with the rest of the page instead
          of popping in and pushing content down. */}
      {!everReceived.isLoading &&
        (everReceived.data?.traces ?? []).length === 0 && <OnboardingPanel />}

      {/* KPIs — the icon + label shell is always on screen; the value, hint,
          delta, and chart slots fill in when the summary lands (or shimmer
          once the load outruns the skeleton delay). */}
      <section
        className={cn(
          "grid gap-4 md:grid-cols-2 xl:grid-cols-4 px-8 mt-1",
          entrance && "page-fade-in"
        )}
      >
        <StatCard
          icon={IconCirclesFilled}
          iconClassName="text-sky-400 dark:text-sky-500"
          label="Tokens"
          href="/traces?sort=tokens:desc"
          size="sm"
          loading={statsLoading}
          skeleton={statsSkeleton}
          chartPlaceholder={<CardSparklinePlaceholder />}
          value={cur?.totalTokens ?? 0}
          formatValue={formatTokens}
          delta={formatDelta(cur?.totalTokens, prev?.totalTokens)}
          hint={`${formatTokens(cur?.inputTokens ?? 0)} in · ${formatTokens(cur?.outputTokens ?? 0)} out`}
          chart={
            <CardSparkline
              data={seriesData.map((d) => d.tokens)}
              className="text-blue-400/50 dark:text-sky-600/40"
            />
          }
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-amber-400 dark:text-yellow-500"
          label="Total cost"
          href="/traces?sort=cost:desc"
          size="sm"
          loading={statsLoading}
          skeleton={statsSkeleton}
          chartPlaceholder={<CardSparklinePlaceholder />}
          value={cur?.totalCost ?? "—"}
          formatValue={(n) => formatCost(n, 2)}
          delta={formatDelta(cur?.totalCost, prev?.totalCost)}
          deltaInverted
          hint={`~${formatCost(projectMonthlyCost(cur?.totalCost ?? null, windowMs), 2)}/mo`}
          chart={
            <CardSparkline
              data={seriesData.map((d) => d.cost)}
              className="text-yellow-400/50 dark:text-yellow-500/35"
            />
          }
        />
        <StatCard
          icon={IconGaugeFilled}
          iconClassName="text-fuchsia-400 dark:text-fuchsia-500"
          label="Eval pass rate"
          href="/evals"
          size="sm"
          loading={statsLoading}
          skeleton={statsSkeleton}
          chartPlaceholder={<PillMeter fraction={null} />}
          value={cur?.passRate ?? "—"}
          formatValue={formatPercent}
          delta={formatDelta(cur?.passRate, prev?.passRate)}
          hint={
            cur?.checkCount
              ? `${formatCount(cur.checkCount)} checks`
              : "No checks scored yet"
          }
          chart={
            <PillMeter
              fraction={cur?.passRate ?? null}
              className="text-fuchsia-400 dark:text-fuchsia-700"
            />
          }
        />
        <StatCard
          icon={IconAlertTriangleFilled}
          iconClassName="text-red-500/90 dark:text-red-600/95 mt-px"
          label="Error rate"
          href="/traces?errors=1"
          size="sm"
          loading={statsLoading}
          skeleton={statsSkeleton}
          chartPlaceholder={<PillMeter fraction={null} />}
          value={cur?.errorRate ?? "—"}
          formatValue={formatPercent}
          delta={formatDelta(cur?.errorRate, prev?.errorRate)}
          deltaInverted
          hint={`${formatCount(cur?.errorCount ?? 0)} of ${formatCount(cur?.spanCount ?? 0)} spans`}
          chart={
            <PillMeter
              fraction={cur?.errorRate ?? null}
              className="text-red-400 dark:text-red-700"
            />
          }
        />
      </section>

      {/* By model + by agent + by workflow + by customer, side by side */}
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4 px-8">
        <Card
          size="sm"
          className={cn(
            "pb-0! group-data-[size=sm]/card:pb-0!",
            entrance && "page-fade-in"
          )}
        >
          <CardHeader>
            <CardTitle>Models</CardTitle>
          </CardHeader>
          <CardContent className="px-0 group-data-[size=sm]/card:px-0! min-h-58 max-h-58">
            {!modelsLoading && modelRows.length === 0 ? (
              // Sized to the list viewport (ScrollFade max-h-60) so an empty
              // card never stretches the grid row past its full siblings.
              <EmptyState
                icon={IconCpu}
                title="No model yet"
                className="h-59 border-none py-0 pb-8"
              />
            ) : (
              <ScrollFade className="max-h-60 -mt-1">
                {modelsLoading ? (
                  <BreakdownRowsSkeleton skeleton={modelsSkeleton} />
                ) : (
                  <div
                    // Only the overflowing lists get extra bottom space so the
                    // last row clears the scroll fade; short lists sit flush.
                    // The space lives inside the last row (not as list padding)
                    // so its clickable area reaches the end of the card.
                    className={cn(
                      "divide-y divide-border/40",
                      modelRows.length > 4 && "[&>*:last-child]:pb-9"
                    )}
                  >
                    {modelRows.map((m) => (
                      <BreakdownRow
                        key={m.modelId}
                        href={
                          // "(unknown)" isn't a real model id — the traces model
                          // filter can't match it, so those rows stay inert.
                          m.modelId === "(unknown)"
                            ? undefined
                            : (`/traces?model=${encodeURIComponent(m.modelId)}` as Route)
                        }
                        renderIcon={(cls) => (
                          <ModelLogo
                            modelId={m.modelId}
                            className={cn(cls, "size-3")}
                          />
                        )}
                        title={formatModelName(m.modelId)}
                        value={formatCost(m.totalCost, 3)}
                        fraction={(m.totalCost ?? 0) / maxModelCost}
                        color={
                          modelBrandColor(null, m.modelId) ?? "var(--chart-2)"
                        }
                      />
                    ))}
                  </div>
                )}
              </ScrollFade>
            )}
          </CardContent>
        </Card>

        <Card
          size="sm"
          className={cn(
            "pb-0! group-data-[size=sm]/card:pb-0!",
            entrance && "page-fade-in"
          )}
        >
          <CardHeader>
            <CardTitle>Agents</CardTitle>
          </CardHeader>
          <CardContent className="px-0 group-data-[size=sm]/card:px-0! min-h-58 max-h-58">
            {!agentsLoading && agentRows.length === 0 ? (
              <EmptyState
                icon={IconGhostFilled}
                title="No agent yet"
                className="h-59 border-none py-0 pb-8"
              />
            ) : (
              <ScrollFade className="max-h-60 -mt-1">
                {agentsLoading ? (
                  <BreakdownRowsSkeleton skeleton={agentsSkeleton} />
                ) : (
                  <div
                    // Only the overflowing lists get extra bottom space so the
                    // last row clears the scroll fade; short lists sit flush.
                    // The space lives inside the last row (not as list padding)
                    // so its clickable area reaches the end of the card.
                    className={cn(
                      "divide-y divide-border/40",
                      agentRows.length > 4 && "[&>*:last-child]:pb-9"
                    )}
                  >
                    {agentRows.map((a) => (
                      <BreakdownRow
                        key={a.agentName}
                        href={
                          `/agents/${encodeURIComponent(a.agentName)}` as Route
                        }
                        renderIcon={(cls) => (
                          <AgentIcon name={a.agentName} className={cls} />
                        )}
                        title={a.agentName}
                        value={formatCost(a.totalCost, 3)}
                        fraction={(a.totalCost ?? 0) / maxAgentCost}
                        color={agentColor(a.agentName)}
                      />
                    ))}
                  </div>
                )}
              </ScrollFade>
            )}
          </CardContent>
        </Card>

        <Card
          size="sm"
          className={cn(
            "pb-0! group-data-[size=sm]/card:pb-0!",
            entrance && "page-fade-in"
          )}
        >
          <CardHeader>
            <CardTitle>Workflows</CardTitle>
          </CardHeader>
          <CardContent className="px-0 group-data-[size=sm]/card:px-0! min-h-58 max-h-58">
            {!workflowsLoading && workflowRows.length === 0 ? (
              <EmptyState
                icon={IconSitemapFilled}
                title="No workflow yet"
                className="h-59 border-none py-0 pb-8"
              />
            ) : (
              <ScrollFade className="max-h-60 -mt-1">
                {workflowsLoading ? (
                  <BreakdownRowsSkeleton skeleton={workflowsSkeleton} />
                ) : (
                  <div
                    // Only the overflowing lists get extra bottom space so the
                    // last row clears the scroll fade; short lists sit flush.
                    // The space lives inside the last row (not as list padding)
                    // so its clickable area reaches the end of the card.
                    className={cn(
                      "divide-y divide-border/40",
                      workflowRows.length > 4 && "[&>*:last-child]:pb-9"
                    )}
                  >
                    {workflowRows.map((w) => (
                      <BreakdownRow
                        key={w.workflowName ?? "~ungrouped"}
                        href={
                          w.workflowName
                            ? (`/workflows/${encodeURIComponent(w.workflowName)}` as Route)
                            : undefined
                        }
                        renderIcon={(cls) => (
                          <IconSitemapFilled
                            className={cn(cls, "text-emerald-500")}
                          />
                        )}
                        title={w.workflowName ?? "Ungrouped"}
                        value={formatCost(w.totalCost, 3)}
                        fraction={(w.totalCost ?? 0) / maxWorkflowCost}
                        color="var(--color-emerald-500)"
                      />
                    ))}
                  </div>
                )}
              </ScrollFade>
            )}
          </CardContent>
        </Card>

        <Card
          size="sm"
          className={cn(
            "pb-0! group-data-[size=sm]/card:pb-0!",
            entrance && "page-fade-in"
          )}
        >
          <CardHeader>
            <CardTitle>Customers</CardTitle>
          </CardHeader>
          <CardContent className="px-0 group-data-[size=sm]/card:px-0! min-h-58 max-h-58">
            {!customersLoading && customerRows.length === 0 ? (
              <EmptyState
                icon={IconUserFilled}
                title="No customer yet"
                className="h-59 border-none py-0 pb-8"
              />
            ) : (
              <ScrollFade className="max-h-60 -mt-1">
                {customersLoading ? (
                  <BreakdownRowsSkeleton skeleton={customersSkeleton} />
                ) : (
                  <div
                    // Only the overflowing lists get extra bottom space so the
                    // last row clears the scroll fade; short lists sit flush.
                    // The space lives inside the last row (not as list padding)
                    // so its clickable area reaches the end of the card.
                    className={cn(
                      "divide-y divide-border/40",
                      customerRows.length > 4 && "[&>*:last-child]:pb-9"
                    )}
                  >
                    {customerRows.map((c) => (
                      <BreakdownRow
                        key={c.customerId ?? "~unidentified"}
                        href={
                          c.customerId
                            ? (`/traces?customer=${encodeURIComponent(c.customerId)}` as Route)
                            : undefined
                        }
                        renderIcon={(cls) =>
                          c.customerId ? (
                            <CustomerAvatar
                              customerId={c.customerId}
                              customerName={c.customerName}
                              imageUrl={c.customerImageUrl}
                              filled
                              className={cls}
                            />
                          ) : (
                            <IconUserFilled
                              className={cn(cls, "text-muted-foreground/60")}
                            />
                          )
                        }
                        title={
                          c.customerName ?? c.customerId ?? "Not identified"
                        }
                        value={formatCost(c.totalCost, 3)}
                        fraction={(c.totalCost ?? 0) / maxCustomerCost}
                        color={
                          c.customerId
                            ? agentColor(c.customerId)
                            : "var(--muted-foreground)"
                        }
                      />
                    ))}
                  </div>
                )}
              </ScrollFade>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Cost over time, stacked by model */}
      <div className="px-8">
        <Card size="sm" className={cn(entrance && "page-fade-in")}>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Cost over time</CardTitle>
            {costItems.length > 0 && (
              <ChartLegend
                items={costItems}
                selected={costSelected}
                onSelect={setCostSelected}
              />
            )}
          </CardHeader>
          <CardContent className="mt-3">
            <MaybeEmptyOverlay empty={costEmpty}>
              <BarChart.EvilBarChart
                config={costChartConfig}
                data={costChartData}
                isLoading={costLoading}
                isUpdating={!costEmpty && chartsStale}
                stackType="stacked"
                xDataKey="bucket"
                syncId="overview-trends"
                onZoomSelect={costEmpty ? undefined : zoom.zoomTo}
                onZoomReset={zoom.reset}
                selectedDataKey={costSelected}
                onSelectionChange={setCostSelected}
                className="h-65 w-full"
                chartProps={{
                  // left: 2 (vs Recharts' default 5) tucks the auto-width
                  // y-axis labels closer to the card content edge.
                  margin: { top: 5, right: 5, bottom: 5, left: 2 },
                  // Wider gap between buckets (Recharts default: 10%) keeps
                  // the bars slim at any bucket count.
                  barCategoryGap: "40%",
                }}
              >
                <BarChart.Grid />
                <BarChart.XAxis
                  dataKey="bucket"
                  ticks={costChartTicks}
                  tickFormatter={bucketLabel}
                  interval={0}
                  tick={edgeTick}
                />
                <BarChart.YAxis
                  tickFormatter={(v) => costAxisUsd.format(Number(v))}
                />
                <BarChart.Tooltip
                  labelFormatter={(v) => formatBucketFull(String(v))}
                  valueFormatter={(v) => formatCost(Number(v))}
                  reverse
                />
                {costChartKeys.map((k) => (
                  <BarChart.Bar
                    key={k}
                    dataKey={k}
                    isClickable
                    bufferBar={costBuffer}
                  />
                ))}
              </BarChart.EvilBarChart>
            </MaybeEmptyOverlay>
          </CardContent>
        </Card>
      </div>

      {/* Volume + errors and latency, side by side. The cards mount at once;
          each chart shows its own loading treatment until the series lands. */}
      <section className="grid gap-4 lg:grid-cols-2 px-8">
        <Card size="sm" className={cn(entrance && "page-fade-in")}>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Requests & errors</CardTitle>
            <ChartLegend
              items={volumeItems}
              selected={volumeSelected}
              onSelect={setVolumeSelected}
            />
          </CardHeader>
          <CardContent className="mt-3">
            <MaybeEmptyOverlay empty={seriesEmpty}>
              <AreaChart.EvilAreaChart
                config={volumeConfig}
                data={volumeChartData}
                isLoading={seriesLoading}
                isUpdating={!seriesEmpty && chartsStale}
                xDataKey="bucket"
                syncId="overview-trends"
                onZoomSelect={seriesEmpty ? undefined : zoom.zoomTo}
                onZoomReset={zoom.reset}
                selectedDataKey={volumeSelected}
                onSelectionChange={setVolumeSelected}
                className="h-65 w-full"
                chartProps={{
                  // left: 2 (vs Recharts' default 5) tucks the auto-width
                  // y-axis labels closer to the card content edge.
                  margin: { top: 5, right: 5, bottom: 5, left: 2 },
                }}
              >
                <AreaChart.Grid />
                <AreaChart.XAxis
                  dataKey="bucket"
                  ticks={seriesChartTicks}
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
                <AreaChart.Area
                  dataKey="requests"
                  strokeVariant="solid"
                  enableBufferLine={seriesBuffer}
                />
                <AreaChart.Area
                  dataKey="errors"
                  strokeVariant="solid"
                  variant="lines"
                  enableBufferLine={seriesBuffer}
                />
              </AreaChart.EvilAreaChart>
            </MaybeEmptyOverlay>
          </CardContent>
        </Card>

        <Card size="sm" className={cn(entrance && "page-fade-in")}>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Latency</CardTitle>
            <ChartLegend
              items={latencyItems}
              selected={latencySelected}
              onSelect={setLatencySelected}
            />
          </CardHeader>
          <CardContent className="mt-3">
            <MaybeEmptyOverlay empty={seriesEmpty}>
              <AreaChart.EvilAreaChart
                config={latencyConfig}
                data={latencyChartData}
                isLoading={seriesLoading}
                isUpdating={!seriesEmpty && chartsStale}
                xDataKey="bucket"
                syncId="overview-trends"
                onZoomSelect={seriesEmpty ? undefined : zoom.zoomTo}
                onZoomReset={zoom.reset}
                stackType="stacked"
                selectedDataKey={latencySelected}
                onSelectionChange={setLatencySelected}
                className="h-65 w-full"
                chartProps={{
                  // left: 2 (vs Recharts' default 5) tucks the auto-width
                  // y-axis labels closer to the card content edge.
                  margin: { top: 5, right: 5, bottom: 5, left: 2 },
                }}
              >
                <AreaChart.Grid />
                <AreaChart.XAxis
                  dataKey="bucket"
                  ticks={seriesChartTicks}
                  tickFormatter={bucketLabel}
                  interval={0}
                  tick={edgeTick}
                />
                {/* width defaults to "auto": sized to the rendered tick labels,
                    so long durations ("1m 20s") never get cropped. */}
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
                {/* Stacked deltas (see latencyData): draw bottom band → top so
                    the stack reads p50, then p95−p50, then p99−p95. */}
                <AreaChart.Area
                  dataKey="p50"
                  strokeVariant="solid"
                  enableBufferLine={seriesBuffer}
                />
                <AreaChart.Area
                  dataKey="p95"
                  strokeVariant="solid"
                  enableBufferLine={seriesBuffer}
                />
                <AreaChart.Area
                  dataKey="p99"
                  strokeVariant="solid"
                  enableBufferLine={seriesBuffer}
                />
                {!seriesEmpty &&
                  latencyThresholds.map((r) => (
                    <AreaChart.Threshold
                      key={r.id}
                      value={Number(r.threshold)}
                      label={`${r.metric.slice("latency_".length)} alert`}
                    />
                  ))}
              </AreaChart.EvilAreaChart>
            </MaybeEmptyOverlay>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
