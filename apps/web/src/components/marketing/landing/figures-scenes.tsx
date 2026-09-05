"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import { IconGhostFilled, IconTool, IconUserFilled } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { Chip } from "@/components/app/context-chip";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { TraceTimeline } from "@/components/app/trace-timeline";
import { SESSION_TURNS, TRACE_SPANS } from "@/components/marketing/demo/mock-data";
import { ModelLogo } from "@/components/model-logo";
import { formatCost, formatSpanDuration } from "@/lib/format";
import type { TraceSpan } from "@/lib/trace-timeline";

import { AGENTS, CUSTOMERS, MODELS, Mono } from "./figure-kit";

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
