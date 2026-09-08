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
  IconChecks,
  IconChevronDown,
  IconCopy,
  IconDotsVertical,
  IconMicrophone,
  IconPlus,
  IconRefresh,
  IconThumbDown,
  IconThumbUp,
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
// The model calls carry a model, so the timeline shows its logo in place of
// the generic chip.
const spans = TRACE_SPANS.map((s) =>
  s.spanType === "llm"
    ? { ...s, provider: "anthropic", modelId: "claude-fable-5" }
    : s
) as unknown as TraceSpan[];
const ROOT = spans[0]!;
const STEPS = spans.slice(1);
const T0 = toMs(ROOT.startTime);

const LIFTED = "shadow-(--custom-shadow-lifted)";

// ─── The chat window ────────────────────────────────────────────────────────

function AgentAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-violet-500/10",
        className
      )}
    >
      <AgentIcon name={ROOT.name} filled className="size-[55%]" />
    </span>
  );
}

function ToolPill({ name, count }: { name: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 py-0.5 pr-2 pl-1 text-[11px] text-muted-foreground">
      <SpanTypeChip type="tool" className="size-3.5" />
      <span className="font-mono">{name}</span>
      {count > 1 && <span className="tabular-nums">×{count}</span>}
    </span>
  );
}

/** A support chat, the way the customer sees the agent: a header, one turn
 * with the tools it used and the usual actions, and a composer. `activity`
 * renders between the question and the reply, for the variants that show
 * the work inline. */
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
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <AgentAvatar className="size-8" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-sm">Acme Support</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Replies in seconds
          </span>
        </span>
        <IconDotsVertical className="ml-auto size-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-5 px-4 py-5">
        <span className="text-center text-[11px] text-muted-foreground">
          Today
        </span>
        <div className="flex flex-col items-end gap-1">
          <p className="max-w-[85%] rounded-3xl rounded-br-lg bg-muted px-4 py-2.5 text-sm dark:bg-muted-foreground/10">
            {turn.userMessage}
          </p>
          <span className="flex items-center gap-1 pr-1 text-[11px] text-muted-foreground tabular-nums">
            10:42
            <IconChecks className="size-3.5 text-sky-500" />
          </span>
        </div>
        {activity}
        <div className="flex gap-3">
          <AgentAvatar className="mt-0.5 size-7" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <p
              className={cn(
                "text-sm leading-relaxed",
                highlight &&
                  "-mx-2 -my-1.5 rounded-lg px-2 py-1.5 ring-1 ring-violet-500/50 ring-offset-2 ring-offset-card"
              )}
            >
              {turn.assistantOutput}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {turn.toolCalls?.map((tc) => (
                <ToolPill key={tc.name} name={tc.name} count={tc.count} />
              ))}
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <IconCopy className="size-3.5" />
              <IconThumbUp className="size-3.5" />
              <IconThumbDown className="size-3.5" />
              <IconRefresh className="size-3.5" />
            </div>
          </div>
        </div>
      </div>
      {composer && (
        <div className="px-4 pb-3">
          <div className="flex flex-col gap-2 rounded-3xl border border-border/70 px-3 pt-3 pb-2 shadow-(--custom-shadow)">
            <span className="px-1 text-sm text-muted-foreground">
              Message Acme Support
            </span>
            <div className="flex items-center gap-1">
              <span className="flex size-7 items-center justify-center rounded-full border border-border/70 text-muted-foreground">
                <IconPlus className="size-4" />
              </span>
              <span className="ml-auto flex size-7 items-center justify-center text-muted-foreground">
                <IconMicrophone className="size-4" />
              </span>
              <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-background">
                <IconArrowUp className="size-4" />
              </span>
            </div>
          </div>
          <p className="pt-2.5 text-center text-[11px] text-muted-foreground">
            Answers are generated by AI
          </p>
        </div>
      )}
    </Scene>
  );
}

// ─── 2. Chat: the chat window, the trace lifted over it ─────────────────────

export function TraceChat() {
  const [selected, setSelected] = useState<string | null>("s3");
  return (
    <div className="grid gap-4 sm:relative sm:block sm:h-168">
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

// ─── 3. X-ray: the chat in front, the trace behind the reply ────────────────

export function TraceXray() {
  const [selected, setSelected] = useState<string | null>("s5");
  return (
    <div className="grid gap-4 sm:relative sm:block sm:h-176">
      <Scene className="sm:absolute sm:bottom-0 sm:left-0 sm:z-10 sm:w-[84%]">
        <CardContent>
          <TraceTimeline
            spans={spans}
            selected={selected}
            onSelect={setSelected}
          />
        </CardContent>
      </Scene>
      <ChatWindow
        highlight
        className={cn(
          "sm:absolute sm:top-0 sm:right-0 sm:z-20 sm:w-[52%]",
          LIFTED
        )}
      />
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
