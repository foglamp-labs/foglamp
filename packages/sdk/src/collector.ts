import type { Telemetry } from "ai";

import { coerceMetadata, serialize } from "./serialize";
import { Transport } from "./transport";
import type { IntegrationContext, ResolvedConfig } from "./types";
import { mapUsage } from "./usage";
import type { Metadata, Span, Trace } from "./wire";

// Maps the AI SDK v7 `Telemetry` lifecycle onto Watchtower's trace/span model:
//   trace  = one top-level generateText/streamText call (keyed by `callId`)
//   agent  = the root span for that call            → `${callId}:root`
//   llm    = one model step (from `onStepFinish`)   → `${callId}:step:${n}`
//   tool   = one tool execution (from `onToolExecutionEnd`) → `${callId}:tool:${id}`
//
// One `Collector` is both the global integration (`registerTelemetry(wt)`) and a
// factory for per-call ones (`wt.integration(ctx)`); they share a Transport. Cost
// is NOT computed here — it's added at ingest from the token dimensions we report.
//
// Every handler is wrapped so telemetry never throws into, or adds latency to,
// the host application.

// The SDK's event unions are broad and tool-generic; we read a small, stable
// subset through these structural views (guarded at runtime) rather than fight
// the generics. Handler signatures still bind exactly to `Telemetry` below.
interface StartView {
  callId?: string;
  operationId?: string;
  provider?: string;
  modelId?: string;
  functionId?: string;
  recordInputs?: boolean;
  recordOutputs?: boolean;
  messages?: unknown;
}
interface StepStartView {
  callId?: string;
  stepNumber?: number;
  messages?: unknown;
}
interface ChunkView {
  chunk?: { type?: string; callId?: string; stepNumber?: number };
}
interface StepEndView {
  callId?: string;
  stepNumber?: number;
  model?: { provider?: string; modelId?: string };
  usage?: Parameters<typeof mapUsage>[0];
  text?: string;
  content?: unknown;
  finishReason?: string;
}
interface FinishView {
  callId?: string;
  text?: string;
}
interface ToolStartView {
  callId?: string;
  toolCall?: { toolCallId?: string; toolName?: string; input?: unknown };
}
interface ToolEndView {
  callId?: string;
  durationMs?: number;
  toolCall?: { toolCallId?: string; toolName?: string; input?: unknown };
  toolOutput?: { type?: string; output?: unknown; error?: unknown };
}

interface TraceBuilder {
  startTime: number;
  endTime: number;
  context: IntegrationContext;
  recordInputs: boolean;
  recordOutputs: boolean;
  operationId: string | undefined;
  provider: string | undefined;
  modelId: string | undefined;
  rootInput: string | undefined;
  finalOutput: string | undefined;
  error: string | undefined;
  spans: Span[];
  stepStart: Map<number, number>;
  stepInput: Map<number, string>;
  ttft: Map<number, number>;
  toolStart: Map<string, number>;
}

// The wire contract caps spans per trace; keep the root + most recent under it.
const MAX_SPANS_PER_TRACE = 2_000;
const ERROR_MESSAGE_CAP = 8_192;

export class Collector implements Telemetry {
  private readonly transport: Transport;
  private readonly config: ResolvedConfig;
  private readonly context: IntegrationContext | undefined;
  private readonly builders = new Map<string, TraceBuilder>();

  constructor(transport: Transport, config: ResolvedConfig, context?: IntegrationContext) {
    this.transport = transport;
    this.config = config;
    this.context = context;
  }

  /**
   * Bind per-call context and return a `Telemetry` that shares this transport.
   * Pass to `telemetry: { integrations: [wt.integration({ agentName, … })] }`.
   */
  integration(context: IntegrationContext = {}): Collector {
    return new Collector(this.transport, this.config, context);
  }

  /** Flush buffered traces now (await before a serverless handler returns). */
  flush(): Promise<void> {
    return this.transport.flush();
  }

  /** Stop the flush timer and drain all buffered traces. */
  shutdown(): Promise<void> {
    return this.transport.shutdown();
  }

  /** Traces currently buffered (not yet POSTed). */
  get pending(): number {
    return this.transport.size();
  }

  // --- Telemetry lifecycle ------------------------------------------------

  onStart: NonNullable<Telemetry["onStart"]> = (event) => {
    this.guard(() => {
      const e = event as StartView;
      if (!e.callId) return;
      const recordInputs = e.recordInputs ?? this.config.recordInputs;
      const recordOutputs = e.recordOutputs ?? this.config.recordOutputs;
      // Per-call context wins; otherwise the global path maps functionId→agent.
      const context: IntegrationContext = this.context ?? { agentName: e.functionId };
      const now = Date.now();
      this.builders.set(e.callId, {
        startTime: now,
        endTime: now,
        context,
        recordInputs,
        recordOutputs,
        operationId: e.operationId,
        provider: e.provider,
        modelId: e.modelId,
        rootInput: recordInputs ? serialize(e.messages, this.config.maxPayloadChars) : undefined,
        finalOutput: undefined,
        error: undefined,
        spans: [],
        stepStart: new Map(),
        stepInput: new Map(),
        ttft: new Map(),
        toolStart: new Map(),
      });
    });
  };

  onStepStart: NonNullable<Telemetry["onStepStart"]> = (event) => {
    this.guard(() => {
      const e = event as StepStartView;
      if (!e.callId || e.stepNumber === undefined) return;
      const builder = this.builders.get(e.callId);
      if (!builder) return;
      builder.stepStart.set(e.stepNumber, Date.now());
      if (builder.recordInputs) {
        const input = serialize(e.messages, this.config.maxPayloadChars);
        if (input) builder.stepInput.set(e.stepNumber, input);
      }
    });
  };

  onChunk: NonNullable<Telemetry["onChunk"]> = (event) => {
    this.guard(() => {
      const chunk = (event as ChunkView).chunk;
      // TTFT lives only on the stream's first-chunk marker (text/stream path).
      if (!chunk || chunk.type !== "ai.stream.firstChunk") return;
      if (!chunk.callId || chunk.stepNumber === undefined) return;
      const builder = this.builders.get(chunk.callId);
      if (!builder || builder.ttft.has(chunk.stepNumber)) return;
      const start = builder.stepStart.get(chunk.stepNumber) ?? builder.startTime;
      builder.ttft.set(chunk.stepNumber, Math.max(0, Date.now() - start));
    });
  };

  onStepFinish: NonNullable<Telemetry["onStepFinish"]> = (event) => {
    this.guard(() => {
      const e = event as StepEndView;
      if (!e.callId || e.stepNumber === undefined) return;
      const builder = this.builders.get(e.callId);
      if (!builder) return;

      const now = Date.now();
      const start = builder.stepStart.get(e.stepNumber) ?? builder.startTime;
      const metadata: Metadata = { stepNumber: String(e.stepNumber) };
      if (e.finishReason) metadata.finishReason = e.finishReason;

      builder.spans.push({
        spanId: `${e.callId}:step:${e.stepNumber}`,
        parentSpanId: `${e.callId}:root`,
        spanType: "llm",
        name: `step ${e.stepNumber}`,
        startTime: start,
        endTime: now,
        status: e.finishReason === "error" ? "error" : "ok",
        provider: e.model?.provider ?? builder.provider,
        modelId: e.model?.modelId ?? builder.modelId,
        usage: mapUsage(e.usage),
        ttftMs: builder.ttft.get(e.stepNumber),
        input: builder.recordInputs ? builder.stepInput.get(e.stepNumber) : undefined,
        output: builder.recordOutputs ? this.stepOutput(e) : undefined,
        metadata,
      });
      if (now > builder.endTime) builder.endTime = now;
    });
  };

  onToolExecutionStart: NonNullable<Telemetry["onToolExecutionStart"]> = (event) => {
    this.guard(() => {
      const e = event as ToolStartView;
      if (!e.callId) return;
      const builder = this.builders.get(e.callId);
      const id = e.toolCall?.toolCallId;
      if (builder && id) builder.toolStart.set(id, Date.now());
    });
  };

  onToolExecutionEnd: NonNullable<Telemetry["onToolExecutionEnd"]> = (event) => {
    this.guard(() => {
      const e = event as ToolEndView;
      if (!e.callId) return;
      const builder = this.builders.get(e.callId);
      if (!builder) return;

      const now = Date.now();
      const id = e.toolCall?.toolCallId ?? `${builder.spans.length}`;
      const start =
        builder.toolStart.get(id) ?? Math.max(builder.startTime, now - (e.durationMs ?? 0));
      const isError = e.toolOutput?.type === "tool-error";

      builder.spans.push({
        spanId: `${e.callId}:tool:${id}`,
        parentSpanId: `${e.callId}:root`,
        spanType: "tool",
        name: e.toolCall?.toolName ?? "tool",
        startTime: start,
        endTime: now,
        status: isError ? "error" : "ok",
        errorMessage: isError ? serialize(e.toolOutput?.error, ERROR_MESSAGE_CAP) : undefined,
        input: builder.recordInputs
          ? serialize(e.toolCall?.input, this.config.maxPayloadChars)
          : undefined,
        output: builder.recordOutputs
          ? serialize(isError ? e.toolOutput?.error : e.toolOutput?.output, this.config.maxPayloadChars)
          : undefined,
      });
      if (now > builder.endTime) builder.endTime = now;
    });
  };

  onFinish: NonNullable<Telemetry["onFinish"]> = (event) => {
    this.guard(() => {
      const e = event as FinishView;
      if (!e.callId) return;
      const builder = this.builders.get(e.callId);
      if (!builder) return;
      if (builder.recordOutputs && e.text) {
        builder.finalOutput = serialize(e.text, this.config.maxPayloadChars);
      }
      this.finalize(e.callId, builder);
    });
  };

  onError: NonNullable<Telemetry["onError"]> = (error) => {
    // The error event carries no callId. The generation is aborted, so flush
    // every open trace on this integration with an error root. (For the global
    // path this may close unrelated concurrent calls — prefer per-call
    // `wt.integration(...)` when running many in parallel.)
    this.guard(() => {
      const message = serialize(error instanceof Error ? error.message : error, ERROR_MESSAGE_CAP);
      for (const [callId, builder] of [...this.builders]) {
        builder.error = message ?? "error";
        this.finalize(callId, builder);
      }
    });
  };

  // --- internals ----------------------------------------------------------

  private guard(fn: () => void): void {
    if (!this.config.enabled) return;
    try {
      fn();
    } catch (error) {
      this.config.onError(error);
    }
  }

  private stepOutput(e: StepEndView): string | undefined {
    if (typeof e.text === "string" && e.text.length > 0) {
      return serialize(e.text, this.config.maxPayloadChars);
    }
    return serialize(e.content, this.config.maxPayloadChars);
  }

  private finalize(callId: string, builder: TraceBuilder): void {
    this.builders.delete(callId);

    const endTime = Math.max(builder.endTime, builder.startTime);
    const root: Span = {
      spanId: `${callId}:root`,
      spanType: "agent",
      name: builder.context.agentName ?? builder.operationId ?? "agent",
      startTime: builder.startTime,
      endTime,
      status: builder.error ? "error" : "ok",
      errorMessage: builder.error,
      provider: builder.provider,
      modelId: builder.modelId,
      input: builder.rootInput,
      output: builder.finalOutput,
    };

    let spans = [root, ...builder.spans];
    if (spans.length > MAX_SPANS_PER_TRACE) {
      // Keep the root and the most recent spans.
      spans = [root, ...builder.spans.slice(-(MAX_SPANS_PER_TRACE - 1))];
    }

    const ctx = builder.context;
    const trace: Trace = {
      traceId: callId,
      agentName: ctx.agentName,
      workflowName: ctx.workflowName,
      workflowRunId: ctx.workflowRunId,
      sessionId: ctx.sessionId,
      metadata: coerceMetadata(ctx.metadata),
      spans,
    };
    this.transport.enqueue(trace);
  }
}
