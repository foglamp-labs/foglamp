import type { HudEvent, HudTotals } from "../events";
import type { Span, SpanStatus } from "../../wire";

export type RunStatus = "running" | "ok" | "error";

export interface HudToolCall {
  toolCallId: string;
  toolName: string;
  status: RunStatus;
  input?: string;
  output?: string;
  errorMessage?: string;
  durationMs?: number;
  startedAt: number;
}

export interface HudStep {
  stepNumber: number;
  status: RunStatus;
  ttftMs?: number;
  /** Live estimate while streaming; exact (from usage) at step end. */
  outputTokens: number;
  reasoningTokens?: number;
  durationMs?: number;
  outputTps?: number;
  startedAt: number;
}

export interface HudTrace {
  traceId: string;
  name: string;
  agentName?: string;
  workflowName?: string;
  provider?: string;
  model?: string;
  /** Tool names offered to the model (the "armory"), parsed from toolCatalog. */
  toolNames: string[];
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  steps: HudStep[];
  tools: HudToolCall[];
  totals?: HudTotals;
}

export interface HudState {
  /** Most-recent-first, capped. */
  traces: HudTrace[];
  /** Monotonic count of runs seen this session — uncapped, unlike `traces`. */
  sessionCount: number;
}

export const initialState: HudState = { traces: [], sessionCount: 0 };

const MAX_TRACES = 30;

/** A call-tree row: steps and tool calls interleaved in fire order. */
export type HudRow =
  | { kind: "step"; key: string; step: HudStep }
  | { kind: "tool"; key: string; tool: HudToolCall };

/** Steps + tools merged and sorted by start time — the live call tree. */
export function rows(trace: HudTrace): HudRow[] {
  const out: HudRow[] = [
    ...trace.steps.map((step) => ({ kind: "step" as const, key: `s${step.stepNumber}`, step })),
    ...trace.tools.map((tool) => ({ kind: "tool" as const, key: `t${tool.toolCallId}`, tool })),
  ];
  out.sort((a, b) => start(a) - start(b));
  return out;
}

function start(row: HudRow): number {
  return row.kind === "step" ? row.step.startedAt : row.tool.startedAt;
}

function parseToolCatalog(json: string | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Record<string, unknown> | unknown[];
    if (Array.isArray(parsed)) return parsed.map(String);
    return Object.keys(parsed);
  } catch {
    return [];
  }
}

/** Stream events plus a client-only "clear" action (the list's trash button). */
export type HudAction = HudEvent | { type: "clear" };

export function reduce(state: HudState, action: HudAction): HudState {
  if (action.type === "clear") return initialState;
  const event = action;
  const traces = state.traces.slice();
  const idx = traces.findIndex((t) => t.traceId === event.traceId);

  if (event.type === "trace.start") {
    const trace: HudTrace = {
      traceId: event.traceId,
      name: event.name,
      agentName: event.agentName,
      workflowName: event.workflowName,
      provider: event.provider,
      model: event.model,
      toolNames: parseToolCatalog(event.toolCatalog),
      status: "running",
      startedAt: event.ts,
      steps: [],
      tools: [],
    };
    const without = traces.filter((t) => t.traceId !== event.traceId);
    return {
      traces: [trace, ...without].slice(0, MAX_TRACES),
      sessionCount: state.sessionCount + 1,
    };
  }

  // Any other event for an unknown trace (e.g. connected mid-run, missed
  // trace.start in the backfill window) lazily mints a stub so it still renders.
  let trace: HudTrace =
    idx >= 0
      ? { ...traces[idx]! }
      : {
          traceId: event.traceId,
          name: event.traceId,
          toolNames: [],
          status: "running",
          startedAt: event.ts,
          steps: [],
          tools: [],
        };

  switch (event.type) {
    case "step.start":
      // First event for a step/tool stamps its startedAt (= this event's ts) via
      // upsert's base, so the waterfall positions each bar at its real time —
      // not all at trace.startedAt (which left-aligned every live row).
      trace = upsertStep(trace, event.stepNumber, event.ts, (s) => s);
      break;
    case "step.firstToken":
      trace = upsertStep(trace, event.stepNumber, event.ts, (s) => ({
        ...s,
        ttftMs: event.ttftMs ?? s.ttftMs,
      }));
      break;
    case "step.tokens":
      trace = upsertStep(trace, event.stepNumber, event.ts, (s) => ({
        ...s,
        outputTokens: Math.max(s.outputTokens, event.outputTokens),
        reasoningTokens: event.reasoningTokens ?? s.reasoningTokens,
      }));
      break;
    case "step.end":
      trace = upsertStep(trace, event.stepNumber, event.ts, (s) => ({
        ...s,
        status: event.status === "error" ? "error" : "ok",
        ttftMs: event.ttftMs ?? s.ttftMs,
        outputTokens: event.usage?.outputTokens ?? s.outputTokens,
        reasoningTokens: event.usage?.reasoningTokens ?? s.reasoningTokens,
        durationMs: event.durationMs ?? s.durationMs,
        outputTps: event.outputTps ?? s.outputTps,
      }));
      break;
    case "tool.start":
      trace = upsertTool(trace, event.toolCallId, event.ts, (t) => ({
        ...t,
        toolName: event.toolName,
        input: event.input ?? t.input,
      }));
      break;
    case "tool.end":
      trace = upsertTool(trace, event.toolCallId, event.ts, (t) => ({
        ...t,
        toolName: event.toolName,
        status: event.status === "error" ? "error" : "ok",
        output: event.output ?? t.output,
        errorMessage: event.errorMessage ?? t.errorMessage,
        durationMs: event.durationMs ?? t.durationMs,
      }));
      break;
    case "trace.end":
      trace = {
        ...trace,
        status: event.status === "error" ? "error" : "ok",
        endedAt: event.ts,
        totals: event.totals,
        // Snap to authoritative final spans.
        steps: stepsFromSpans(event.trace.spans),
        tools: toolsFromSpans(event.trace.spans),
      };
      break;
  }

  const without = traces.filter((t) => t.traceId !== event.traceId);
  return {
    traces: [trace, ...without].slice(0, MAX_TRACES),
    // A lazily-minted stub is still a run seen this session — count it, or the
    // header says "Waiting for a run…" above a populated list.
    sessionCount: idx >= 0 ? state.sessionCount : state.sessionCount + 1,
  };
}

function upsertStep(
  trace: HudTrace,
  stepNumber: number,
  ts: number,
  update: (step: HudStep) => HudStep,
): HudTrace {
  const steps = trace.steps.slice();
  const i = steps.findIndex((s) => s.stepNumber === stepNumber);
  // New step: stamp startedAt with the first event's ts (its real start time).
  const base: HudStep =
    i >= 0 ? steps[i]! : { stepNumber, status: "running", outputTokens: 0, startedAt: ts };
  const next = update(base);
  if (i >= 0) steps[i] = next;
  else steps.push(next);
  return { ...trace, steps };
}

function upsertTool(
  trace: HudTrace,
  toolCallId: string,
  ts: number,
  update: (tool: HudToolCall) => HudToolCall,
): HudTrace {
  const tools = trace.tools.slice();
  const i = tools.findIndex((t) => t.toolCallId === toolCallId);
  const base: HudToolCall =
    i >= 0 ? tools[i]! : { toolCallId, toolName: "tool", status: "running", startedAt: ts };
  const next = update(base);
  if (i >= 0) tools[i] = next;
  else tools.push(next);
  return { ...trace, tools };
}

function runStatus(status: SpanStatus): RunStatus {
  return status === "error" ? "error" : "ok";
}

function stepsFromSpans(spans: Span[]): HudStep[] {
  return spans
    .filter((s) => s.spanType === "llm")
    .map((s) => {
      const match = s.spanId.match(/:step:(\d+)$/);
      return {
        stepNumber: match ? Number(match[1]) : 0,
        status: runStatus(s.status),
        ttftMs: s.ttftMs,
        outputTokens: s.usage?.outputTokens ?? 0,
        reasoningTokens: s.usage?.reasoningTokens,
        durationMs: Math.max(0, s.endTime - s.startTime),
        outputTps: s.outputTps,
        startedAt: s.startTime,
      };
    });
}

function toolsFromSpans(spans: Span[]): HudToolCall[] {
  return spans
    .filter((s) => s.spanType === "tool")
    .map((s) => {
      const match = s.spanId.match(/:tool:(.+)$/);
      return {
        toolCallId: match ? match[1]! : s.spanId,
        toolName: s.name,
        status: runStatus(s.status),
        input: s.input,
        output: s.output,
        errorMessage: s.errorMessage,
        durationMs: Math.max(0, s.endTime - s.startTime),
        startedAt: s.startTime,
      };
    });
}
