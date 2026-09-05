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
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAffiliateFilled,
  IconBellFilled,
  IconCircleCheckFilled,
  IconCoinFilled,
  IconForbidFilled,
  IconGaugeFilled,
  IconListCheck,
  IconStack2Filled,
} from "@tabler/icons-react";
import { useState } from "react";

import { FAMILY_CHIP, presetMeta } from "@/app/(app)/evals/preset-meta";
import { AgentIcon } from "@/components/app/agent-icon";
import { PillMeter, StatCard } from "@/components/app/page-parts";
import {
  formatBucketFull,
  makeBucketLabel,
  makeEdgeTick,
  themed,
  thinTicks,
} from "@/components/app/trend-charts";
import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import * as BarChart from "@/components/evilcharts/charts/bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { ModelLogo } from "@/components/model-logo";
import { formatCost } from "@/lib/format";

import { BUCKETS, Mono, noise, Panel, REPLY, Tile, WINDOW_MS } from "./figure-kit";

const bucketLabel = makeBucketLabel(WINDOW_MS);
const edgeTick = makeEdgeTick(bucketLabel);
const ticks = thinTicks(BUCKETS, bucketLabel);

const THRESHOLD = 0.7;

/** The colored check chip the eval pages use for a preset. */
function CheckChip({ presetId, className }: { presetId: string; className?: string }) {
  const { icon: Icon, family } = presetMeta(presetId);
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md corner-squircle",
        FAMILY_CHIP[family],
        className
      )}
    >
      <Icon className="size-3" />
    </span>
  );
}

function Verdict({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
      <IconCircleCheckFilled className="size-3.5" />
      Pass
    </span>
  ) : (
    <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
      <IconForbidFilled className="size-3.5" />
      Fail
    </span>
  );
}

function Score({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        value < THRESHOLD ? "text-rose-600 dark:text-rose-400" : "text-foreground"
      )}
    >
      {value.toFixed(2)}
    </span>
  );
}

// ─── 1. Scores: every scored run over the day, against the threshold ────────

// Runs scatter through the day. Most score high; a cluster dips under the
// threshold in the evening.
const RUNS = Array.from({ length: 56 }, (_, i) => {
  const x = (i + 0.5) / 56;
  const dip = x > 0.62 && x < 0.8 && noise(i, 31) < 0.7;
  const base = dip ? 0.35 + 0.3 * noise(i, 32) : 0.74 + 0.24 * noise(i, 33);
  return { x, y: Math.min(0.99, base) };
});

const HOURS = ["00:00", "06:00", "12:00", "18:00"];

export function QualityScores() {
  const [hover, setHover] = useState<number | null>(null);
  const passed = RUNS.filter((r) => r.y >= THRESHOLD).length;
  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckChip presetId="helpfulness" />
          <span className="font-medium">Helpfulness</span>
          <span className="text-xs text-muted-foreground">email-drafter</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
          <span>{RUNS.length} scored</span>
          <span>{Math.round((passed / RUNS.length) * 100)}% pass</span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            pass
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-rose-500" />
            fail
          </span>
        </div>
      </div>
      <div className="grid grid-cols-[2rem_1fr] grid-rows-[1fr_1.25rem] gap-x-2">
        <div className="relative text-[11px] text-muted-foreground tabular-nums">
          {[1, 0.5, 0].map((v) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(1 - v) * 100}%` }}
            >
              {v.toFixed(1)}
            </span>
          ))}
        </div>
        <div className="relative h-52 border-b border-l border-border">
          {[0.5, 1].map((v) => (
            <span
              key={v}
              aria-hidden
              className="absolute inset-x-0 border-t border-dashed border-border/60"
              style={{ top: `${(1 - v) * 100}%` }}
            />
          ))}
          <span
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-rose-500"
            style={{ top: `${(1 - THRESHOLD) * 100}%` }}
          />
          <span
            className="absolute right-0 text-[10px] text-rose-500"
            style={{ top: `calc(${(1 - THRESHOLD) * 100}% + 3px)` }}
          >
            threshold {THRESHOLD.toFixed(2)}
          </span>
          {RUNS.map((r, i) => {
            const pass = r.y >= THRESHOLD;
            return (
              <span
                key={r.x}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className={cn(
                  "absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background transition-transform",
                  pass ? "bg-emerald-500" : "bg-rose-500",
                  hover === i && "scale-150"
                )}
                style={{ left: `${r.x * 100}%`, top: `${(1 - r.y) * 100}%` }}
              />
            );
          })}
          {hover !== null && (
            <span
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background tabular-nums"
              style={{
                left: `${RUNS[hover]!.x * 100}%`,
                top: `${(1 - RUNS[hover]!.y) * 100}%`,
              }}
            >
              score {RUNS[hover]!.y.toFixed(2)}
            </span>
          )}
        </div>
        <span />
        <div className="relative text-[11px] text-muted-foreground tabular-nums">
          {HOURS.map((h, i) => (
            <span
              key={h}
              className={cn("absolute top-1", i > 0 && "-translate-x-1/2")}
              style={{ left: `${(i / HOURS.length) * 100}%` }}
            >
              {h}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ─── 2. Evals: the evals list ───────────────────────────────────────────────

const EVALS = [
  { id: "toxicity", name: "Toxicity", level: "trace", agent: null, passRate: 0.99, avg: 0.99, spend: 4.21 },
  { id: "tool_selection", name: "Tool selection", level: "span", agent: "support-triage", passRate: 0.92, avg: 0.88, spend: 2.84 },
  { id: "faithfulness", name: "Faithfulness", level: "trace", agent: "research-planner", passRate: 0.88, avg: 0.85, spend: 3.62 },
  { id: "pii", name: "No PII", level: "span", agent: null, passRate: 1, avg: 1, spend: 0 },
  { id: "helpfulness", name: "Helpfulness", level: "trace", agent: "email-drafter", passRate: 0.81, avg: 0.79, spend: 1.18 },
] as const;

export function QualityEvals() {
  return (
    <Panel inset={false}>
      <Table className="table-fixed [&_td]:px-3 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:px-3 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
        <TableHeader>
          <TableRow>
            <TableHead className="w-40 pl-5">Eval</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead className="w-24 text-right">Pass rate</TableHead>
            <TableHead className="w-24 text-right">Avg score</TableHead>
            <TableHead className="w-20 pr-5 text-right">Spend</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {EVALS.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="pl-5">
                <span className="flex items-center gap-2">
                  <CheckChip presetId={e.id} />
                  <span className="truncate font-medium">{e.name}</span>
                </span>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {e.level === "trace" ? (
                    <IconAffiliateFilled className="size-3.5 shrink-0" />
                  ) : (
                    <IconStack2Filled className="size-3.5 shrink-0" />
                  )}
                  {e.level === "trace" ? "Traces" : "Spans"}
                  {e.agent && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <AgentIcon name={e.agent} className="size-3.5 shrink-0" />
                      <span className="truncate text-foreground">{e.agent}</span>
                    </>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span
                  className={cn(
                    e.passRate < 0.85 && "text-rose-600 dark:text-rose-400"
                  )}
                >
                  {Math.round(e.passRate * 100)}%
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{e.avg.toFixed(2)}</TableCell>
              <TableCell className="pr-5 text-right tabular-nums">
                {e.spend === 0 ? (
                  <span className="text-muted-foreground/40">free</span>
                ) : (
                  formatCost(e.spend, 2)
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

// ─── 3. Runs: the scored runs of one eval ───────────────────────────────────

const SAMPLES = [
  { id: "tr_9f2a4c8e", score: 0.97, note: "Polite, acknowledges the delay, offers a remedy.", when: "2m ago" },
  { id: "tr_3b8e1d6a", score: 0.91, note: "Clear and courteous, slightly terse closing.", when: "9m ago" },
  { id: "tr_7c1f5a2b", score: 0.42, note: "Curt tone, no acknowledgement of the issue.", when: "31m ago" },
  { id: "tr_2d9a6c3f", score: 0.95, note: "Warm, on brand, well structured.", when: "1h ago" },
  { id: "tr_5e0c7b1d", score: 0.58, note: "Answers a different question than the one asked.", when: "1h ago" },
];

export function QualityRuns() {
  return (
    <Panel inset={false}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <CheckChip presetId="helpfulness" />
          <span className="font-medium">Helpfulness</span>
        </div>
        <span className="text-xs text-muted-foreground">Recent runs</span>
      </div>
      <Table className="table-fixed [&_td]:px-3 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:px-3 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
        <TableHeader>
          <TableRow>
            <TableHead className="w-28 pl-5">Trace</TableHead>
            <TableHead className="w-16 text-right">Score</TableHead>
            <TableHead className="w-20 pl-6">Result</TableHead>
            <TableHead className="pr-5">Judge note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SAMPLES.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="pl-5">
                <Mono className="text-foreground">{s.id}</Mono>
              </TableCell>
              <TableCell className="text-right">
                <Score value={s.score} />
              </TableCell>
              <TableCell className="pl-6">
                <Verdict pass={s.score >= THRESHOLD} />
              </TableCell>
              <TableCell className="truncate pr-5 text-muted-foreground">{s.note}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

// ─── 4. Stats: the eval page's stat strip ───────────────────────────────────

export function QualityStats() {
  return (
    <Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={IconCircleCheckFilled}
          iconClassName="text-emerald-500"
          size="sm"
          label="Pass rate"
          value="81%"
          delta={{ pct: 0.09, dir: "down" }}
          chart={
            <PillMeter fraction={0.81} className="text-emerald-400 dark:text-emerald-700" />
          }
        />
        <StatCard
          icon={IconGaugeFilled}
          iconClassName="text-fuchsia-400 dark:text-fuchsia-500"
          size="sm"
          label="Avg score"
          value="0.79"
          delta={{ pct: 0.06, dir: "down" }}
        />
        <StatCard
          icon={IconListCheck}
          iconClassName="text-sky-400 dark:text-sky-500"
          size="sm"
          label="Scored"
          value="1.9k"
          delta={{ pct: 0.12, dir: "up" }}
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-amber-400 dark:text-yellow-500"
          size="sm"
          label="Judge spend"
          value="$1.18"
          delta={{ pct: 0.1, dir: "up" }}
          deltaInverted
        />
      </div>
    </Panel>
  );
}

// ─── 5. Pass rate: over the day, with the alert line ────────────────────────

const passConfig = {
  passRate: { label: "Pass rate", colors: themed("#D946EF") },
} satisfies ChartConfig;

const PASS_DATA = BUCKETS.map((bucket, i) => {
  const dip = i >= 15 && i <= 19;
  const v = dip ? 0.78 - 0.06 * Math.sin(((i - 15) / 4) * Math.PI) : 0.93 + 0.04 * noise(i, 41);
  return { bucket, passRate: Math.min(0.99, v) };
});

export function QualityPassRate() {
  return (
    <Panel>
      <Tile
        title="Pass rate"
        action={
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconBellFilled className="size-3.5 text-rose-500" />
            Alert below 85%
          </span>
        }
      >
        <AreaChart.EvilAreaChart
          config={passConfig}
          data={PASS_DATA}
          curveType="monotone"
          className="h-[220px] w-full"
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
          <AreaChart.YAxis
            domain={[0.6, 1]}
            tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
          />
          <AreaChart.Tooltip
            labelFormatter={(v) => formatBucketFull(String(v))}
            valueFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
          />
          <AreaChart.Threshold value={0.85} label="85%" />
          <AreaChart.Area dataKey="passRate" strokeVariant="solid" />
        </AreaChart.EvilAreaChart>
      </Tile>
    </Panel>
  );
}

// ─── 6. Distribution: how the scores spread ─────────────────────────────────

const BINS = [
  { bucket: "0.0", count: 8 },
  { bucket: "0.1", count: 6 },
  { bucket: "0.2", count: 14 },
  { bucket: "0.3", count: 19 },
  { bucket: "0.4", count: 41 },
  { bucket: "0.5", count: 62 },
  { bucket: "0.6", count: 88 },
  { bucket: "0.7", count: 132 },
  { bucket: "0.8", count: 386 },
  { bucket: "0.9", count: 612 },
];

const DIST_DATA = BINS.map((b) => {
  const fail = Number(b.bucket) < THRESHOLD;
  return { bucket: b.bucket, fail: fail ? b.count : 0, pass: fail ? 0 : b.count };
});

const distConfig = {
  fail: { label: "Below threshold", colors: themed("#F43F5E") },
  pass: { label: "Passing", colors: themed("#D946EF") },
} satisfies ChartConfig;

export function QualityDistribution() {
  const total = BINS.reduce((a, b) => a + b.count, 0);
  const failing = DIST_DATA.reduce((a, b) => a + b.fail, 0);
  return (
    <Panel>
      <Tile
        title="Score distribution"
        action={
          <span className="text-sm text-muted-foreground tabular-nums">
            {failing} of {total} below {THRESHOLD.toFixed(2)}
          </span>
        }
      >
        <BarChart.EvilBarChart
          config={distConfig}
          data={DIST_DATA}
          stackType="stacked"
          className="h-[220px] w-full"
          chartProps={{
            margin: { top: 5, right: 5, bottom: 5, left: 2 },
            barCategoryGap: "25%",
          }}
        >
          <BarChart.Grid />
          <BarChart.XAxis dataKey="bucket" interval={0} />
          <BarChart.YAxis />
          <BarChart.Tooltip labelFormatter={(v) => `Score ${v}`} />
          <BarChart.Bar dataKey="fail" />
          <BarChart.Bar dataKey="pass" />
        </BarChart.EvilBarChart>
      </Tile>
    </Panel>
  );
}

// ─── 7. Judge: one verdict, with the response and the reasoning ─────────────

const BAD_REPLY =
  "Your order is processing. Orders can take time. Please wait and check back later.";

export function QualityJudge() {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckChip presetId="helpfulness" />
          <span className="font-medium">Helpfulness</span>
          <Mono>tr_7c1f5a2b</Mono>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            score <Score value={0.42} />
          </span>
          <Badge variant="rose">Fail</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1.5 text-xs text-muted-foreground">Response</div>
          <p className="rounded-md bg-muted/50 p-3 text-[13px] leading-relaxed">{BAD_REPLY}</p>
        </div>
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ModelLogo modelId="claude-fable-5" className="size-3" />
            Judge reasoning
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            The customer asked why an order is stuck after five days. The reply
            restates the status without checking the order, gives no reason and
            no next step, and does not acknowledge the wait.
          </p>
        </div>
      </div>
    </Panel>
  );
}

// ─── 8. Versions: pass rate per prompt version ──────────────────────────────

const VERSIONS = [
  { n: 1, runs: 412, passRate: 0.9, when: "Jun 2", current: false },
  { n: 2, runs: 1280, passRate: 0.94, when: "Jun 9", current: false },
  { n: 3, runs: 236, passRate: 0.81, when: "2h ago", current: true },
];

export function QualityVersions() {
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AgentIcon name="email-drafter" className="size-4" />
          <span className="font-medium">email-drafter</span>
          <span className="text-xs text-muted-foreground">prompt versions</span>
        </div>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckChip presetId="helpfulness" className="size-4" />
          Helpfulness pass rate
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {VERSIONS.map((v, i) => {
          const prev = VERSIONS[i - 1];
          const delta = prev ? v.passRate - prev.passRate : 0;
          const drop = delta < -0.05;
          return (
            <div key={v.n} className="grid grid-cols-[3rem_1fr_5rem_4rem] items-center gap-4 py-3">
              <Badge variant="sky" size="sm" className="w-fit font-mono normal-case tabular-nums">
                {`v${v.n}`}
              </Badge>
              <div className="min-w-0">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/10">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      drop ? "bg-rose-500" : "bg-fuchsia-500"
                    )}
                    style={{ width: `${v.passRate * 100}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  <span>{v.runs} runs</span>
                  <span>·</span>
                  <span>{v.current ? "live since 2h ago" : `deployed ${v.when}`}</span>
                </div>
              </div>
              <span
                className={cn(
                  "text-right tabular-nums",
                  drop && "font-medium text-rose-600 dark:text-rose-400"
                )}
              >
                {Math.round(v.passRate * 100)}%
              </span>
              <span
                className={cn(
                  "text-right text-xs tabular-nums",
                  prev
                    ? drop
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground/50"
                )}
              >
                {prev
                  ? `${delta > 0 ? "+" : ""}${Math.round(delta * 100)} pts`
                  : "baseline"}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
