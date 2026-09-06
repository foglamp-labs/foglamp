"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconGhostFilled,
  IconScaleFilled,
  IconTool,
  IconUserFilled,
} from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { Chip } from "@/components/app/context-chip";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { TraceTimeline } from "@/components/app/trace-timeline";
import { SESSION_TURNS, TRACE_SPANS } from "@/components/marketing/demo/mock-data";
import { ModelLogo } from "@/components/model-logo";
import { formatCost, formatSpanDuration } from "@/lib/format";
import type { TraceSpan } from "@/lib/trace-timeline";

import { AGENTS, CheckChip, CUSTOMERS, MODELS, Mono, noise } from "./figure-kit";

// Scenes: a few real product cards laid out on the page itself, with no
// surface behind them. They overlap a little so the group reads as one
// composition rather than a grid.

/** A card that can sit on top of another: the app's card plus a hairline so
 * the overlapping edges stay crisp on both themes. */
function Scene({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Card size="sm" className={cn("ring-1 ring-border", className)}>
      {children}
    </Card>
  );
}

// ─── Costs: the overview's breakdown cards, overlapped ──────────────────────

function BreakdownRow({
  icon,
  title,
  value,
  fraction,
  color,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  fraction: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-3">
      <div className="flex min-w-0 items-center gap-1.5">
        {icon}
        <span className="truncate text-sm">{title}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-sm tabular-nums">{value}</span>
        <div className="h-0.5 w-14 overflow-hidden rounded-full bg-muted-foreground/10">
          <div
            className="ml-auto h-full rounded-full"
            style={{ width: `${Math.max(2, fraction * 100)}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Scene className={cn("pb-0! group-data-[size=sm]/card:pb-0!", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0 group-data-[size=sm]/card:px-0!">
        <div className="-mt-1 divide-y divide-border/40">{children}</div>
      </CardContent>
    </Scene>
  );
}

export function CostCards() {
  return (
    <div className="grid gap-4 sm:relative sm:block sm:h-112">
      <BreakdownCard title="Agents" className="sm:absolute sm:top-0 sm:left-[30%] sm:z-10 sm:w-[38%]">
        {AGENTS.map((a) => (
          <BreakdownRow
            key={a.name}
            icon={<AgentIcon name={a.name} filled className="size-3.5 shrink-0" />}
            title={a.name}
            value={formatCost(a.cost, 2)}
            fraction={a.cost / AGENTS[0].cost}
            color="var(--chart-2)"
          />
        ))}
      </BreakdownCard>
      <BreakdownCard title="Models" className="sm:absolute sm:bottom-0 sm:left-0 sm:z-20 sm:w-[36%]">
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
      <BreakdownCard title="Customers" className="sm:absolute sm:top-[22%] sm:right-0 sm:z-30 sm:w-[34%]">
        {CUSTOMERS.slice(0, 4).map((c) => (
          <BreakdownRow
            key={c.id}
            icon={
              <CustomerAvatar
                customerId={c.id}
                customerName={c.name}
                filled
                className="size-3.5 shrink-0"
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
  );
}

// ─── Traces: one turn of a session, and the trace behind it ─────────────────

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const isUser = role === "user";
  const Icon = isUser ? IconUserFilled : IconGhostFilled;
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15 text-muted-foreground shadow-(--custom-shadow)",
          isUser && "mt-1.5"
        )}
      >
        <Icon className="size-3.5" />
      </div>
      {isUser ? (
        <p className="min-w-0 flex-1 rounded-lg squircle:rounded-2xl corner-squircle bg-muted px-3 py-2.5 text-sm dark:bg-muted-foreground/10">
          {text}
        </p>
      ) : (
        <p className="min-w-0 flex-1 px-1 text-sm leading-relaxed">{text}</p>
      )}
    </div>
  );
}

// The first turn of the hero demo's session, so the card and the timeline
// below it describe the same run.
const turn = SESSION_TURNS[0]!;

const spans = TRACE_SPANS as unknown as TraceSpan[];

export function TraceStory() {
  const [selected, setSelected] = useState<string | null>("s3");
  return (
    <div className="flex flex-col gap-4 sm:block">
      <Scene className="relative z-10 sm:w-[60%]">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Turn 1</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <Mono>{turn.traceId}</Mono>
            <span>{formatSpanDuration(turn.durationMs)}</span>
            <span>{formatCost(turn.totalCost, 4)}</span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Bubble role="user" text={turn.userMessage} />
          <div className="flex flex-wrap items-center gap-1.5 pl-9">
            {turn.toolCalls?.map((tc) => (
              <Chip
                key={tc.name}
                icon={<IconTool className="mb-px size-3 shrink-0 fill-current stroke-1 text-blue-500" />}
                label={<span className="font-mono">{tc.name}</span>}
                trailing={tc.count > 1 ? `×${tc.count}` : undefined}
              />
            ))}
          </div>
          <Bubble role="assistant" text={turn.assistantOutput} />
        </CardContent>
      </Scene>
      <Scene className="sm:-mt-5 sm:ml-[12%]">
        <CardContent>
          <TraceTimeline spans={spans} selected={selected} onSelect={setSelected} />
        </CardContent>
      </Scene>
    </div>
  );
}

// ─── Quality: a day of scores, and the judge's call on one failing run ──────

const THRESHOLD = 0.7;

// Runs scatter through the day. Most score high; a cluster dips under the
// threshold late morning, and one of those is the run the judge card shows.
const RUNS = Array.from({ length: 56 }, (_, i) => {
  const x = (i + 0.5) / 56;
  const dip = x > 0.3 && x < 0.48 && noise(i, 31) < 0.7;
  const base = dip ? 0.38 + 0.26 * noise(i, 32) : 0.74 + 0.24 * noise(i, 33);
  return { x, y: Math.min(0.99, base) };
});
const PICK = RUNS.reduce((lo, r, i) => (r.y < RUNS[lo]!.y ? i : lo), 0);
RUNS[PICK]!.y = 0.42;

const HOURS = ["00:00", "06:00", "12:00", "18:00"];

const BAD_REPLY =
  "Your order is processing. Orders can take time. Please wait and check back later.";

export function QualityReview() {
  const passed = RUNS.filter((r) => r.y >= THRESHOLD).length;
  return (
    <div className="flex flex-col gap-4 sm:block">
      <Scene>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CheckChip presetId="helpfulness" />
            <CardTitle>Helpfulness</CardTitle>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AgentIcon name="support-triage" filled className="size-3.5" />
              support-triage
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
            <span>{RUNS.length} scored</span>
            <span>{Math.round((passed / RUNS.length) * 100)}% pass</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mt-3 grid grid-cols-[1.5rem_1fr] grid-rows-[1fr_1.25rem] gap-x-2">
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
            <div className="relative h-56 border-b border-border">
              <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-border" />
              <span
                aria-hidden
                className="absolute inset-x-0 border-t border-dashed border-rose-500"
                style={{ top: `${(1 - THRESHOLD) * 100}%` }}
              />
              <span
                className="absolute right-0 pt-1 text-[10px] text-rose-500 tabular-nums"
                style={{ top: `${(1 - THRESHOLD) * 100}%` }}
              >
                {THRESHOLD.toFixed(2)}
              </span>
              {RUNS.map((r, i) => {
                const pass = r.y >= THRESHOLD;
                const picked = i === PICK;
                return (
                  <span
                    key={r.x}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                      pass ? "bg-emerald-500" : "bg-rose-500",
                      picked ? "size-3.5 ring-rose-500 ring-offset-2 ring-offset-card" : "size-2"
                    )}
                    style={{ left: `${r.x * 100}%`, top: `${(1 - r.y) * 100}%` }}
                  />
                );
              })}
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
        </CardContent>
      </Scene>
      <Scene className="relative z-10 sm:-mt-36 sm:ml-auto sm:w-[44%]">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CheckChip presetId="helpfulness" />
            <Mono>tr_7c1f5a2b</Mono>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-rose-600 tabular-nums dark:text-rose-400">0.42</span>
            <Badge variant="rose">Fail</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg border border-dashed px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconScaleFilled className="mb-px size-3 shrink-0" />
              Judge’s reason
            </span>
            <p className="mt-1 text-[13px] leading-relaxed">
              Restates the status without checking the order. Gives no reason for
              the delay and no next step.
            </p>
          </div>
          <Bubble role="assistant" text={BAD_REPLY} />
        </CardContent>
      </Scene>
    </div>
  );
}
