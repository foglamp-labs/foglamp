import type { Span, SpanStatus, Trace, Usage } from "../wire";

/** Per-trace totals, summed at finalize. `costUsd` is null when unpriced. */
export interface HudTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  /** Priced server-side via @foglamp/cost; null when the model is unknown. */
  costUsd: number | null;
}

interface Base {
  /** Epoch ms when the event was emitted. */
  ts: number;
  /** The top-level call id (one trace). */
  traceId: string;
}

/**
 * A live execution event. Discriminated by `type`. The HUD maintains an
 * in-memory model keyed by `traceId` and folds these in as they arrive; a
 * client that connects mid-run is replayed the broker's recent buffer first.
 */
export type HudEvent =
  | (Base & {
      type: "trace.start";
      /** Display label (traceName ?? agentName ?? operation). */
      name: string;
      agentName?: string;
      traceName?: string;
      workflowName?: string;
      workflowRunId?: string;
      sessionId?: string;
      provider?: string;
      model?: string;
      /** JSON catalog of tools offered to the model, if known at start. */
      toolCatalog?: string;
    })
  | (Base & { type: "step.start"; stepNumber: number; provider?: string; model?: string })
  | (Base & { type: "step.firstToken"; stepNumber: number; ttftMs?: number })
  | (Base & {
      type: "step.tokens";
      stepNumber: number;
      /** Cumulative output tokens so far this step. */
      outputTokens: number;
      /** Cumulative reasoning tokens so far (reasoning models). */
      reasoningTokens?: number;
      /** Instantaneous output tokens/sec, if derivable. */
      tps?: number;
    })
  | (Base & { type: "tool.start"; toolCallId: string; toolName: string; input?: string })
  | (Base & {
      type: "tool.end";
      toolCallId: string;
      toolName: string;
      status: SpanStatus;
      output?: string;
      errorMessage?: string;
      durationMs?: number;
    })
  | (Base & {
      type: "step.end";
      stepNumber: number;
      status: SpanStatus;
      usage?: Usage;
      ttftMs?: number;
      durationMs?: number;
      outputTps?: number;
      modelCallMs?: number;
    })
  | (Base & {
      type: "trace.end";
      status: SpanStatus;
      /** The fully-assembled trace (same shape the dashboard renders). */
      trace: Trace;
      totals: HudTotals;
    });

export type HudEventType = HudEvent["type"];

/** Sum a finalized trace's spans into HUD totals (cost filled in by the caller). */
export function totalsFromSpans(spans: Span[], costUsd: number | null): HudTotals {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = 0;
  for (const s of spans) {
    inputTokens += s.usage?.inputTokens ?? 0;
    outputTokens += s.usage?.outputTokens ?? 0;
    totalTokens += s.usage?.totalTokens ?? 0;
    if (s.startTime < minStart) minStart = s.startTime;
    if (s.endTime > maxEnd) maxEnd = s.endTime;
  }
  const durationMs = Number.isFinite(minStart) ? Math.max(0, maxEnd - minStart) : 0;
  return { inputTokens, outputTokens, totalTokens, durationMs, costUsd };
}
