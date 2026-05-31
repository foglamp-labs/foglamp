import type { Telemetry } from "ai";

import { coerceMetadata, serialize } from "./serialize";
import { Transport } from "./transport";
import type {
  IntegrationContext,
  IntegrationInput,
  ResolvedConfig,
} from "./types";
import { mapUsage } from "./usage";
import type { Metadata, Span, Trace } from "./wire";

// Maps the AI SDK v7 `Telemetry` lifecycle onto Foglamp's trace/span model:
//   trace  = one top-level generateText/streamText call (keyed by `callId`)
//   agent  = the root span for that call            → `${callId}:root`
//   llm    = one model step (from `onStepFinish`)   → `${callId}:step:${n}`
//   tool   = one tool execution (from `onToolExecutionEnd`) → `${callId}:tool:${id}`
//
// One `Collector` is both the global integration (`registerTelemetry(fog)`) and a
// factory for per-call ones (`fog.integration(ctx)`); they share a Transport. Cost
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
  // Lifecycle markers (`ai.stream.firstChunk`) carry callId/stepNumber; the
  // payload text-deltas carry the delta text but no routing ids (see onChunk).
  chunk?: {
    type?: string;
    callId?: string;
    stepNumber?: number;
    text?: string;
    textDelta?: string;
  };
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
  // Intra-stream sampling, keyed by stepNumber. chunkSamples holds
  // [offsetMs, cumulativeTextLength] pairs (rescaled to tokens at step end);
  // chunkTextLen is the running text length; streamingStep marks the step
  // currently emitting text-deltas (used to route deltas that carry no callId).
  chunkSamples: Map<number, Array<[number, number]>>;
  chunkTextLen: Map<number, number>;
  streamingStep: number | undefined;
}

// The wire contract caps spans per trace; keep the root + most recent under it.
const MAX_SPANS_PER_TRACE = 2_000;
const ERROR_MESSAGE_CAP = 8_192;
// Intra-stream sampling: one sample per this many ms (keeps arrays small), and
// a hard cap matching the wire contract's `.max(200)` on the chunk arrays.
const CHUNK_SAMPLE_INTERVAL_MS = 100;
const MAX_CHUNK_SAMPLES = 200;

// Evenly thin samples to at most `max`, always keeping the last entry (it
// anchors the cumulative text length used for the token rescale).
function decimateSamples(
  samples: ReadonlyArray<[number, number]>,
  max: number,
): ReadonlyArray<[number, number]> {
  if (samples.length <= max) return samples;
  const out: Array<[number, number]> = [];
  const stride = samples.length / max;
  for (let i = 0; i < max - 1; i++) out.push(samples[Math.floor(i * stride)]!);
  out.push(samples[samples.length - 1]!);
  return out;
}

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
   * Pass to `telemetry: { integrations: [fog.integration({ traceName, … })] }`.
   * Requires `traceName` or `agentName`; `workflowName`/`workflowRunId` together.
   */
  integration(context: IntegrationInput): Collector {
    // Eager validation — runs synchronously at setup (NOT inside a guarded
    // lifecycle handler), so errors surface to the caller instead of being
    // swallowed and routed to config.onError.
    if (!context.traceName && !context.agentName) {
      throw new Error(
        "[foglamp] integration() requires `traceName` or `agentName` — this becomes the trace's label.",
      );
    }
    if (Boolean(context.workflowName) !== Boolean(context.workflowRunId)) {
      throw new Error(
        "[foglamp] `workflowName` and `workflowRunId` must be passed together (both or neither).",
      );
    }
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
        chunkSamples: new Map(),
        chunkTextLen: new Map(),
        streamingStep: undefined,
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
      if (!chunk) return;

      // The first-chunk marker carries callId/stepNumber: record TTFT and mark
      // this step as the one currently streaming, so subsequent text-deltas
      // (which carry no routing ids) can be attributed to it.
      if (chunk.type === "ai.stream.firstChunk") {
        if (!chunk.callId || chunk.stepNumber === undefined) return;
        const builder = this.builders.get(chunk.callId);
        if (!builder) return;
        builder.streamingStep = chunk.stepNumber;
        if (builder.ttft.has(chunk.stepNumber)) return;
        const start = builder.stepStart.get(chunk.stepNumber) ?? builder.startTime;
        builder.ttft.set(chunk.stepNumber, Math.max(0, Date.now() - start));
        return;
      }

      // Text payloads drive the intra-stream samples. The delta text length is a
      // cheap token proxy that we rescale to real tokens at onStepFinish.
      if (chunk.type !== "text-delta") return;
      const text = chunk.text ?? chunk.textDelta;
      if (typeof text !== "string" || text.length === 0) return;

      const target = this.resolveStreamingTarget(chunk.callId, chunk.stepNumber);
      if (!target) return;
      const { builder, step } = target;

      const cumLen = (builder.chunkTextLen.get(step) ?? 0) + text.length;
      builder.chunkTextLen.set(step, cumLen);

      const stepStart = builder.stepStart.get(step) ?? builder.startTime;
      const offsetMs = Math.max(0, Date.now() - stepStart);
      const samples = builder.chunkSamples.get(step);
      if (!samples) {
        builder.chunkSamples.set(step, [[offsetMs, cumLen]]);
        return;
      }
      const last = samples[samples.length - 1]!;
      // New time bucket → new sample; otherwise fold the latest length into the
      // current bucket so the final sample always anchors to the full text.
      if (offsetMs - last[0] >= CHUNK_SAMPLE_INTERVAL_MS) {
        samples.push([offsetMs, cumLen]);
      } else {
        last[1] = cumLen;
      }
    });
  };

  // Attribute a text-delta to a builder/step. Markers give us callId/stepNumber
  // directly; bare deltas fall back to the single builder currently streaming.
  // If more than one stream is active (concurrent calls on a shared global
  // collector), the delta is ambiguous and dropped — use fog.integration(...)
  // per call for reliable sampling.
  private resolveStreamingTarget(
    callId: string | undefined,
    stepNumber: number | undefined,
  ): { builder: TraceBuilder; step: number } | undefined {
    if (callId && stepNumber !== undefined) {
      const builder = this.builders.get(callId);
      return builder ? { builder, step: stepNumber } : undefined;
    }
    let found: { builder: TraceBuilder; step: number } | undefined;
    for (const builder of this.builders.values()) {
      if (builder.streamingStep === undefined) continue;
      if (found) return undefined; // ambiguous: >1 active stream
      found = { builder, step: builder.streamingStep };
    }
    return found;
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

      const usage = mapUsage(e.usage);
      const chunks = this.buildChunkArrays(builder, e.stepNumber, usage);
      // This step is done streaming; drop its sampling scratch state.
      builder.chunkSamples.delete(e.stepNumber);
      builder.chunkTextLen.delete(e.stepNumber);
      if (builder.streamingStep === e.stepNumber) builder.streamingStep = undefined;

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
        usage,
        ttftMs: builder.ttft.get(e.stepNumber),
        chunkOffsets: chunks?.chunkOffsets,
        chunkTokens: chunks?.chunkTokens,
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
    // `fog.integration(...)` when running many in parallel.)
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

  // Turn a step's [offsetMs, cumulativeTextLength] samples into parallel
  // offset/token arrays. Text length is rescaled to the real visible-token
  // count (outputTokens minus reasoningTokens, which stream separately and
  // would otherwise inflate the curve). Returns undefined for non-streaming
  // steps so the span omits the fields entirely.
  private buildChunkArrays(
    builder: TraceBuilder,
    step: number,
    usage: ReturnType<typeof mapUsage>,
  ): { chunkOffsets: number[]; chunkTokens: number[] } | undefined {
    const raw = builder.chunkSamples.get(step);
    const finalTextLen = builder.chunkTextLen.get(step) ?? 0;
    if (!usage || !raw || raw.length === 0 || finalTextLen <= 0) return undefined;

    const scaleTokens = Math.max(0, (usage.outputTokens ?? 0) - (usage.reasoningTokens ?? 0));
    if (scaleTokens === 0) return undefined;

    const samples = decimateSamples(raw, MAX_CHUNK_SAMPLES);
    const chunkOffsets = new Array<number>(samples.length);
    const chunkTokens = new Array<number>(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]!;
      chunkOffsets[i] = sample[0];
      chunkTokens[i] = Math.round((sample[1] / finalTextLen) * scaleTokens);
    }
    return { chunkOffsets, chunkTokens };
  }

  private finalize(callId: string, builder: TraceBuilder): void {
    this.builders.delete(callId);

    // Work on a copy so the fallback below doesn't mutate shared builder state.
    const ctx = { ...builder.context };
    // Safety net for the global registerTelemetry() path (context synthesized
    // from functionId, never validated by integration()): a trace must always
    // carry a name or ingest rejects it.
    if (!ctx.traceName && !ctx.agentName) {
      ctx.traceName = builder.operationId ?? callId;
    }

    const endTime = Math.max(builder.endTime, builder.startTime);
    const root: Span = {
      spanId: `${callId}:root`,
      spanType: "agent",
      name: ctx.traceName ?? ctx.agentName ?? builder.operationId ?? "agent",
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

    const trace: Trace = {
      traceId: callId,
      traceName: ctx.traceName,
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
