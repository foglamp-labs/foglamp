"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconArrowUp,
  IconChevronDown,
  IconPaperclip,
  IconUserFilled,
} from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { SpanTypeBadge, SpanTypeChip, spanTypeBar } from "@/components/app/span-type";
import { TraceTimeline } from "@/components/app/trace-timeline";
import {
  SESSION_TURNS,
  TRACE_MESSAGES,
  TRACE_SPANS,
} from "@/components/marketing/demo/mock-data";
import { ModelLogo } from "@/components/model-logo";
import { formatCost, formatSpanDuration, formatTokens } from "@/lib/format";
import { orderSpans, toMs, type TraceSpan } from "@/lib/trace-timeline";

import { Scene } from "./figures-scenes";

// Candidate figures for the traces section. Each starts from the same idea:
// a chat the customer would recognize, and the trace behind one of its
// replies.

const turn = SESSION_TURNS[0]!;
const spans = TRACE_SPANS as unknown as TraceSpan[];
const ROOT = spans[0]!;
const STEPS = spans.slice(1);
const T0 = toMs(ROOT.startTime);

const LIFTED = "shadow-(--custom-shadow-lifted)";

// ─── The chat window ────────────────────────────────────────────────────────

function Avatar({ role }: { role: "user" | "assistant" }) {
  return role === "user" ? (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15 text-muted-foreground">
      <IconUserFilled className="size-3.5" />
    </span>
  ) : (
    <AgentIcon name={ROOT.name} filled className="size-6 shrink-0" />
  );
}

/** A chat app, the way the customer sees the agent: a header, the turn, and
 * a composer. `activity` renders between the question and the reply, for
 * the variants that show the work inline. */
function ChatWindow({
  className,
  activity,
  highlight = false,
  composer = true,
}: {
  className?: string;
  activity?: ReactNode;
  /** Outline the reply, for a figure that points at it. */
  highlight?: boolean;
  composer?: boolean;
}) {
  return (
    <Scene className={cn("gap-0 pt-0 pb-0", className)}>
      <div className="flex items-center gap-2.5 border-b border-border/60 px-5 py-3">
        <AgentIcon name={ROOT.name} filled className="size-5" />
        <span className="text-sm">Support</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Online
        </span>
      </div>
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2.5 text-sm dark:bg-muted-foreground/10">
            {turn.userMessage}
          </p>
        </div>
        {activity}
        <div className="flex gap-3">
          <Avatar role="assistant" />
          <p
            className={cn(
              "min-w-0 flex-1 text-sm leading-relaxed",
              highlight &&
                "-mx-2 -my-1.5 rounded-lg px-2 py-1.5 ring-1 ring-violet-500/50 ring-offset-2 ring-offset-card"
            )}
          >
            {turn.assistantOutput}
          </p>
        </div>
      </div>
      {composer && (
        <div className="px-5 pb-5">
          <div className="flex items-center gap-2 rounded-full border border-border/70 py-1.5 pr-1.5 pl-4 text-sm text-muted-foreground">
            <IconPaperclip className="size-4" />
            <span className="flex-1">Message Support</span>
            <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-background">
              <IconArrowUp className="size-4" />
            </span>
          </div>
        </div>
      )}
    </Scene>
  );
}

// ─── 2. Chat: the chat window, the trace lifted over it ─────────────────────

export function TraceChat() {
  const [selected, setSelected] = useState<string | null>("s3");
  return (
    <div className="grid gap-4 sm:relative sm:block sm:h-128">
      <ChatWindow className="sm:absolute sm:top-0 sm:left-0 sm:z-10 sm:w-[54%]" />
      <Scene
        className={cn(
          "sm:absolute sm:right-0 sm:bottom-0 sm:z-20 sm:w-[84%]",
          LIFTED
        )}
      >
        <CardContent>
          <TraceTimeline
            spans={spans}
            selected={selected}
            onSelect={setSelected}
          />
        </CardContent>
      </Scene>
    </div>
  );
}

// ─── 3. X-ray: a lens over the reply shows the calls behind it ──────────────

function MiniWaterfall() {
  const total = ROOT.durationMs;
  return (
    <div className="flex flex-col gap-2">
      {orderSpans(STEPS).map(({ span, depth }) => {
        const left = ((toMs(span.startTime) - T0) / total) * 100;
        const width = (span.durationMs / total) * 100;
        return (
          <div
            key={span.spanId}
            className="grid grid-cols-[9.5rem_1fr_3rem] items-center gap-3 text-xs"
          >
            <span
              className="flex min-w-0 items-center gap-1.5"
              style={{ paddingLeft: `${depth * 12}px` }}
            >
              <SpanTypeChip type={span.spanType} className="size-4" />
              <span className="truncate">{span.name}</span>
            </span>
            <span className="relative h-1.5 rounded-full bg-muted-foreground/10">
              <span
                className={cn(
                  "absolute inset-y-0 rounded-full",
                  spanTypeBar(span.spanType)
                )}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </span>
            <span className="text-right text-muted-foreground tabular-nums">
              {formatSpanDuration(span.durationMs)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TraceXray() {
  return (
    <div className="grid gap-4 sm:relative sm:block sm:h-128">
      <ChatWindow
        highlight
        className="sm:absolute sm:top-0 sm:left-[6%] sm:z-10 sm:w-[58%]"
      />
      <Scene
        className={cn(
          "sm:absolute sm:top-[52%] sm:right-0 sm:z-20 sm:w-[62%]",
          LIFTED
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <AgentIcon name={ROOT.name} filled className="size-4" />
            {ROOT.name}
          </CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatSpanDuration(ROOT.durationMs)} · {formatCost(turn.totalCost, 4)}
          </span>
        </CardHeader>
        <CardContent className="mt-1">
          <MiniWaterfall />
        </CardContent>
      </Scene>
    </div>
  );
}

// ─── 4. Steps: the work shown inside the chat, like an activity log ─────────

function Activity() {
  return (
    <div className="flex gap-3">
      <span className="size-6 shrink-0" />
      <div className="min-w-0 flex-1 rounded-lg border border-border/60 text-xs">
        <div className="flex items-center gap-1.5 px-3 py-2 text-muted-foreground">
          Worked for {formatSpanDuration(ROOT.durationMs)}
          <IconChevronDown className="size-3.5" />
        </div>
        <ol className="flex flex-col border-t border-border/60 px-3 py-2">
          {orderSpans(STEPS).map(({ span, depth }) => (
            <li
              key={span.spanId}
              className="flex items-center gap-2 py-1"
              style={{ paddingLeft: `${depth * 14}px` }}
            >
              <SpanTypeChip type={span.spanType} className="size-4" />
              <span className="font-mono">{span.name}</span>
              <span className="ml-auto text-muted-foreground tabular-nums">
                {formatSpanDuration(span.durationMs)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function TraceSteps() {
  return (
    <div className="grid gap-4 sm:relative sm:block sm:h-128">
      <ChatWindow
        activity={<Activity />}
        className="sm:absolute sm:top-1/2 sm:right-[6%] sm:z-10 sm:w-[64%] sm:-translate-y-1/2"
      />
    </div>
  );
}

// ─── 5. Inspector: one model call opened up, prompt and answer included ─────

const DRAFT = spans.find((s) => s.spanId === "s5")!;
const DRAFT_MODEL = DRAFT.modelId ?? "gpt-5.6-sol";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
}

export function TraceInspector() {
  return (
    <div className="grid gap-4 sm:relative sm:block sm:h-128">
      <ChatWindow
        composer={false}
        className="sm:absolute sm:top-0 sm:left-0 sm:z-10 sm:w-[56%]"
      />
      <Scene
        className={cn(
          "sm:absolute sm:top-[34%] sm:right-0 sm:z-20 sm:w-[58%]",
          LIFTED
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <SpanTypeChip type={DRAFT.spanType} className="size-4.5" />
            {DRAFT.name}
          </CardTitle>
          <Badge variant="secondary" className="font-sans normal-case">
            <ModelLogo modelId={DRAFT_MODEL} className="size-3" />
            {DRAFT_MODEL}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-3 border-y border-border/60 py-3">
            <Stat label="Duration" value={formatSpanDuration(DRAFT.durationMs)} />
            <Stat label="First token" value={formatSpanDuration(DRAFT.ttftMs ?? 0)} />
            <Stat label="Tokens" value={formatTokens(DRAFT.totalTokens)} />
            <Stat label="Cost" value={formatCost(DRAFT.totalCost ?? 0, 4)} />
          </div>
          <ol className="flex flex-col gap-3">
            {TRACE_MESSAGES.map((m) => (
              <li key={m.role} className="grid grid-cols-[4.5rem_1fr] gap-3 text-xs">
                <span className="pt-px font-mono text-muted-foreground">
                  {m.role}
                </span>
                <span className="line-clamp-2 leading-relaxed">{m.content}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Scene>
    </div>
  );
}

// ─── 6. Graph: the turn as a pipeline of calls ──────────────────────────────

function Node({
  span,
  className,
}: {
  span: TraceSpan;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2 py-1.5 text-xs shadow-(--custom-shadow)",
        className
      )}
    >
      <SpanTypeChip type={span.spanType} className="size-4" />
      <span className="flex flex-col leading-tight">
        <span className="font-mono whitespace-nowrap">{span.name}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatSpanDuration(span.durationMs)}
        </span>
      </span>
    </span>
  );
}

const Edge = () => <span className="mt-6 h-px w-3 shrink-0 bg-border" />;

export function TraceGraph() {
  const [s1, s2, s3, s4, s5] = STEPS as [
    TraceSpan,
    TraceSpan,
    TraceSpan,
    TraceSpan,
    TraceSpan,
  ];
  return (
    <div className="grid gap-4 sm:relative sm:block sm:h-128">
      <ChatWindow
        composer={false}
        className="sm:absolute sm:top-0 sm:right-[4%] sm:z-10 sm:w-[54%]"
      />
      <Scene
        className={cn(
          "sm:absolute sm:bottom-0 sm:left-0 sm:z-20 sm:w-full",
          LIFTED
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <SpanTypeBadge type="agent" className="font-sans" />
            {ROOT.name}
          </CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatSpanDuration(ROOT.durationMs)} · {formatTokens(turn.totalTokens)} tokens ·{" "}
            {formatCost(turn.totalCost, 4)}
          </span>
        </CardHeader>
        <CardContent className="mt-2 overflow-x-auto pb-1">
          <div className="flex items-start">
            <span className="mt-3 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15 text-muted-foreground">
              <IconUserFilled className="size-3.5" />
            </span>
            <Edge />
            <Node span={s1} className="mt-0.5" />
            <Edge />
            <Node span={s2} className="mt-0.5" />
            <Edge />
            <div className="flex flex-col items-start">
              <Node span={s3} className="mt-0.5" />
              <span className="ml-5 h-3 w-px bg-border" />
              <Node span={s4} className="ml-5" />
            </div>
            <Edge />
            <Node span={s5} className="mt-0.5" />
            <Edge />
            <span className="mt-3">
              <AgentIcon name={ROOT.name} filled className="size-6" />
            </span>
          </div>
        </CardContent>
      </Scene>
    </div>
  );
}
