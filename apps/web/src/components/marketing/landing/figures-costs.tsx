"use client";

import { Badge } from "@foglamp/ui/components/badge";
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
  IconArrowDownRight,
  IconArrowUpRight,
  IconBellFilled,
  IconCirclesFilled,
  IconCoinFilled,
  IconGaugeFilled,
} from "@tabler/icons-react";
import { useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { HeatCell } from "@/components/app/heat-cell";
import { CardSparkline, StatCard } from "@/components/app/page-parts";
import {
  ChartLegend,
  formatBucketFull,
  makeBucketLabel,
  makeEdgeTick,
  themed,
  thinTicks,
} from "@/components/app/trend-charts";
import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import * as BarChart from "@/components/evilcharts/charts/bar-chart";
import * as LineChart from "@/components/evilcharts/charts/line-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { ModelLogo } from "@/components/model-logo";
import { formatCost, formatCount, formatDuration, formatTokens } from "@/lib/format";

import {
  AGENTS,
  BreakdownRow,
  BUCKETS,
  CUSTOMERS,
  MODELS,
  noise,
  Panel,
  quintiles,
  Tile,
  TOTAL_COST,
  wave,
  WINDOW_MS,
} from "./figure-kit";

const bucketLabel = makeBucketLabel(WINDOW_MS);
const edgeTick = makeEdgeTick(bucketLabel);
const ticks = thinTicks(BUCKETS, bucketLabel);

const axisUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// Hourly spend that follows the workday wave, with a little wobble.
const HOURLY = BUCKETS.map((_, i) => 12 + 58 * wave(i) * (0.8 + 0.4 * noise(i, 1)));

// ─── 1. Breakdown: the overview's models / agents / customers cards ─────────

function BreakdownCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Tile title={title} contentClassName="divide-y divide-border/40 text-xs">
      {children}
    </Tile>
  );
}

export function CostBreakdown() {
  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-3">
        <BreakdownCard title="Models">
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
        <BreakdownCard title="Agents">
          {AGENTS.map((a) => (
            <BreakdownRow
              key={a.name}
              icon={<AgentIcon name={a.name} className="size-3.5 shrink-0" />}
              title={a.name}
              value={formatCost(a.cost, 2)}
              fraction={a.cost / AGENTS[0].cost}
              color="var(--chart-2)"
            />
          ))}
        </BreakdownCard>
        <BreakdownCard title="Customers">
          {CUSTOMERS.slice(0, 4).map((c) => (
            <BreakdownRow
              key={c.id}
              icon={
                <CustomerAvatar
                  customerId={c.id}
                  customerName={c.name}
                  className="size-3.5"
                />
              }
              title={c.name}
              value={formatCost(c.cost, 2)}
              fraction={c.cost / CUSTOMERS[0].cost}
              color="var(--chart-4)"
            />
          ))}
        </BreakdownCard>
      </div>
    </Panel>
  );
}

// ─── 2. KPIs: the overview's stat cards ─────────────────────────────────────

export function CostKpis() {
  const tokens = BUCKETS.map((_, i) => 0.6 + 2.4 * wave(i) * (0.85 + 0.3 * noise(i, 2)));
  const perRun = BUCKETS.map((_, i) => 0.03 + 0.02 * noise(i, 3));
  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-amber-400 dark:text-yellow-500"
          size="sm"
          label="Total cost"
          value={formatCost(TOTAL_COST, 2)}
          delta={{ pct: 0.124, dir: "up" }}
          deltaInverted
          chart={
            <CardSparkline
              data={HOURLY}
              className="text-yellow-400/50 dark:text-yellow-500/35"
            />
          }
        />
        <StatCard
          icon={IconCirclesFilled}
          iconClassName="text-sky-400 dark:text-sky-500"
          size="sm"
          label="Tokens"
          value="42.8M"
          delta={{ pct: 0.18, dir: "up" }}
          chart={
            <CardSparkline
              data={tokens}
              className="text-blue-400/50 dark:text-sky-600/40"
            />
          }
        />
        <StatCard
          icon={IconGaugeFilled}
          iconClassName="text-fuchsia-400 dark:text-fuchsia-500"
          size="sm"
          label="Cost per run"
          value="$0.046"
          delta={{ pct: 0.03, dir: "down" }}
          deltaInverted
          chart={
            <CardSparkline
              data={perRun}
              className="text-fuchsia-400/50 dark:text-fuchsia-600/40"
            />
          }
        />
      </div>
    </Panel>
  );
}

// ─── 3. Dimensions: spend split into input / output / reasoning ─────────────

const DIMENSIONS = [
  { key: "input", label: "Input", color: "#F97316", share: 0.44 },
  { key: "output", label: "Output", color: "#0090FD", share: 0.42 },
  { key: "reasoning", label: "Reasoning", color: "#A78BFA", share: 0.14 },
] as const;

const dimensionConfig: ChartConfig = Object.fromEntries(
  DIMENSIONS.map((d) => [d.key, { label: d.label, colors: themed(d.color) }])
);

const DIMENSION_DATA = BUCKETS.map((bucket, i) => {
  const row: Record<string, string | number> = { bucket };
  DIMENSIONS.forEach((d, di) => {
    row[d.key] = HOURLY[i]! * d.share * (0.7 + 0.6 * noise(i, di + 5));
  });
  return row;
});

export function CostDimensions() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Panel>
      <Tile
        title="Cost breakdown"
        action={
          <ChartLegend
            config={dimensionConfig}
            selected={selected}
            onSelect={setSelected}
          />
        }
      >
        <BarChart.EvilBarChart
          config={dimensionConfig}
          data={DIMENSION_DATA}
          stackType="stacked"
          selectedDataKey={selected}
          onSelectionChange={setSelected}
          className="h-[240px] w-full"
          chartProps={{
            margin: { top: 5, right: 5, bottom: 5, left: 2 },
            barCategoryGap: "25%",
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
            valueFormatter={(v) => formatCost(Number(v), 2)}
            reverse
          />
          {DIMENSIONS.map((d) => (
            <BarChart.Bar key={d.key} dataKey={d.key} isClickable />
          ))}
        </BarChart.EvilBarChart>
      </Tile>
    </Panel>
  );
}

// ─── 4. Models: spend over time stacked by model, logos in the legend ───────

// Recharts turns the key into a CSS variable, so dots in a model id break its
// color. Chart by a safe slug and keep the id for the label.
const modelKey = (id: string) => id.replace(/[^a-z0-9]/gi, "_");

const modelConfig: ChartConfig = Object.fromEntries(
  MODELS.map((m) => [modelKey(m.id), { label: m.id, colors: themed(m.color) }])
);

const MODEL_DATA = BUCKETS.map((bucket, i) => {
  const row: Record<string, string | number> = { bucket };
  MODELS.forEach((m, mi) => {
    row[modelKey(m.id)] = HOURLY[i]! * (m.cost / TOTAL_COST) * (0.75 + 0.5 * noise(i, mi + 9));
  });
  return row;
});

function ModelLegend({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 select-none">
      {MODELS.map((m) => {
        const key = modelKey(m.id);
        const dimmed = selected !== null && selected !== key;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(selected === key ? null : key)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-all hover:text-foreground",
              dimmed && "opacity-30",
              selected === key && "text-foreground"
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-2xl corner-squircle"
              style={{ backgroundColor: m.color }}
            />
            <ModelLogo modelId={m.id} className="size-3.5" />
            {m.id}
          </button>
        );
      })}
    </div>
  );
}

export function CostModels() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Panel>
      <Tile
        title="Cost by model"
        action={<ModelLegend selected={selected} onSelect={setSelected} />}
      >
        <AreaChart.EvilAreaChart
          config={modelConfig}
          data={MODEL_DATA}
          stackType="stacked"
          curveType="monotone"
          selectedDataKey={selected}
          onSelectionChange={setSelected}
          className="h-[240px] w-full"
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
            valueFormatter={(v) => formatCost(Number(v), 2)}
            reverse
          />
          {MODELS.map((m) => (
            <AreaChart.Area
              key={m.id}
              dataKey={modelKey(m.id)}
              strokeVariant="solid"
              isClickable
            />
          ))}
        </AreaChart.EvilAreaChart>
      </Tile>
    </Panel>
  );
}

// ─── 5. Agents: the agents table with heat-tinted cost cells ────────────────

const AGENT_COST_Q = quintiles(AGENTS.map((a) => a.cost));
const AGENT_P95_Q = quintiles(AGENTS.map((a) => a.p95));

export function CostAgents() {
  return (
    <Panel inset={false}>
      <TooltipProvider delay={150}>
        <Table className="table-fixed [&_td]:px-3 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:px-3 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Agent</TableHead>
              <TableHead className="w-24 text-right">Requests</TableHead>
              <TableHead className="w-24 text-right">Tokens</TableHead>
              <TableHead className="w-20 text-right">p95</TableHead>
              <TableHead className="w-20 text-right">Errors</TableHead>
              <TableHead className="w-28 pr-5 text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {AGENTS.map((a) => (
              <TableRow key={a.name}>
                <TableCell className="pl-5">
                  <span className="flex items-center gap-2">
                    <AgentIcon name={a.name} className="size-4 shrink-0" />
                    <span className="truncate font-medium">{a.name}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(a.requests)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatTokens(a.tokens)}
                </TableCell>
                <HeatCell value={a.p95} thresholds={AGENT_P95_Q} metric="duration">
                  {formatDuration(a.p95)}
                </HeatCell>
                <TableCell className="text-right tabular-nums">{a.errors}</TableCell>
                <HeatCell value={a.cost} thresholds={AGENT_COST_Q} metric="spend" bold>
                  {formatCost(a.cost, 2)}
                </HeatCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TooltipProvider>
    </Panel>
  );
}

// ─── 6. Treemap: one tile per model, sized by spend ─────────────────────────

function TreeTile({
  model,
  className,
}: {
  model: (typeof MODELS)[number];
  className?: string;
}) {
  const share = Math.round((model.cost / TOTAL_COST) * 100);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-between overflow-hidden rounded-md p-3 text-white",
        className
      )}
      style={{ backgroundColor: model.color }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex size-4.5 shrink-0 items-center justify-center rounded-sm bg-white text-neutral-900">
          <ModelLogo modelId={model.id} className="size-3" />
        </span>
        <span className="truncate text-xs font-medium">{model.id}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2 tabular-nums">
        <span className="text-sm font-medium">{formatCost(model.cost, 2)}</span>
        <span className="text-xs">{share}%</span>
      </div>
    </div>
  );
}

export function CostTreemap() {
  const [gpt, claude, gemini, glm] = MODELS;
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium">Cost by model</span>
        <span className="text-muted-foreground tabular-nums">
          {formatCost(TOTAL_COST, 2)} · last 24 hours
        </span>
      </div>
      <div className="grid aspect-[16/7] grid-cols-[58fr_42fr] gap-1.5">
        <TreeTile model={gpt} />
        <div className="grid min-w-0 grid-rows-[3fr_1fr] gap-1.5">
          <TreeTile model={claude} />
          <div className="grid min-w-0 grid-cols-[55fr_45fr] gap-1.5">
            <TreeTile model={gemini} />
            <TreeTile model={glm} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ─── 7. Alert: a daily cost rule crossing its threshold ─────────────────────

const DAYS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date("2026-06-15T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - (13 - i));
  return d.toISOString().slice(0, 19).replace("T", " ");
});

const ALERT_DATA = DAYS.map((day, i) => ({
  day,
  cost: i < 10 ? 640 + 180 * noise(i, 21) : 900 + 120 * (i - 9) + 60 * noise(i, 22),
}));

const alertConfig = {
  cost: { label: "Daily cost", colors: themed("#F59E0B") },
} satisfies ChartConfig;

const dayLabel = makeBucketLabel(15 * 24 * 60 * 60 * 1000);

export function CostAlert() {
  const last = ALERT_DATA[ALERT_DATA.length - 1]!.cost;
  return (
    <Panel>
      <Tile
        title={
          <span className="flex items-center gap-2">
            <IconBellFilled className="size-4 text-amber-500" />
            Daily cost above $1,000
          </span>
        }
        action={
          <span className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground tabular-nums">
              now {axisUsd.format(last)}
            </span>
            <Badge variant="rose">Firing</Badge>
          </span>
        }
      >
        <LineChart.EvilLineChart
          config={alertConfig}
          data={ALERT_DATA}
          curveType="monotone"
          className="h-[200px] w-full"
          chartProps={{ margin: { top: 10, right: 5, bottom: 5, left: 2 } }}
        >
          <LineChart.Grid />
          <LineChart.XAxis
            dataKey="day"
            ticks={[DAYS[0]!, DAYS[4]!, DAYS[8]!, DAYS[12]!]}
            tickFormatter={dayLabel}
            interval={0}
          />
          <LineChart.YAxis tickFormatter={(v) => axisUsd.format(Number(v))} />
          <LineChart.Tooltip
            labelFormatter={(v) => formatBucketFull(String(v))}
            valueFormatter={(v) => axisUsd.format(Number(v))}
          />
          <LineChart.Threshold value={1000} label="$1,000" />
          <LineChart.Line dataKey="cost">
            <LineChart.Dot variant="border" />
          </LineChart.Line>
        </LineChart.EvilLineChart>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span>Fired 12 minutes ago, notified #ai-costs on Slack</span>
          <span>Window 24h · checked every 5m</span>
        </div>
      </Tile>
    </Panel>
  );
}

// ─── 8. Customers: spend per customer with the week over week change ────────

export function CostCustomers() {
  return (
    <Panel>
      <Tile
        title="Customers"
        action={<span className="text-sm text-muted-foreground">by spend</span>}
        contentClassName="divide-y divide-border/40"
      >
        {CUSTOMERS.map((c) => {
          const up = c.delta > 0;
          const Arrow = up ? IconArrowUpRight : IconArrowDownRight;
          return (
            <BreakdownRow
              key={c.id}
              icon={
                <CustomerAvatar
                  customerId={c.id}
                  customerName={c.name}
                  className="size-3.5"
                />
              }
              title={c.name}
              value={formatCost(c.cost, 2)}
              fraction={c.cost / CUSTOMERS[0].cost}
              color="var(--chart-4)"
              trailing={
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-xs tabular-nums",
                    up ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                  )}
                >
                  <Arrow className="size-3" />
                  {Math.round(Math.abs(c.delta) * 100)}%
                </span>
              }
            />
          );
        })}
      </Tile>
    </Panel>
  );
}
