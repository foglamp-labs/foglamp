import type { Telemetry } from "ai";

import { ambientContext, mergeContext, runWithContext } from "./context";
import { extractWebSearchCount } from "./providerUsage";
import { coerceMetadata, serialize, toolCatalogJson } from "./serialize";
import {
  extractRateLimit,
  extractSafetyMetadata,
  extractSources,
  extractSystemFingerprint,
  stepResponseHeaders,
} from "./signals";
import { Transport } from "./transport";
import type {
  IntegrationContext,
  IntegrationInput,
  ResolvedConfig,
} from "./types";
import { mapUsage } from "./usage";
import type { Metadata, Span, Trace } from "./wire";

// Some Telemetry hooks exist only in older SDK versions inside our broad peer
// range (`^4 || ^5 || ^6 || ^7.0.0-beta.1`) but were dropped from the current
// v7 beta/canary `Telemetry` interface we now type-check against: `onChunk` and
// `onFinish` (renamed `onEnd`), and `onObjectStepFinish` (renamed
// `onObjectStepEnd`). The SDK still invokes them by name on those versions, so
// we keep them as methods typed with this local callback shape — a class may
// declare members beyond the interface it implements. On the current v7
// beta/canary they never fire; the live onStepEnd/onObjectStepEnd/onEnd
// handlers cover that path.
type LegacyTelemetryHandler = (event: unknown) => void;

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
  // The tool catalog offered to the model for this call (name → definition).
  tools?: unknown;
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
    // Reasoning block id (`reasoning-start`/`-delta`/`-end`); blocks can
    // interleave within a step, so durations are tracked per id.
    id?: string;
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
  // Provider-specific usage (web search etc.) lives here, not in `usage`.
  providerMetadata?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  // RAG/grounding citations + the provider response (carries rate-limit headers).
  sources?: unknown;
  response?: { headers?: unknown };
  // Official per-step statistics (AI SDK v7 beta/canary `StepResult.performance`).
  // All optional: absent on older v7, the v4-v6 wrap path, and (sub-fields) on
  // non-streaming steps. We read responseTimeMs, the TPS rates,
  // timeToFirstOutputMs, and the inter-chunk gap stats. `stepTimeMs` (==
  // endTime - startTime, already duration_ms) and `toolExecutionMs` (already
  // captured as individual tool spans) are intentionally ignored.
  performance?: {
    responseTimeMs?: number;
    effectiveOutputTokensPerSecond?: number;
    effectiveTotalTokensPerSecond?: number;
    outputTokensPerSecond?: number;
    inputTokensPerSecond?: number;
    timeToFirstOutputMs?: number;
    timeBetweenOutputChunksMs?: {
      min?: number;
      p10?: number;
      median?: number;
      avg?: number;
      p90?: number;
      max?: number;
    };
  };
}
// onLanguageModelCallStart/End carry only the callId we need; timing is wall-clock.
interface LmCallView {
  callId?: string;
}
// Object generation (generateObject/streamObject) reports its single step via
// onObjectStepStart/onObjectStepFinish instead of onStepStart/onStepFinish.
interface ObjectStepStartView {
  callId?: string;
  stepNumber?: number;
  promptMessages?: unknown;
}
interface ObjectStepEndView {
  callId?: string;
  stepNumber?: number;
  provider?: string;
  modelId?: string;
  finishReason?: string;
  usage?: Parameters<typeof mapUsage>[0];
  // Raw model text before JSON parsing — the step's output.
  objectText?: string;
  // Time to first chunk (streamObject only); the object path has no onChunk.
  msToFirstChunk?: number;
  providerMetadata?: unknown;
  response?: { headers?: unknown };
  sources?: unknown;
}
interface FinishView {
  callId?: string;
  text?: string;
  // Object generation reports the parsed object here instead of `text`.
  object?: unknown;
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
  // JSON catalog of tools offered to the model (stable across the call); stamped
  // onto every llm step span and the root agent span.
  toolCatalog: string | undefined;
  finalOutput: string | undefined;
  error: string | undefined;
  spans: Span[];
  // Steps already recorded as llm spans, so a step is never double-counted when
  // both onStepEnd and the deprecated onStepFinish (or onObjectStepEnd /
  // onObjectStepFinish) fire for it.
  stepFinished: Set<number>;
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
  // Reasoning-stream sampling, same shape as chunkSamples/chunkTextLen but for
  // reasoning-delta text. activeReasoningBlocks tracks open blocks (blockId →
  // start offset ms) per step; reasoningDurationMs accumulates closed blocks.
  reasoningSamples: Map<number, Array<[number, number]>>;
  reasoningTextLen: Map<number, number>;
  activeReasoningBlocks: Map<number, Map<string, number>>;
  reasoningDurationMs: Map<number, number>;
  // Pure model-call timing. The language-model-call lifecycle events carry no
  // stepNumber, so they attribute to `currentStep` (the last step started).
  // modelCallStart holds the open call's start; modelCallMs the measured span.
  currentStep: number | undefined;
  modelCallStart: Map<number, number>;
  modelCallMs: Map<number, number>;
}

// The wire contract caps spans per trace; keep the root + most recent under it.
const MAX_SPANS_PER_TRACE = 2_000;
const ERROR_MESSAGE_CAP = 8_192;
// Intra-stream sampling: one sample per this many ms (keeps arrays small), and
// a hard cap matching the wire contract's `.max(200)` on the chunk arrays.
const CHUNK_SAMPLE_INTERVAL_MS = 100;
const MAX_CHUNK_SAMPLES = 200;

// Map the AI SDK `performance.timeBetweenOutputChunksMs` stats onto the wire
// chunkJitter shape. Returns undefined unless all six values are present — the
// SDK reports them as a set, and only for streaming steps with >=2 output
// chunks. Raw values are kept (clamped >=0); ingest rounds the integer columns.
function buildChunkJitter(
  j:
    | {
        min?: number;
        p10?: number;
        median?: number;
        avg?: number;
        p90?: number;
        max?: number;
      }
    | undefined,
): Span["chunkJitter"] {
  if (!j) return undefined;
  const { min, p10, median, avg, p90, max } = j;
  if (
    min == null ||
    p10 == null ||
    median == null ||
    avg == null ||
    p90 == null ||
    max == null
  ) {
    return undefined;
  }
  return {
    min: Math.max(0, min),
    p10: Math.max(0, p10),
    median: Math.max(0, median),
    avg: Math.max(0, avg),
    p90: Math.max(0, p90),
    max: Math.max(0, max),
  };
}

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

  /**
   * Run `fn` with `context` as the **ambient** trace context: every traced
   * call inside it — however deeply nested — merges the context in without
   * any parameter threading. Layering: ambient → integration()/per-call.
   * Nested `run()`s merge inner-over-outer.
   */
  run<T>(context: IntegrationContext, fn: () => T): T {
    return runWithContext(context, fn);
  }

  /**
   * Flush buffered traces now. Await this before a serverless handler returns
   * (or pass `waitUntil` so the SDK does it for you). The background flush
   * timer keeps running — the collector stays usable afterwards.
   */
  flush(): Promise<void> {
    return this.transport.flush();
  }

  /**
   * Stop the flush timer and drain everything, including traces enqueued
   * mid-flush. Call once at process exit (SIGTERM handler, end of a script);
   * for a per-request drain in a server that keeps running, use `flush()`.
   */
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
      // The current v7 beta/canary fires the generic onStart/onEnd for embedding and
      // reranking too, not just text/object generation. We only model
      // generation (steps + tools, via onStepEnd/onObjectStepEnd/onTool*); an
      // embed/rerank call has none of those, so it would otherwise mint an
      // empty root-only trace. Skip those operations by operationId. This is a
      // denylist (not an allowlist) so any new/unknown generation operation is
      // still captured rather than silently dropped.
      const operationId = e.operationId ?? "";
      if (operationId.startsWith("ai.embed") || operationId.startsWith("ai.rerank")) return;
      const recordInputs = e.recordInputs ?? this.config.recordInputs;
      const recordOutputs = e.recordOutputs ?? this.config.recordOutputs;
      // Layering: ambient `fog.run(...)` context underneath, then the per-call
      // integration context (or the global path's functionId→agent mapping).
      const context: IntegrationContext = mergeContext(
        ambientContext() ?? {},
        this.context ?? { agentName: e.functionId },
      );
      const now = Date.now();
      this.reapAbandoned(now);
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
        toolCatalog: recordInputs ? toolCatalogJson(e.tools, this.config.maxPayloadChars) : undefined,
        finalOutput: undefined,
        error: undefined,
        spans: [],
        stepFinished: new Set(),
        stepStart: new Map(),
        stepInput: new Map(),
        ttft: new Map(),
        toolStart: new Map(),
        chunkSamples: new Map(),
        chunkTextLen: new Map(),
        streamingStep: undefined,
        reasoningSamples: new Map(),
        reasoningTextLen: new Map(),
        activeReasoningBlocks: new Map(),
        reasoningDurationMs: new Map(),
        currentStep: undefined,
        modelCallStart: new Map(),
        modelCallMs: new Map(),
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
      builder.currentStep = e.stepNumber;
      if (builder.recordInputs) {
        const input = serialize(e.messages, this.config.maxPayloadChars);
        if (input) builder.stepInput.set(e.stepNumber, input);
      }
    });
  };

  // Pure model-call timing: these fire around the provider invocation only,
  // before any client-side tool execution. They carry no stepNumber, so the
  // measurement attributes to the step that's currently running (set in
  // onStepStart). The llm span still covers the whole step — modelCallMs is an
  // annotation on it, from which tool time is derived (durationMs - modelCallMs).
  onLanguageModelCallStart: NonNullable<Telemetry["onLanguageModelCallStart"]> = (event) => {
    this.guard(() => {
      const e = event as LmCallView;
      if (!e.callId) return;
      const builder = this.builders.get(e.callId);
      if (!builder || builder.currentStep === undefined) return;
      builder.modelCallStart.set(builder.currentStep, Date.now());
    });
  };

  onLanguageModelCallEnd: NonNullable<Telemetry["onLanguageModelCallEnd"]> = (event) => {
    this.guard(() => {
      const e = event as LmCallView;
      if (!e.callId) return;
      const builder = this.builders.get(e.callId);
      if (!builder || builder.currentStep === undefined) return;
      const start = builder.modelCallStart.get(builder.currentStep);
      if (start === undefined) return;
      builder.modelCallMs.set(builder.currentStep, Math.max(0, Date.now() - start));
    });
  };

  // Legacy hook (removed from the current v7 beta/canary Telemetry; still
  // emitted by older v7 betas in our peer range). Powers intra-stream sampling
  // and the firstChunk TTFT derivation. On the current v7 beta/canary it never
  // fires — TTFT/TPS come from `performance`.
  onChunk: LegacyTelemetryHandler = (event) => {
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

      // Reasoning lifecycle: blocks can interleave within a step, so start
      // offsets are tracked per block id and durations accumulated on end.
      // These chunks carry no callId/stepNumber → same active-stream fallback
      // as text-deltas.
      if (chunk.type === "reasoning-start" || chunk.type === "reasoning-end") {
        const target = this.resolveStreamingTarget(chunk.callId, chunk.stepNumber);
        if (!target) return;
        const { builder, step } = target;
        const blockId = chunk.id ?? "";
        const stepStart = builder.stepStart.get(step) ?? builder.startTime;
        const offsetMs = Math.max(0, Date.now() - stepStart);
        let blocks = builder.activeReasoningBlocks.get(step);
        if (chunk.type === "reasoning-start") {
          if (!blocks) {
            blocks = new Map();
            builder.activeReasoningBlocks.set(step, blocks);
          }
          blocks.set(blockId, offsetMs);
        } else {
          const blockStart = blocks?.get(blockId);
          if (blockStart === undefined) return;
          blocks!.delete(blockId);
          builder.reasoningDurationMs.set(
            step,
            (builder.reasoningDurationMs.get(step) ?? 0) + Math.max(0, offsetMs - blockStart),
          );
        }
        return;
      }

      // Text payloads drive the intra-stream samples. The delta text length is a
      // cheap token proxy that we rescale to real tokens at onStepFinish.
      // Reasoning deltas feed a parallel sample series rescaled by
      // usage.reasoningTokens instead.
      const isReasoning = chunk.type === "reasoning-delta";
      if (chunk.type !== "text-delta" && !isReasoning) return;
      const text = chunk.text ?? chunk.textDelta;
      if (typeof text !== "string" || text.length === 0) return;

      const target = this.resolveStreamingTarget(chunk.callId, chunk.stepNumber);
      if (!target) return;
      const { builder, step } = target;

      const lenMap = isReasoning ? builder.reasoningTextLen : builder.chunkTextLen;
      const sampleMap = isReasoning ? builder.reasoningSamples : builder.chunkSamples;

      const cumLen = (lenMap.get(step) ?? 0) + text.length;
      lenMap.set(step, cumLen);

      const stepStart = builder.stepStart.get(step) ?? builder.startTime;
      const offsetMs = Math.max(0, Date.now() - stepStart);
      const samples = sampleMap.get(step);
      if (!samples) {
        sampleMap.set(step, [[offsetMs, cumLen]]);
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

  // Shared by onStepEnd (v7 beta/canary) and the deprecated onStepFinish. Records one
  // llm span per step, preferring the official AI SDK `performance` numbers over
  // our derivations where they overlap (TTFT, model-call time), and capturing
  // the remaining performance stats for storage.
  private handleStepEnd(e: StepEndView): void {
    if (!e.callId || e.stepNumber === undefined) return;
    const builder = this.builders.get(e.callId);
    if (!builder) return;
    // A current v7 beta/canary may fire both onStepEnd and the deprecated
    // onStepFinish for the same step; older v7 fires only onStepFinish. Record
    // each step exactly once.
    if (builder.stepFinished.has(e.stepNumber)) return;
    builder.stepFinished.add(e.stepNumber);

    const now = Date.now();
    const start = builder.stepStart.get(e.stepNumber) ?? builder.startTime;
    const metadata: Metadata = { stepNumber: String(e.stepNumber) };
    if (e.finishReason) metadata.finishReason = e.finishReason;

    let usage = mapUsage(e.usage);
    // Web-search usage isn't in `usage` — pull it from provider metadata / tools.
    const webSearchCount = extractWebSearchCount(e);
    if (webSearchCount !== undefined) usage = { ...(usage ?? {}), webSearchCount };
    const chunks = this.buildChunkArrays(builder, e.stepNumber, usage);
    // Close reasoning blocks that never saw a reasoning-end (best effort:
    // count them as running until now), then fold into the step total.
    const openBlocks = builder.activeReasoningBlocks.get(e.stepNumber);
    if (openBlocks) {
      const endOffsetMs = Math.max(0, now - start);
      for (const blockStart of openBlocks.values()) {
        builder.reasoningDurationMs.set(
          e.stepNumber,
          (builder.reasoningDurationMs.get(e.stepNumber) ?? 0) +
            Math.max(0, endOffsetMs - blockStart),
        );
      }
    }
    const reasoning = this.buildReasoningArrays(builder, e.stepNumber, usage);
    const reasoningDurationMs = builder.reasoningDurationMs.get(e.stepNumber);
    // Secondary provider signals: model build fingerprint, safety ratings,
    // grounding sources (output-gated), and normalized rate-limit headroom.
    const systemFingerprint = extractSystemFingerprint(e);
    const safetyMetadata = extractSafetyMetadata(e, this.config.maxPayloadChars);
    const sources = builder.recordOutputs
      ? extractSources(e, this.config.maxPayloadChars)
      : undefined;
    const rateLimit = extractRateLimit(stepResponseHeaders(e), now);

    // Official-over-derived: prefer the AI SDK step `performance` numbers when
    // present (measured at the source), falling back to our derivations.
    //  • ttftMs       ← timeToFirstOutputMs ?? the onChunk firstChunk marker
    //  • modelCallMs  ← responseTimeMs ?? the onLanguageModelCall* lifecycle
    const perf = e.performance;
    const ttftMs =
      perf?.timeToFirstOutputMs != null
        ? Math.max(0, Math.round(perf.timeToFirstOutputMs))
        : builder.ttft.get(e.stepNumber);
    const responseTimeMs =
      perf?.responseTimeMs != null ? Math.max(0, Math.round(perf.responseTimeMs)) : undefined;
    const modelCallMs = responseTimeMs ?? builder.modelCallMs.get(e.stepNumber);
    const chunkJitter = buildChunkJitter(perf?.timeBetweenOutputChunksMs);

    // This step is done streaming; drop its sampling scratch state.
    builder.chunkSamples.delete(e.stepNumber);
    builder.chunkTextLen.delete(e.stepNumber);
    builder.reasoningSamples.delete(e.stepNumber);
    builder.reasoningTextLen.delete(e.stepNumber);
    builder.activeReasoningBlocks.delete(e.stepNumber);
    builder.reasoningDurationMs.delete(e.stepNumber);
    builder.modelCallStart.delete(e.stepNumber);
    builder.modelCallMs.delete(e.stepNumber);
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
      ttftMs,
      chunkOffsets: chunks?.chunkOffsets,
      chunkTokens: chunks?.chunkTokens,
      reasoningOffsets: reasoning?.reasoningOffsets,
      reasoningChunkTokens: reasoning?.reasoningChunkTokens,
      reasoningDurationMs:
        reasoningDurationMs !== undefined ? Math.round(reasoningDurationMs) : undefined,
      input: builder.recordInputs ? builder.stepInput.get(e.stepNumber) : undefined,
      output: builder.recordOutputs ? this.stepOutput(e) : undefined,
      toolCatalog: builder.toolCatalog,
      modelCallMs,
      responseTimeMs,
      effectiveOutputTps: perf?.effectiveOutputTokensPerSecond,
      effectiveTotalTps: perf?.effectiveTotalTokensPerSecond,
      outputTps: perf?.outputTokensPerSecond,
      inputTps: perf?.inputTokensPerSecond,
      chunkJitter,
      systemFingerprint,
      safetyMetadata,
      sources,
      rateLimit,
      metadata,
    });
    if (now > builder.endTime) builder.endTime = now;
  }

  // onStepEnd: the v7 beta/canary successor to onStepFinish. The event is a
  // StepResult carrying the official `performance` object.
  onStepEnd: NonNullable<Telemetry["onStepEnd"]> = (event) => {
    this.guard(() => this.handleStepEnd(event as StepEndView));
  };

  // Deprecated predecessor of onStepEnd; still emitted by older v7 in our peer
  // range. Routed to the same handler, deduped via builder.stepFinished.
  onStepFinish: NonNullable<Telemetry["onStepFinish"]> = (event) => {
    this.guard(() => this.handleStepEnd(event as StepEndView));
  };

  // Object generation (generateObject/streamObject) drives a separate step
  // lifecycle: onObjectStepStart/onObjectStepFinish, with exactly one step. It
  // uses doGenerate/doStream directly, so there are no onLanguageModelCall* or
  // onChunk events — hence no modelCallMs and no intra-stream curves on this
  // path (streamObject still reports msToFirstChunk → ttftMs). The same
  // provider signals apply, so they're captured here too.
  onObjectStepStart: NonNullable<Telemetry["onObjectStepStart"]> = (event) => {
    this.guard(() => {
      const e = event as ObjectStepStartView;
      if (!e.callId) return;
      const builder = this.builders.get(e.callId);
      if (!builder) return;
      const step = e.stepNumber ?? 0;
      builder.stepStart.set(step, Date.now());
      builder.currentStep = step;
      if (builder.recordInputs) {
        const input = serialize(e.promptMessages, this.config.maxPayloadChars);
        if (input) builder.stepInput.set(step, input);
      }
    });
  };

  // Shared by onObjectStepEnd (v7 beta/canary) and the deprecated onObjectStepFinish.
  // The object path has no `performance` object (it bypasses the text-step
  // lifecycle), so none of the new TPS/jitter fields apply here.
  private handleObjectStepEnd(e: ObjectStepEndView): void {
    if (!e.callId) return;
    const builder = this.builders.get(e.callId);
    if (!builder) return;

    const step = e.stepNumber ?? 0;
    // Object steps share the `${callId}:step:${n}` span id with the text path,
    // so they dedup against the same set: a v7 beta/canary firing both onObjectStepEnd
    // and the deprecated onObjectStepFinish records the step exactly once.
    if (builder.stepFinished.has(step)) return;
    builder.stepFinished.add(step);

    const now = Date.now();
    const start = builder.stepStart.get(step) ?? builder.startTime;
    const metadata: Metadata = { stepNumber: String(step) };
    if (e.finishReason) metadata.finishReason = e.finishReason;

    let usage = mapUsage(e.usage);
    const webSearchCount = extractWebSearchCount(e);
    if (webSearchCount !== undefined) usage = { ...(usage ?? {}), webSearchCount };

    const systemFingerprint = extractSystemFingerprint(e);
    const safetyMetadata = extractSafetyMetadata(e, this.config.maxPayloadChars);
    const sources = builder.recordOutputs
      ? extractSources(e, this.config.maxPayloadChars)
      : undefined;
    const rateLimit = extractRateLimit(stepResponseHeaders(e), now);
    const ttftMs =
      e.msToFirstChunk !== undefined ? Math.max(0, Math.round(e.msToFirstChunk)) : undefined;
    const input = builder.recordInputs ? builder.stepInput.get(step) : undefined;

    builder.stepStart.delete(step);
    builder.stepInput.delete(step);

    builder.spans.push({
      spanId: `${e.callId}:step:${step}`,
      parentSpanId: `${e.callId}:root`,
      spanType: "llm",
      name: `step ${step}`,
      startTime: start,
      endTime: now,
      status: e.finishReason === "error" ? "error" : "ok",
      provider: e.provider ?? builder.provider,
      modelId: e.modelId ?? builder.modelId,
      usage,
      ttftMs,
      input,
      output: builder.recordOutputs
        ? serialize(e.objectText, this.config.maxPayloadChars)
        : undefined,
      toolCatalog: builder.toolCatalog,
      systemFingerprint,
      safetyMetadata,
      sources,
      rateLimit,
      metadata,
    });
    if (now > builder.endTime) builder.endTime = now;
  }

  // onObjectStepEnd: the v7 beta/canary successor to onObjectStepFinish (both are
  // deprecated on the interface, but this is the one the current v7 beta/canary fires).
  onObjectStepEnd: NonNullable<Telemetry["onObjectStepEnd"]> = (event) => {
    this.guard(() => this.handleObjectStepEnd(event as ObjectStepEndView));
  };

  // Deprecated predecessor; removed from the current v7 beta/canary Telemetry
  // interface but still emitted by older v7 in our peer range. Routed to the
  // same handler, deduped via builder.stepFinished.
  onObjectStepFinish: LegacyTelemetryHandler = (event) => {
    this.guard(() => this.handleObjectStepEnd(event as ObjectStepEndView));
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

  // Shared by onEnd (v7 beta/canary) and the deprecated onFinish. finalize() deletes the
  // builder, so if both hooks fire for one operation the second no-ops at the
  // `!builder` guard — no extra dedup state needed.
  private handleFinish(e: FinishView): void {
    if (!e.callId) return;
    const builder = this.builders.get(e.callId);
    if (!builder) return;
    // Text generation reports `text`; object generation reports the parsed
    // `object`. Capture whichever is present as the trace's final output.
    const output = e.text ?? e.object;
    if (builder.recordOutputs && output !== undefined) {
      const serialized = serialize(output, this.config.maxPayloadChars);
      if (serialized) builder.finalOutput = serialized;
    }
    this.finalize(e.callId, builder);
  }

  // onEnd: the v7 beta/canary successor to onFinish, fired when the whole operation
  // completes (generateText/streamText/generateObject/streamObject).
  onEnd: NonNullable<Telemetry["onEnd"]> = (event) => {
    this.guard(() => this.handleFinish(event as FinishView));
  };

  // Deprecated predecessor; removed from the current v7 beta/canary Telemetry
  // interface but still emitted by older v7 in our peer range. Routed to the
  // same handler; finalize()'s builder delete dedups the two.
  onFinish: LegacyTelemetryHandler = (event) => {
    this.guard(() => this.handleFinish(event as FinishView));
  };

  onError: NonNullable<Telemetry["onError"]> = (error) => {
    // The error event carries no callId, so it's only attributable when exactly
    // one trace is open on this integration. With several concurrent calls
    // (shared global collector), closing them all would mark healthy traces as
    // errored — leave them alone, surface a diagnostic, and let the abandoned-
    // trace reaper close the failed one. Per-call `fog.integration(...)` avoids
    // the ambiguity entirely.
    this.guard(() => {
      if (this.builders.size !== 1) {
        if (this.builders.size > 1) {
          this.config.onError(
            new Error(
              `[foglamp] onError with ${this.builders.size} traces in flight on one integration — cannot attribute the failure; the failed trace will be finalized as abandoned later. Use fog.integration(...) per call.`,
            ),
          );
        }
        return;
      }
      const message = serialize(error instanceof Error ? error.message : error, ERROR_MESSAGE_CAP);
      for (const [callId, builder] of [...this.builders]) {
        builder.error = message ?? "error";
        this.finalize(callId, builder);
      }
    });
  };

  // --- internals ----------------------------------------------------------

  // A call that never reaches onFinish/onError (process crash mid-stream,
  // unattributable onError above) would leak its builder forever. Sweep on
  // every onStart: anything idle for maxTraceAgeMs is flushed with an
  // "abandoned" error so its spans still reach the dashboard. Staleness is
  // measured from endTime (last recorded activity — steps and tool results
  // bump it), not startTime, so a legitimately long-running trace that is
  // still producing events is never reaped mid-stream.
  private reapAbandoned(now: number): void {
    for (const [callId, builder] of [...this.builders]) {
      if (now - builder.endTime > this.config.maxTraceAgeMs) {
        builder.error ??= "abandoned: trace never finished (exceeded maxTraceAgeMs)";
        this.finalize(callId, builder);
      }
    }
  }

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

  // Same rescale for the reasoning stream, anchored to usage.reasoningTokens.
  // No reported reasoning tokens (older providers, non-reasoning models) → no
  // curve: unknown stays absent, never estimated.
  private buildReasoningArrays(
    builder: TraceBuilder,
    step: number,
    usage: ReturnType<typeof mapUsage>,
  ): { reasoningOffsets: number[]; reasoningChunkTokens: number[] } | undefined {
    const raw = builder.reasoningSamples.get(step);
    const finalTextLen = builder.reasoningTextLen.get(step) ?? 0;
    if (!usage || !raw || raw.length === 0 || finalTextLen <= 0) return undefined;

    const scaleTokens = usage.reasoningTokens ?? 0;
    if (scaleTokens === 0) return undefined;

    const samples = decimateSamples(raw, MAX_CHUNK_SAMPLES);
    const reasoningOffsets = new Array<number>(samples.length);
    const reasoningChunkTokens = new Array<number>(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]!;
      reasoningOffsets[i] = sample[0];
      reasoningChunkTokens[i] = Math.round((sample[1] / finalTextLen) * scaleTokens);
    }
    return { reasoningOffsets, reasoningChunkTokens };
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
      toolCatalog: builder.toolCatalog,
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
