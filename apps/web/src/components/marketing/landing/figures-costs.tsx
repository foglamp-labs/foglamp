"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
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
import { Tabs, TabsList, TabsTrigger } from "@foglamp/ui/components/tabs";
import { cn } from "@foglamp/ui/lib/utils";
import { IconAlertTriangleFilled, IconCoinFilled } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

import { AgentIcon, agentColor } from "@/components/app/agent-icon";
import { CardSparkline, StatCard } from "@/components/app/page-parts";
import {
  formatBucketFull,
  makeBucketLabel,
  makeEdgeTick,
  themed,
  thinTicks,
} from "@/components/app/trend-charts";
import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import * as BarChart from "@/components/evilcharts/charts/bar-chart";
import { EvilDonutChart } from "@/components/evilcharts/charts/donut-chart";
import * as LineChart from "@/components/evilcharts/charts/line-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import {
  OVERVIEW_COST_CONFIG,
  OVERVIEW_COST_SERIES,
  OVERVIEW_SERIES,
} from "@/components/marketing/demo/mock-data";
import { ModelLogo } from "@/components/model-logo";
import { formatCost } from "@/lib/format";

import { AGENTS, CUSTOMERS, MODELS, noise } from "./figure-kit";
import { useReveal } from "./figure-reveal";
import { BreakdownCard, BreakdownRow, Logo, Scene } from "./figures-scenes";

// Candidate figures for the costs section. The first (CostCards, in
// figures-scenes) is the baseline: three breakdown cards overlapped. The
// rest either rearrange those cards or swap in a different product piece:
// a stat, a chart, an alert, a table.

// ─── Shared bits ────────────────────────────────────────────────────────────

const TOTAL = 840.4;

const CUSTOMER_COLORS: Record<string, string> = {
  cus_acme: "#0f766e",
  cus_globex: "#4f46e5",
  cus_umbrella: "#e11d48",
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** The stage every variant sits on: a fixed-height box on desktop so cards
 * can be placed absolutely, a plain stack on small screens. */
function Stage({
  className,
  narrow = false,
  children,
}: {
  className?: string;
  /** Pull the stage in from the left so more air separates it from the copy. */
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:relative sm:block sm:h-112",
        narrow && "sm:ml-auto sm:w-[78%]",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Rows without a title: the card is just the data. */
function DataCard({
  className,
  children,
}: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Scene
      className={cn("gap-0 py-0! group-data-[size=sm]/card:py-0!", className)}
    >
      <div className="divide-y divide-border/40">{children}</div>
    </Scene>
  );
}

function AgentsCard({
  className,
  plain = false,
  limit = AGENTS.length,
}: {
  className?: string;
  plain?: boolean;
  limit?: number;
}) {
  const Wrap = plain ? DataCard : BreakdownCard;
  return (
    <Wrap title="Agents" className={className}>
      {AGENTS.slice(0, limit).map((a, i) => (
        <BreakdownRow
          key={a.name}
          index={i}
          icon={
            <AgentIcon name={a.name} filled className="size-3.5 shrink-0" />
          }
          title={a.name}
          value={formatCost(a.cost, 2)}
          fraction={a.cost / AGENTS[0].cost}
          color="var(--chart-2)"
        />
      ))}
    </Wrap>
  );
}

function ModelsCard({ className }: { className?: string }) {
  return (
    <BreakdownCard title="Models" className={className}>
      {MODELS.map((m) => (
        <BreakdownRow
          key={m.id}
          icon={<ModelLogo modelId={m.id} className="size-3 shrink-0" />}
          title={m.id}
          value={formatCost(m.cost, 2)}
          fraction={m.cost / MODELS[0].cost}
          color={m.color}
        />
      ))}
    </BreakdownCard>
  );
}

function CustomersCard({
  className,
  plain = false,
}: {
  className?: string;
  plain?: boolean;
}) {
  const Wrap = plain ? DataCard : BreakdownCard;
  return (
    <Wrap title="Customers" className={className}>
      {CUSTOMERS.map((c, i) => (
        <BreakdownRow
          key={c.id}
          index={i}
          icon={<Logo id={c.id} className="size-3.5" />}
          title={c.name}
          value={formatCost(c.cost, 2)}
          fraction={c.cost / CUSTOMERS[0].cost}
          color="var(--chart-4)"
        />
      ))}
    </Wrap>
  );
}

const LIFTED = "shadow-(--custom-shadow-lifted)";

// ─── 2. Stair: the three cards step down the diagonal ───────────────────────

export function CostStair() {
  return (
    <Stage narrow className="sm:h-132">
      <AgentsCard className="sm:absolute sm:top-0 sm:left-0 sm:z-10 sm:w-[56%]" />
      <ModelsCard
        className={cn(
          "sm:absolute sm:top-[30%] sm:left-[22%] sm:z-20 sm:w-[56%]",
          LIFTED
        )}
      />
      <CustomersCard
        className={cn(
          "sm:absolute sm:top-[60%] sm:left-[44%] sm:z-30 sm:w-[56%]",
          LIFTED
        )}
      />
    </Stage>
  );
}

// ─── 3. Fan: a hand of cards, the middle one held up ────────────────────────

export function CostFan() {
  return (
    <Stage narrow>
      <AgentsCard className="sm:absolute sm:top-0 sm:left-0 sm:z-10 sm:w-[48%] sm:origin-bottom-right sm:-rotate-3" />
      <CustomersCard className="sm:absolute sm:top-0 sm:right-0 sm:z-20 sm:w-[48%] sm:origin-bottom-left sm:rotate-3" />
      <ModelsCard
        className={cn(
          "sm:absolute sm:top-[38%] sm:left-[26%] sm:z-30 sm:w-[48%]",
          LIFTED
        )}
      />
    </Stage>
  );
}

// ─── 4. Shelf: two cards on top, the wide one tucked under them ─────────────

export function CostShelf() {
  return (
    <Stage>
      <AgentsCard className="sm:absolute sm:top-0 sm:left-0 sm:z-10 sm:w-[47%]" />
      <CustomersCard className="sm:absolute sm:top-0 sm:right-0 sm:z-10 sm:w-[44%]" />
      <ModelsCard
        className={cn(
          "sm:absolute sm:bottom-0 sm:left-[16%] sm:z-20 sm:w-[64%]",
          LIFTED
        )}
      />
    </Stage>
  );
}

// ─── 5. Total: the headline number, with two breakdowns beside it ───────────

export function CostTotal() {
  return (
    <Stage>
      <div className="sm:absolute sm:top-[6%] sm:left-0 sm:z-10 sm:w-[44%]">
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-amber-400 dark:text-yellow-500"
          label="Total cost"
          value={formatCost(TOTAL, 2)}
          delta={{ pct: 0.124, dir: "up" }}
          deltaInverted
          hint="last 24 hours"
          chart={
            <CardSparkline
              data={OVERVIEW_SERIES.map((d) => d.cost)}
              className="text-yellow-400/50 dark:text-yellow-500/35"
            />
          }
        />
      </div>
      <ModelsCard className="sm:absolute sm:top-0 sm:right-0 sm:z-20 sm:w-[46%]" />
      <CustomersCard
        className={cn(
          "sm:absolute sm:bottom-0 sm:left-[14%] sm:z-30 sm:w-[42%]",
          LIFTED
        )}
      />
    </Stage>
  );
}

// ─── 6. Chart: cost over time by model, with a customers card on top ────────

const WINDOW_MS = 24 * 60 * 60 * 1000;
const bucketLabel = makeBucketLabel(WINDOW_MS);
const edgeTick = makeEdgeTick(bucketLabel);
const ticks = thinTicks(
  OVERVIEW_SERIES.map((d) => d.bucket),
  bucketLabel
);

const axisUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type LegendItem = {
  key: string;
  label: string;
  color: string;
  icon?: ReactNode;
};

/** A clickable legend: a color dot, an optional icon and the label. */
function SeriesLegend({
  items,
  selected,
  onSelect,
  className,
}: {
  items: LegendItem[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-x-3 gap-y-1 select-none",
        className
      )}
    >
      {items.map((item) => {
        const dimmed = selected !== null && selected !== item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(selected === item.key ? null : item.key)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground transition-opacity hover:text-foreground",
              dimmed && "opacity-30"
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

const MODEL_LEGEND: LegendItem[] = Object.entries(OVERVIEW_COST_CONFIG).map(
  ([key, entry]) => ({
    key,
    label: entry.label,
    color: entry.colors.light[0]!,
    icon: <ModelLogo modelId={entry.label} className="size-3" />,
  })
);

function ModelLegend(props: {
  selected: string | null;
  onSelect: (key: string | null) => void;
  className?: string;
}) {
  return <SeriesLegend items={MODEL_LEGEND} {...props} />;
}

// The chart keeps the three main models; the smaller two only add noise at
// this size.
const CHART_KEYS = ["m0", "m1", "m2"] as const;
const CHART_CONFIG = {
  m0: OVERVIEW_COST_CONFIG.m0,
  m1: OVERVIEW_COST_CONFIG.m1,
  m2: OVERVIEW_COST_CONFIG.m2,
} satisfies ChartConfig;
const CHART_SERIES = OVERVIEW_COST_SERIES.map(({ bucket, m0, m1, m2 }) => ({
  bucket,
  m0,
  m1,
  m2,
}));
const CHART_LEGEND = MODEL_LEGEND.filter((item) =>
  (CHART_KEYS as readonly string[]).includes(item.key)
);

export function CostChart() {
  const [selected, setSelected] = useState<string | null>(null);
  // The chart grows its bars in when it mounts, so it mounts once the figure
  // is in view and the grow-in plays where the reader can see it.
  const { shown } = useReveal();
  return (
    <Stage narrow className="sm:h-132">
      {/* The agents card hangs over the top edge, clear of the inline legend;
          the customers card overlaps the bottom. Phones keep just the chart
          with the agents card tucked over its bottom corner. */}
      <Scene className="sm:absolute sm:inset-x-0 sm:top-36 sm:z-10">
        <CardHeader className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <CardTitle>Cost over time</CardTitle>
          <SeriesLegend
            items={CHART_LEGEND}
            selected={selected}
            onSelect={setSelected}
            className="justify-start ml-auto"
          />
        </CardHeader>
        <CardContent className="mt-3">
          {shown ? (
            <BarChart.EvilBarChart
              config={CHART_CONFIG}
              data={CHART_SERIES}
              stackType="stacked"
              selectedDataKey={selected}
              onSelectionChange={setSelected}
              className="h-52 w-full"
              chartProps={{
                margin: { top: 5, right: 5, bottom: 5, left: 2 },
                barCategoryGap: "40%",
              }}
            >
              <BarChart.Grid />
              <BarChart.XAxis
                dataKey="bucket"
                ticks={ticks}
                tickFormatter={bucketLabel}
                interval={0}
                tick={edgeTick}
              />
              <BarChart.YAxis tickFormatter={(v) => axisUsd.format(Number(v))} />
              <BarChart.Tooltip
                labelFormatter={(v) => formatBucketFull(String(v))}
                valueFormatter={(v) => formatCost(Number(v))}
                reverse
              />
              {CHART_KEYS.map((k) => (
                <BarChart.Bar key={k} dataKey={k} isClickable />
              ))}
            </BarChart.EvilBarChart>
          ) : (
            <div className="h-52 w-full" />
          )}
        </CardContent>
      </Scene>
      <AgentsCard
        plain
        limit={3}
        className={cn(
          "max-sm:z-20 max-sm:-mt-8 max-sm:ml-10 sm:absolute sm:top-10 sm:right-[-10%] sm:z-20 sm:w-[44%]",
          LIFTED
        )}
      />
      <CustomersCard
        plain
        className={cn(
          "max-sm:hidden sm:absolute sm:right-[4%] sm:bottom-0 sm:z-20 sm:w-[44%]",
          LIFTED
        )}
      />
    </Stage>
  );
}

// ─── 7. Alert: a daily cost rule crossing its line ──────────────────────────

const DAYS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date("2026-06-15T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - (13 - i));
  return d.toISOString().slice(0, 19).replace("T", " ");
});

const ALERT_DATA = DAYS.map((day, i) => ({
  day,
  cost:
    i < 10 ? 640 + 180 * noise(i, 21) : 900 + 120 * (i - 9) + 60 * noise(i, 22),
}));

const alertConfig = {
  cost: { label: "Daily cost", colors: themed("#F59E0B") },
} satisfies ChartConfig;

const dayLabel = makeBucketLabel(15 * 24 * 60 * 60 * 1000);

export function CostAlert() {
  const last = ALERT_DATA[ALERT_DATA.length - 1]!.cost;
  return (
    <Stage>
      <Scene className="sm:absolute sm:top-0 sm:left-0 sm:z-10 sm:w-[66%]">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <IconAlertTriangleFilled className="size-4 text-amber-500" />
            Daily cost above $1,000
          </CardTitle>
          <span className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              now {usd.format(last)}
            </span>
            <Badge variant="red">Firing</Badge>
          </span>
        </CardHeader>
        <CardContent className="mt-2">
          <LineChart.EvilLineChart
            config={alertConfig}
            data={ALERT_DATA}
            curveType="monotone"
            className="h-48 w-full"
            chartProps={{ margin: { top: 10, right: 5, bottom: 5, left: 2 } }}
          >
            <LineChart.Grid />
            <LineChart.XAxis
              dataKey="day"
              ticks={[DAYS[0]!, DAYS[4]!, DAYS[8]!, DAYS[12]!]}
              tickFormatter={dayLabel}
              interval={0}
            />
            <LineChart.YAxis tickFormatter={(v) => usd.format(Number(v))} />
            <LineChart.Tooltip
              labelFormatter={(v) => formatBucketFull(String(v))}
              valueFormatter={(v) => usd.format(Number(v))}
            />
            <LineChart.Threshold value={1000} label="$1,000" />
            <LineChart.Line dataKey="cost">
              <LineChart.Dot variant="border" />
            </LineChart.Line>
          </LineChart.EvilLineChart>
          <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            Fired 12 minutes ago. Notified #ai-costs on Slack.
          </p>
        </CardContent>
      </Scene>
      <AgentsCard
        className={cn(
          "sm:absolute sm:right-0 sm:bottom-0 sm:z-20 sm:w-[40%]",
          LIFTED
        )}
      />
    </Stage>
  );
}

// ─── 8. Table: every customer with their top agent and model ────────────────

const TABLE_ROWS = [
  { customer: CUSTOMERS[0], agent: "support-triage", model: "gpt-5.6-sol" },
  {
    customer: CUSTOMERS[1],
    agent: "research-planner",
    model: "claude-fable-5",
  },
  { customer: CUSTOMERS[2], agent: "code-reviewer", model: "gpt-5.6-sol" },
] as const;

export function CostTable() {
  return (
    <Stage>
      <Scene className="pb-0! group-data-[size=sm]/card:pb-0! sm:absolute sm:inset-x-[4%] sm:top-1/2 sm:-translate-y-1/2">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Customers</CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCost(TOTAL, 2)} in the last 24 hours
          </span>
        </CardHeader>
        <CardContent className="px-0 group-data-[size=sm]/card:px-0!">
          <Table className="[&_td]:px-4 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:px-4 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Top agent</TableHead>
                <TableHead>Top model</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="w-24 text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TABLE_ROWS.map(({ customer, agent, model }) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Logo id={customer.id} className="size-3.5" />
                      {customer.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <AgentIcon name={agent} filled className="size-3.5" />
                      {agent}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <ModelLogo modelId={model} className="size-3" />
                      {model}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCost(customer.cost, 2)}
                  </TableCell>
                  <TableCell>
                    <div className="ml-auto h-0.5 w-14 overflow-hidden rounded-full bg-muted-foreground/10">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(customer.cost / TOTAL) * 100}%`,
                          backgroundColor: CUSTOMER_COLORS[customer.id],
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Scene>
    </Stage>
  );
}

// ─── 9. Tabs: one card, the dimension chosen with a segmented control ───────

type Dimension = "models" | "agents" | "customers";

type Bar = { key: string; icon: ReactNode; label: string; cost: number };

const BARS: Record<Dimension, Bar[]> = {
  models: MODELS.map((m) => ({
    key: m.id,
    icon: <ModelLogo modelId={m.id} className="size-3 shrink-0" />,
    label: m.id,
    cost: m.cost,
  })),
  agents: AGENTS.map((a) => ({
    key: a.name,
    icon: <AgentIcon name={a.name} filled className="size-3.5 shrink-0" />,
    label: a.name,
    cost: a.cost,
  })),
  customers: CUSTOMERS.map((c) => ({
    key: c.id,
    icon: <Logo id={c.id} className="size-3.5" />,
    label: c.name,
    cost: c.cost,
  })),
};

const BAR_COLORS: Record<Dimension, (key: string) => string> = {
  models: (key) => MODELS.find((m) => m.id === key)?.color ?? "var(--chart-2)",
  agents: (key) => agentColor(key),
  customers: (key) => CUSTOMER_COLORS[key] ?? "var(--chart-4)",
};

export function CostTabs() {
  const [dim, setDim] = useState<Dimension>("models");
  const bars = BARS[dim];
  const max = Math.max(...bars.map((b) => b.cost));
  return (
    <Stage>
      <Scene className="sm:absolute sm:inset-x-[10%] sm:top-1/2 sm:-translate-y-1/2">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Cost by</CardTitle>
          <Tabs value={dim} onValueChange={(v) => setDim(v as Dimension)}>
            <TabsList className="h-8">
              <TabsTrigger value="models">Models</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="mt-2 flex flex-col gap-3.5">
          {bars.map((b) => (
            <div
              key={b.key}
              className="grid grid-cols-[10rem_1fr_4.5rem] items-center gap-3"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                {b.icon}
                <span className="truncate">{b.label}</span>
              </span>
              <div className="h-2 overflow-hidden rounded-full bg-muted-foreground/10">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${(b.cost / max) * 100}%`,
                    backgroundColor: BAR_COLORS[dim](b.key),
                  }}
                />
              </div>
              <span className="text-right text-sm tabular-nums">
                {formatCost(b.cost, 2)}
              </span>
            </div>
          ))}
        </CardContent>
      </Scene>
    </Stage>
  );
}

// ─── 10. Shares: three proportional bars, one per dimension ─────────────────

function ShareRow({
  title,
  parts,
}: {
  title: string;
  parts: {
    key: string;
    icon: ReactNode;
    label: string;
    cost: number;
    color: string;
  }[];
}) {
  const sum = parts.reduce((a, p) => a + p.cost, 0);
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs text-muted-foreground">{title}</span>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) => (
          <div
            key={p.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(p.cost / sum) * 100}%`,
              backgroundColor: p.color,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5 text-xs">
            {p.icon}
            <span className="text-foreground/80">{p.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {Math.round((p.cost / sum) * 100)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function CostShares() {
  return (
    <Stage>
      <Scene className="sm:absolute sm:inset-x-[8%] sm:top-1/2 sm:-translate-y-1/2">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Where the money went</CardTitle>
          <span className="text-sm tabular-nums">{formatCost(TOTAL, 2)}</span>
        </CardHeader>
        <CardContent className="mt-2 flex flex-col gap-6">
          <ShareRow
            title="Models"
            parts={MODELS.map((m) => ({
              key: m.id,
              icon: <ModelLogo modelId={m.id} className="size-3 shrink-0" />,
              label: m.id,
              cost: m.cost,
              color: m.color,
            }))}
          />
          <ShareRow
            title="Agents"
            parts={AGENTS.map((a) => ({
              key: a.name,
              icon: (
                <AgentIcon name={a.name} filled className="size-3.5 shrink-0" />
              ),
              label: a.name,
              cost: a.cost,
              color: agentColor(a.name),
            }))}
          />
          <ShareRow
            title="Customers"
            parts={CUSTOMERS.map((c) => ({
              key: c.id,
              icon: <Logo id={c.id} className="size-3.5" />,
              label: c.name,
              cost: c.cost,
              color: CUSTOMER_COLORS[c.id]!,
            }))}
          />
        </CardContent>
      </Scene>
    </Stage>
  );
}

// ─── 11. Backdrop: a quiet area chart behind two breakdown cards ────────────

export function CostBackdrop() {
  return (
    <Stage narrow>
      <Scene className="sm:absolute sm:inset-x-0 sm:top-0 sm:z-10">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Cost over time</CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCost(TOTAL, 2)} in the last 24 hours
          </span>
        </CardHeader>
        <CardContent className="mt-2">
          <AreaChart.EvilAreaChart
            config={OVERVIEW_COST_CONFIG}
            data={OVERVIEW_COST_SERIES}
            stackType="stacked"
            curveType="monotone"
            className="h-56 w-full"
            chartProps={{ margin: { top: 4, right: 0, bottom: 0, left: 0 } }}
          >
            {Object.keys(OVERVIEW_COST_CONFIG).map((k) => (
              <AreaChart.Area key={k} dataKey={k} strokeVariant="solid" />
            ))}
          </AreaChart.EvilAreaChart>
        </CardContent>
      </Scene>
      <AgentsCard
        className={cn(
          "sm:absolute sm:bottom-0 sm:left-[4%] sm:z-20 sm:w-[46%]",
          LIFTED
        )}
      />
      <CustomersCard
        className={cn(
          "sm:absolute sm:right-[4%] sm:bottom-[8%] sm:z-30 sm:w-[42%]",
          LIFTED
        )}
      />
    </Stage>
  );
}

// ─── 12. Donut: the model split as a ring, customers on top ─────────────────

// Keyed m0..m3 rather than by model id: the chart turns keys into CSS
// variable names, and a dot in "gpt-5.6-sol" breaks that.
const DONUT_CONFIG = Object.fromEntries(
  MODELS.map((m, i) => [`m${i}`, { label: m.id, colors: themed(m.color) }])
) satisfies ChartConfig;

const DONUT_DATA = MODELS.map((m, i) => ({ key: `m${i}`, value: m.cost }));

export function CostDonut() {
  return (
    <Stage narrow>
      <Scene className="sm:absolute sm:top-0 sm:left-0 sm:z-10 sm:w-[72%]">
        <CardHeader>
          <CardTitle>Cost by model</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <EvilDonutChart
            config={DONUT_CONFIG}
            data={DONUT_DATA}
            className="aspect-square h-44 w-44 shrink-0"
            innerRadius="70%"
            outerRadius="96%"
            centerLabel={usd.format(Math.round(TOTAL))}
            centerSubLabel="24 hours"
            valueFormatter={(v) => formatCost(Number(v), 2)}
          />
          <ul className="flex min-w-0 flex-1 flex-col gap-3">
            {MODELS.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: m.color }}
                  />
                  <ModelLogo modelId={m.id} className="size-3 shrink-0" />
                  <span className="truncate">{m.id}</span>
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {Math.round((m.cost / TOTAL) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Scene>
      <CustomersCard
        className={cn(
          "sm:absolute sm:right-0 sm:bottom-0 sm:z-20 sm:w-[46%]",
          LIFTED
        )}
      />
    </Stage>
  );
}

// ─── 13. Area: cost by customer over time, agents on top ────────────────────

const CUSTOMER_KEYS = ["c0", "c1", "c2"] as const;

const CUSTOMER_AREA_CONFIG = {
  c0: { label: CUSTOMERS[0].name, colors: themed(CUSTOMER_COLORS.cus_acme!) },
  c1: {
    label: CUSTOMERS[1].name,
    colors: themed(CUSTOMER_COLORS.cus_globex!),
  },
  c2: {
    label: CUSTOMERS[2].name,
    colors: themed(CUSTOMER_COLORS.cus_umbrella!),
  },
} satisfies ChartConfig;

const CUSTOMER_MIX = [0.48, 0.37, 0.15];

const CUSTOMER_SERIES = OVERVIEW_SERIES.map((r, i) => {
  const raw = CUSTOMER_MIX.map((s, k) => s * (0.7 + 0.6 * noise(i, k + 7)));
  const sum = raw.reduce((a, b) => a + b, 0);
  const part = (k: number) => +((r.cost * raw[k]!) / sum).toFixed(3);
  return { bucket: r.bucket, c0: part(0), c1: part(1), c2: part(2) };
});

const CUSTOMER_LEGEND: LegendItem[] = CUSTOMERS.map((c, i) => ({
  key: CUSTOMER_KEYS[i]!,
  label: c.name,
  color: CUSTOMER_COLORS[c.id]!,
  icon: <Logo id={c.id} className="size-3" />,
}));

export function CostArea() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Stage narrow>
      <Scene className="sm:absolute sm:inset-x-0 sm:top-0 sm:z-10">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Cost by customer</CardTitle>
          <SeriesLegend
            items={CUSTOMER_LEGEND}
            selected={selected}
            onSelect={setSelected}
          />
        </CardHeader>
        <CardContent className="mt-3">
          <AreaChart.EvilAreaChart
            config={CUSTOMER_AREA_CONFIG}
            data={CUSTOMER_SERIES}
            stackType="stacked"
            curveType="monotone"
            selectedDataKey={selected}
            onSelectionChange={setSelected}
            className="h-52 w-full"
            chartProps={{ margin: { top: 5, right: 5, bottom: 5, left: 2 } }}
          >
            <AreaChart.Grid />
            <AreaChart.XAxis
              dataKey="bucket"
              ticks={ticks}
              tickFormatter={bucketLabel}
              interval={0}
              tick={edgeTick}
            />
            <AreaChart.YAxis tickFormatter={(v) => axisUsd.format(Number(v))} />
            <AreaChart.Tooltip
              labelFormatter={(v) => formatBucketFull(String(v))}
              valueFormatter={(v) => formatCost(Number(v))}
              reverse
            />
            {CUSTOMER_KEYS.map((k) => (
              <AreaChart.Area
                key={k}
                dataKey={k}
                strokeVariant="solid"
                isClickable
              />
            ))}
          </AreaChart.EvilAreaChart>
        </CardContent>
      </Scene>
      <AgentsCard
        className={cn(
          "sm:absolute sm:right-[4%] sm:bottom-0 sm:z-20 sm:w-[46%]",
          LIFTED
        )}
      />
    </Stage>
  );
}

// ─── 14. Small multiples: one slim card per customer ────────────────────────

const CUSTOMER_TREND = [
  { delta: 0.18, dir: "up" },
  { delta: 0.04, dir: "down" },
  { delta: 0.31, dir: "up" },
] as const;

const SMALL_OFFSET = ["", "sm:ml-[7%]", "sm:ml-[14%]"];

export function CostSmall() {
  return (
    <Stage narrow className="sm:flex sm:flex-col sm:justify-center sm:gap-4">
      {CUSTOMERS.map((c, i) => {
        const trend = CUSTOMER_TREND[i]!;
        const color = CUSTOMER_COLORS[c.id]!;
        return (
          <Scene key={c.id} className={cn("sm:w-[86%]", SMALL_OFFSET[i])}>
            <CardContent className="flex items-center gap-5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2 text-sm">
                  <Logo id={c.id} className="size-4" />
                  {c.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {AGENTS[i]!.name} most of it
                </span>
              </div>
              <div className="h-8 w-40 shrink-0" style={{ color }}>
                <CardSparkline
                  data={CUSTOMER_SERIES.map((d) => d[CUSTOMER_KEYS[i]!])}
                  className="opacity-60"
                />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-base tabular-nums">
                  {formatCost(c.cost, 2)}
                </span>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    trend.dir === "up" ? "text-red-500" : "text-emerald-600"
                  )}
                >
                  {trend.dir === "up" ? "+" : "-"}
                  {Math.round(trend.delta * 100)}%
                </span>
              </div>
            </CardContent>
          </Scene>
        );
      })}
    </Stage>
  );
}

// ─── 15. Flow: customers, through agents, into models ───────────────────────

type FlowNode = { id: string; label: string; color: string; icon: ReactNode };

const FLOW_CUSTOMERS: FlowNode[] = CUSTOMERS.map((c) => ({
  id: c.id,
  label: c.name,
  color: CUSTOMER_COLORS[c.id]!,
  icon: <Logo id={c.id} className="size-3.5" />,
}));

const FLOW_AGENTS: FlowNode[] = AGENTS.map((a) => ({
  id: a.name,
  label: a.name,
  color: agentColor(a.name),
  icon: <AgentIcon name={a.name} filled className="size-3.5" />,
}));

const FLOW_MODELS: FlowNode[] = MODELS.map((m) => ({
  id: m.id,
  label: m.id,
  color: m.color,
  icon: <ModelLogo modelId={m.id} className="size-3" />,
}));

// Dollar flows. Each stage sums to the same total so the bands line up.
const FLOW_CA: [number, number, number][] = [
  [0, 0, 180],
  [0, 1, 140],
  [0, 2, 80],
  [1, 0, 120],
  [1, 1, 60],
  [1, 2, 100],
  [1, 3, 20],
  [2, 1, 60],
  [2, 2, 40],
  [2, 3, 40.4],
];
const FLOW_AM: [number, number, number][] = [
  [0, 0, 200],
  [0, 1, 100],
  [1, 0, 150],
  [1, 1, 80],
  [1, 2, 30],
  [2, 1, 120],
  [2, 0, 80],
  [2, 3, 20],
  [3, 2, 30],
  [3, 3, 30.4],
];

const FLOW_GAP = 4;

/** Vertical extents (0..100) for a column of nodes, sized by their totals. */
function columnLayout(totals: number[]) {
  const sum = totals.reduce((a, b) => a + b, 0);
  const usable = 100 - FLOW_GAP * (totals.length - 1);
  let y = 0;
  return totals.map((t) => {
    const h = (t / sum) * usable;
    const box = { y0: y, y1: y + h };
    y += h + FLOW_GAP;
    return box;
  });
}

function ribbon(
  x0: number,
  a0: number,
  a1: number,
  x1: number,
  b0: number,
  b1: number
) {
  const xm = (x0 + x1) / 2;
  return `M${x0} ${a0} C${xm} ${a0} ${xm} ${b0} ${x1} ${b0} L${x1} ${b1} C${xm} ${b1} ${xm} ${a1} ${x0} ${a1} Z`;
}

function flowBands(
  links: [number, number, number][],
  from: { y0: number; y1: number }[],
  to: { y0: number; y1: number }[],
  x0: number,
  x1: number
) {
  const fromTotal = from.map(() => 0);
  const toTotal = to.map(() => 0);
  for (const [f, t, v] of links) {
    fromTotal[f]! += v;
    toTotal[t]! += v;
  }
  const fromCursor = from.map((b) => b.y0);
  const toCursor = to.map((b) => b.y0);
  const sorted = [...links].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return sorted.map(([f, t, v]) => {
    const fh = ((from[f]!.y1 - from[f]!.y0) * v) / fromTotal[f]!;
    const th = ((to[t]!.y1 - to[t]!.y0) * v) / toTotal[t]!;
    const a0 = fromCursor[f]!;
    const b0 = toCursor[t]!;
    fromCursor[f] = a0 + fh;
    toCursor[t] = b0 + th;
    return { f, t, d: ribbon(x0, a0, a0 + fh, x1, b0, b0 + th) };
  });
}

const FLOW_C = columnLayout(
  FLOW_CUSTOMERS.map((_, i) =>
    FLOW_CA.filter(([f]) => f === i).reduce((s, [, , v]) => s + v, 0)
  )
);
const FLOW_A = columnLayout(
  FLOW_AGENTS.map((_, i) =>
    FLOW_CA.filter(([, t]) => t === i).reduce((s, [, , v]) => s + v, 0)
  )
);
const FLOW_M = columnLayout(
  FLOW_MODELS.map((_, i) =>
    FLOW_AM.filter(([, t]) => t === i).reduce((s, [, , v]) => s + v, 0)
  )
);

const BAR_W = 1.6;
const BANDS_CA = flowBands(FLOW_CA, FLOW_C, FLOW_A, BAR_W, 50 - BAR_W / 2);
const BANDS_AM = flowBands(
  FLOW_AM,
  FLOW_A,
  FLOW_M,
  50 + BAR_W / 2,
  100 - BAR_W
);

function FlowLabels({
  nodes,
  boxes,
  align,
}: {
  nodes: FlowNode[];
  boxes: { y0: number; y1: number }[];
  align: "left" | "center" | "right";
}) {
  return (
    <>
      {nodes.map((n, i) => {
        const box = boxes[i]!;
        return (
          <span
            key={n.id}
            className={cn(
              "absolute flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap text-xs",
              align === "left" && "right-full pr-2.5",
              align === "right" && "left-full pl-2.5",
              align === "center" &&
                "left-1/2 -translate-x-1/2 rounded-md bg-card px-1.5 py-0.5 shadow-(--custom-shadow)"
            )}
            style={{ top: `${(box.y0 + box.y1) / 2}%` }}
          >
            {n.icon}
            {n.label}
          </span>
        );
      })}
    </>
  );
}

export function CostFlow() {
  return (
    <Stage narrow>
      <Scene className="sm:absolute sm:inset-x-0 sm:top-1/2 sm:-translate-y-1/2">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Where the money flows</CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCost(TOTAL, 2)} in the last 24 hours
          </span>
        </CardHeader>
        <CardContent className="mt-3 pb-2">
          <div className="grid grid-cols-[auto_1fr_auto] text-xs text-muted-foreground">
            <span className="pb-3">Customers</span>
            <span className="pb-3 text-center">Agents</span>
            <span className="pb-3 text-right">Models</span>
          </div>
          <div className="relative mr-40 ml-24 h-64">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full"
              aria-hidden
            >
              {BANDS_CA.map((b) => (
                <path
                  key={`ca-${b.f}-${b.t}`}
                  d={b.d}
                  fill={FLOW_CUSTOMERS[b.f]!.color}
                  opacity={0.22}
                />
              ))}
              {BANDS_AM.map((b) => (
                <path
                  key={`am-${b.f}-${b.t}`}
                  d={b.d}
                  fill={FLOW_AGENTS[b.f]!.color}
                  opacity={0.22}
                />
              ))}
              {FLOW_C.map((box, i) => (
                <rect
                  key={FLOW_CUSTOMERS[i]!.id}
                  x={0}
                  y={box.y0}
                  width={BAR_W}
                  height={box.y1 - box.y0}
                  fill={FLOW_CUSTOMERS[i]!.color}
                />
              ))}
              {FLOW_A.map((box, i) => (
                <rect
                  key={FLOW_AGENTS[i]!.id}
                  x={50 - BAR_W / 2}
                  y={box.y0}
                  width={BAR_W}
                  height={box.y1 - box.y0}
                  fill={FLOW_AGENTS[i]!.color}
                />
              ))}
              {FLOW_M.map((box, i) => (
                <rect
                  key={FLOW_MODELS[i]!.id}
                  x={100 - BAR_W}
                  y={box.y0}
                  width={BAR_W}
                  height={box.y1 - box.y0}
                  fill={FLOW_MODELS[i]!.color}
                />
              ))}
            </svg>
            <FlowLabels nodes={FLOW_CUSTOMERS} boxes={FLOW_C} align="left" />
            <FlowLabels nodes={FLOW_AGENTS} boxes={FLOW_A} align="center" />
            <FlowLabels nodes={FLOW_MODELS} boxes={FLOW_M} align="right" />
          </div>
        </CardContent>
      </Scene>
    </Stage>
  );
}
