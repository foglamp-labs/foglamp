"use client";

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
  IconArrowRight,
  IconCircleCheckFilled,
  IconMessage2Filled,
} from "@tabler/icons-react";
import { useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { Chip } from "@/components/app/context-chip";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { HeatCell } from "@/components/app/heat-cell";
import { SpanTypeBadge, SpanTypeChip, spanTypeBar } from "@/components/app/span-type";
import { ToolIcon } from "@/components/app/tool-icon";
import { TraceTimeline } from "@/components/app/trace-timeline";
import { TRACE_SPANS } from "@/components/marketing/demo/mock-data";
import { ModelLogo, formatModelName } from "@/components/model-logo";
import type { TraceSpan } from "@/lib/trace-timeline";
import {
  formatCost,
  formatCostFixed,
  formatSpanDuration,
  formatTokens,
} from "@/lib/format";

import {
  Field,
  Mono,
  Panel,
  quintiles,
  REPLY,
  SPANS,
  type Span,
  TRACE,
} from "./figure-kit";

const TOTAL = TRACE.durationMs;

function depthOf(span: Span): number {
  let d = 0;
  let cur = span;
  while (cur.parent) {
    const p = SPANS.find((s) => s.id === cur.parent);
    if (!p) break;
    d += 1;
    cur = p;
  }
  return d;
}

// ─── 1. Waterfall: the span tree against time ───────────────────────────────

function Waterfall({
  selected,
  onSelect,
  compact = false,
}: {
  selected?: string | null;
  onSelect?: (id: string) => void;
  compact?: boolean;
}) {
  const stops = [0, 0.25, 0.5, 0.75];
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "grid items-center gap-3 text-[11px] text-muted-foreground tabular-nums",
          compact ? "grid-cols-[9rem_1fr_3rem]" : "grid-cols-[13rem_1fr_3.5rem]"
        )}
      >
        <span>Span</span>
        <div className="relative h-4">
          {stops.map((s) => (
            <span
              key={s}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${s * 100}%` }}
            >
              {formatSpanDuration(s * TOTAL)}
            </span>
          ))}
        </div>
        <span className="text-right">Time</span>
      </div>
      <div className="mt-1 divide-y divide-border/40">
        {SPANS.map((s) => {
          const depth = depthOf(s);
          const on = selected === s.id;
          const Row = onSelect ? "button" : "div";
          return (
            <Row
              key={s.id}
              type={onSelect ? "button" : undefined}
              onClick={onSelect ? () => onSelect(s.id) : undefined}
              className={cn(
                "grid w-full items-center gap-3 py-1.5 text-left",
                compact ? "grid-cols-[9rem_1fr_3rem]" : "grid-cols-[13rem_1fr_3.5rem]",
                onSelect && "cursor-pointer hover:bg-muted/50",
                on && "bg-muted/60"
              )}
            >
              <span
                className="flex min-w-0 items-center gap-1.5"
                style={{ paddingLeft: `${depth * 14}px` }}
              >
                <SpanTypeChip type={s.type} />
                <span className="truncate text-[13px]">{s.name}</span>
              </span>
              <span className="relative h-4">
                {stops.slice(1).map((st) => (
                  <span
                    key={st}
                    aria-hidden
                    className="absolute inset-y-0 w-px bg-border/60"
                    style={{ left: `${st * 100}%` }}
                  />
                ))}
                <span
                  className={cn("absolute inset-y-0.5 rounded-xs", spanTypeBar(s.type))}
                  style={{
                    left: `${(s.start / TOTAL) * 100}%`,
                    width: `${Math.max(0.6, ((s.end - s.start) / TOTAL) * 100)}%`,
                  }}
                />
              </span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {formatSpanDuration(s.end - s.start)}
              </span>
            </Row>
          );
        })}
      </div>
    </div>
  );
}

function TraceHeader() {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-[15px] font-medium">{TRACE.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <AgentIcon name={TRACE.agent} className="size-3.5" />
            {TRACE.agent}
          </span>
          <span className="flex items-center gap-1">
            <ModelLogo modelId={TRACE.model} className="size-3" />
            {formatModelName(TRACE.model)}
          </span>
          <span className="flex items-center gap-1">
            <CustomerAvatar customerId={TRACE.customer.id} className="size-3" />
            {TRACE.customer.name}
          </span>
          <Mono>{TRACE.id.slice(0, 11)}</Mono>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
        <span>{formatSpanDuration(TRACE.durationMs)}</span>
        <span>{formatTokens(TRACE.tokens)} tok</span>
        <span>{formatCost(TRACE.cost, 4)}</span>
      </div>
    </div>
  );
}

export function TraceWaterfall() {
  return (
    <Panel>
      <TraceHeader />
      <Waterfall />
    </Panel>
  );
}

// ─── 2. Timeline: the app's own trace timeline component ────────────────────

const spans = TRACE_SPANS as unknown as TraceSpan[];

export function TraceRealTimeline() {
  const [selected, setSelected] = useState<string | null>("s3");
  return (
    <Panel>
      <TraceTimeline spans={spans} selected={selected} onSelect={setSelected} />
    </Panel>
  );
}

// ─── 3. List: the traces table ──────────────────────────────────────────────

const ROWS = [
  { ...TRACE, spans: 6 },
  {
    id: "tr_3b8e1d6a9c2f7b4e0a5d",
    title: "Compare vector DB options for a 50M-embedding workload",
    agent: "research-planner",
    model: "claude-fable-5",
    customer: { id: "cus_globex", name: "Globex" },
    spans: 14,
    tokens: 11800,
    durationMs: 9120,
    cost: 0.124,
    when: "48s ago",
  },
  {
    id: "tr_2d9a6c3f1b8e5d4a7c0f",
    title: "Draft a renewal reminder for dormant workspaces",
    agent: "email-drafter",
    model: "gemini-3.5-flash",
    customer: { id: "cus_initech", name: "Initech" },
    spans: 4,
    tokens: 1900,
    durationMs: 1620,
    cost: 0.0031,
    when: "2m ago",
  },
  {
    id: "tr_7c1f5a2b9e4d8a3c6b0e",
    title: "Review PR #1187: retry budget for the outbox worker",
    agent: "code-reviewer",
    model: "gpt-5.6-sol",
    customer: { id: "cus_acme", name: "Acme Inc" },
    spans: 9,
    tokens: 7400,
    durationMs: 6480,
    cost: 0.062,
    when: "5m ago",
  },
];

const ROW_COST_Q = quintiles(ROWS.map((r) => r.cost));
const ROW_TIME_Q = quintiles(ROWS.map((r) => r.durationMs));

export function TraceList() {
  return (
    <Panel inset={false}>
      <TooltipProvider delay={150}>
        <Table className="table-fixed [&_td]:px-3 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:px-3 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Trace</TableHead>
              <TableHead className="w-40">Agent</TableHead>
              <TableHead className="w-20 text-right">Duration</TableHead>
              <TableHead className="w-24 text-right">Cost</TableHead>
              <TableHead className="w-20 pr-5 text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-5">
                  <span className="flex min-w-0 items-center gap-2">
                    <IconMessage2Filled className="size-3.5 shrink-0 text-muted-foreground/60" />
                    <span className="truncate">{r.title}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <AgentIcon name={r.agent} className="size-3.5 shrink-0" />
                    <span className="truncate">{r.agent}</span>
                  </span>
                </TableCell>
                <HeatCell value={r.durationMs} thresholds={ROW_TIME_Q} metric="duration">
                  {formatSpanDuration(r.durationMs)}
                </HeatCell>
                <HeatCell value={r.cost} thresholds={ROW_COST_Q}>
                  {formatCostFixed(r.cost, 4)}
                </HeatCell>
                <TableCell className="pr-5 text-right text-muted-foreground tabular-nums">
                  {r.when}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TooltipProvider>
    </Panel>
  );
}

// ─── 4. Exchange: one model call with its prompt and response ───────────────

const MESSAGES = [
  {
    role: "system",
    text: "You are a support agent for Northwind. Be warm and concise. Use the order tools before answering questions about shipping.",
  },
  { role: "user", text: TRACE.title },
  { role: "assistant", text: REPLY },
] as const;

function Message({ role, text }: { role: string; text: string }) {
  return (
    <div className="flex gap-4">
      <span className="w-16 shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {role}
      </span>
      <p
        className={cn(
          "min-w-0 text-[13px] leading-relaxed",
          role === "system" && "truncate text-muted-foreground"
        )}
      >
        {text}
      </p>
    </div>
  );
}

function ExchangeHeader({ name }: { name: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <SpanTypeBadge type="llm" />
        <span className="font-medium">{name}</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
        <span className="flex items-center gap-1">
          <ModelLogo modelId={TRACE.model} className="size-3" />
          {formatModelName(TRACE.model)}
        </span>
        <span>1.8k tok</span>
        <span>2.82s</span>
        <span>{formatCost(0.0091, 4)}</span>
      </div>
    </div>
  );
}

export function TraceExchange() {
  return (
    <Panel>
      <ExchangeHeader name="draft-reply" />
      <div className="mt-4 flex flex-col gap-4 border-t border-border/60 pt-4">
        {MESSAGES.map((m) => (
          <Message key={m.role} role={m.role} text={m.text} />
        ))}
      </div>
    </Panel>
  );
}

// ─── 5. Tool: a tool call with its input and output ─────────────────────────

const TOOL_INPUT = `{
  "orderId": "48213"
}`;

const TOOL_OUTPUT = `{
  "status": "processing",
  "placedAt": "2026-06-10",
  "hold": "backorder",
  "items": [{ "sku": "NW-2210", "qty": 1 }],
  "estimatedShip": "2026-06-18"
}`;

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
      <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

export function TraceTool() {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SpanTypeBadge type="tool" />
          <span className="font-medium">fetch-order</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
          <span className="flex items-center gap-1">
            <IconCircleCheckFilled className="size-3.5 text-emerald-500" />
            ok
          </span>
          <span>440ms</span>
          <span>1 of 6 spans</span>
        </div>
      </div>
      <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
        <CodeBlock label="Input" code={TOOL_INPUT} />
        <CodeBlock label="Output" code={TOOL_OUTPUT} />
      </div>
    </Panel>
  );
}

// ─── 6. Inspector: waterfall plus the selected span's details ───────────────

const TYPE_LABEL: Record<Span["type"], string> = {
  agent: "Agent",
  llm: "Model",
  tool: "Tool",
};

export function TraceInspector() {
  const [selected, setSelected] = useState<string>("s5");
  const span = SPANS.find((s) => s.id === selected) ?? SPANS[0]!;
  const ms = span.end - span.start;
  const share = Math.round((ms / TOTAL) * 100);
  return (
    <Panel>
      <div className="grid gap-6 lg:grid-cols-[1fr_15rem]">
        <Waterfall compact selected={selected} onSelect={setSelected} />
        <aside className="flex min-w-0 flex-col gap-4 border-t border-border/60 pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <div className="flex items-center gap-2">
            <SpanTypeChip type={span.type} />
            <span className="truncate font-medium">{span.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Type" value={TYPE_LABEL[span.type]} />
            <Field label="Duration" value={formatSpanDuration(ms)} />
            <Field label="Started at" value={`+${formatSpanDuration(span.start)}`} />
            <Field label="Share of trace" value={`${share}%`} />
            {span.tokens !== undefined && (
              <Field label="Tokens" value={formatTokens(span.tokens)} />
            )}
            {span.cost !== undefined && (
              <Field label="Cost" value={formatCost(span.cost, 4)} />
            )}
          </div>
          {span.type === "llm" && (
            <div className="border-t border-border/60 pt-3">
              <div className="mb-1 text-xs text-muted-foreground">Response</div>
              <p className="line-clamp-4 text-[13px] leading-relaxed">{REPLY}</p>
            </div>
          )}
        </aside>
      </div>
    </Panel>
  );
}

// ─── 7. Flow: the run as a chain of steps ───────────────────────────────────

const STEPS = SPANS.filter((s) => s.parent === "s0");

export function TraceFlow() {
  return (
    <Panel>
      <TraceHeader />
      <div className="flex flex-wrap items-center gap-y-3">
        <Chip
          icon={<AgentIcon name={TRACE.agent} className="size-3.5" />}
          label={TRACE.agent}
        />
        {STEPS.map((s) => (
          <span key={s.id} className="flex items-center">
            <IconArrowRight className="mx-1.5 size-3.5 shrink-0 text-muted-foreground/60" />
            <Chip
              icon={<SpanTypeChip type={s.type} className="size-4" />}
              label={s.name}
              trailing={formatSpanDuration(s.end - s.start)}
            />
          </span>
        ))}
      </div>
    </Panel>
  );
}

// ─── 8. Session: several turns, each with its tool calls ────────────────────

const TURNS = [
  {
    user: TRACE.title,
    tools: [
      { name: "fetch-order", ms: 440 },
      { name: "search-knowledge-base", ms: 1340 },
    ],
    ms: 5840,
    cost: 0.0128,
    reply: REPLY,
  },
  {
    user: "Can you send that to my email as well?",
    tools: [
      { name: "crm-lookup", ms: 380 },
      { name: "send-email", ms: 610 },
    ],
    ms: 2910,
    cost: 0.0064,
    reply: "Done. I sent the update to ops@acme.com with the new tracking link.",
  },
  {
    user: "Thanks, that's all.",
    tools: [],
    ms: 1120,
    cost: 0.0018,
    reply: "You're welcome. Have a great day.",
  },
];

export function TraceSession() {
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">Session</span>
          <Mono>ses_a91f</Mono>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
          <span>3 turns</span>
          <span>9.87s</span>
          <span>{formatCost(0.021, 3)}</span>
        </div>
      </div>
      <div className="divide-y divide-border/40">
        {TURNS.map((t, i) => (
          <div key={t.user} className="flex gap-4 py-3">
            <span className="w-5 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">{t.user}</p>
              <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">
                {t.reply}
              </p>
              {t.tools.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {t.tools.map((tool) => (
                    <Chip
                      key={tool.name}
                      icon={<ToolIcon name={tool.name} className="size-3.5 text-blue-500" />}
                      label={tool.name}
                      trailing={formatSpanDuration(tool.ms)}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground tabular-nums">
              <span>{formatSpanDuration(t.ms)}</span>
              <span>{formatCost(t.cost, 4)}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
