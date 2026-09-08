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
import {
  IconAlertTriangleFilled,
  IconCoinFilled,
} from "@tabler/icons-react";
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
import * as BarChart from "@/components/evilcharts/charts/bar-chart";
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
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-4 sm:relative sm:block sm:h-112", className)}>
      {children}
    </div>
  );
}

function AgentsCard({ className }: { className?: string }) {
  return (
    <BreakdownCard title="Agents" className={className}>
      {AGENTS.map((a) => (
        <BreakdownRow
          key={a.name}
          icon={
            <AgentIcon name={a.name} filled className="size-3.5 shrink-0" />
          }
          title={a.name}
          value={formatCost(a.cost, 2)}
          fraction={a.cost / AGENTS[0].cost}
          color="var(--chart-2)"
        />
      ))}
    </BreakdownCard>
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

function CustomersCard({ className }: { className?: string }) {
  return (
    <BreakdownCard title="Customers" className={className}>
      {CUSTOMERS.map((c) => (
        <BreakdownRow
          key={c.id}
          icon={<Logo id={c.id} className="size-3.5" />}
          title={c.name}
          value={formatCost(c.cost, 2)}
          fraction={c.cost / CUSTOMERS[0].cost}
          color="var(--chart-4)"
        />
      ))}
    </BreakdownCard>
  );
}

const LIFTED = "shadow-(--custom-shadow-lifted)";

// ─── 2. Stair: the three cards step down the diagonal ───────────────────────

export function CostStair() {
  return (
    <Stage className="sm:h-132">
      <AgentsCard className="sm:absolute sm:top-0 sm:left-0 sm:z-10 sm:w-[60%]" />
      <ModelsCard
        className={cn(
          "sm:absolute sm:top-[30%] sm:left-[20%] sm:z-20 sm:w-[60%]",
          LIFTED
        )}
      />
      <CustomersCard
        className={cn(
          "sm:absolute sm:top-[60%] sm:left-[40%] sm:z-30 sm:w-[60%]",
          LIFTED
        )}
      />
    </Stage>
  );
}

// ─── 3. Fan: a hand of cards, the middle one held up ────────────────────────

export function CostFan() {
  return (
    <Stage>
      <AgentsCard className="sm:absolute sm:top-0 sm:left-0 sm:z-10 sm:w-[46%] sm:origin-bottom-right sm:-rotate-3" />
      <CustomersCard className="sm:absolute sm:top-0 sm:right-0 sm:z-20 sm:w-[46%] sm:origin-bottom-left sm:rotate-3" />
      <ModelsCard
        className={cn(
          "sm:absolute sm:top-[38%] sm:left-[27%] sm:z-30 sm:w-[46%]",
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

function ModelLegend({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 select-none">
      {Object.entries(OVERVIEW_COST_CONFIG).map(([key, entry]) => {
        const dimmed = selected !== null && selected !== key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(selected === key ? null : key)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-opacity hover:text-foreground",
              dimmed && "opacity-30"
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.colors.light[0] }}
            />
            <ModelLogo modelId={entry.label} className="size-3" />
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

export function CostChart() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Stage>
      <Scene className="sm:absolute sm:inset-x-0 sm:top-0 sm:z-10">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Cost over time</CardTitle>
          <ModelLegend selected={selected} onSelect={setSelected} />
        </CardHeader>
        <CardContent className="mt-3">
          <BarChart.EvilBarChart
            config={OVERVIEW_COST_CONFIG}
            data={OVERVIEW_COST_SERIES}
            stackType="stacked"
            selectedDataKey={selected}
            onSelectionChange={setSelected}
            className="h-60 w-full"
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
            <BarChart.YAxis
              tickFormatter={(v) => axisUsd.format(Number(v))}
            />
            <BarChart.Tooltip
              labelFormatter={(v) => formatBucketFull(String(v))}
              valueFormatter={(v) => formatCost(Number(v))}
              reverse
            />
            {Object.keys(OVERVIEW_COST_CONFIG).map((k) => (
              <BarChart.Bar key={k} dataKey={k} isClickable />
            ))}
          </BarChart.EvilBarChart>
        </CardContent>
      </Scene>
      <CustomersCard
        className={cn(
          "sm:absolute sm:right-[4%] sm:bottom-0 sm:z-20 sm:w-[38%]",
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
    i < 10
      ? 640 + 180 * noise(i, 21)
      : 900 + 120 * (i - 9) + 60 * noise(i, 22),
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
  { customer: CUSTOMERS[1], agent: "research-planner", model: "claude-fable-5" },
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
            <div key={b.key} className="grid grid-cols-[10rem_1fr_4.5rem] items-center gap-3">
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
  parts: { key: string; icon: ReactNode; label: string; cost: number; color: string }[];
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
            style={{ width: `${(p.cost / sum) * 100}%`, backgroundColor: p.color }}
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
              icon: <AgentIcon name={a.name} filled className="size-3.5 shrink-0" />,
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
