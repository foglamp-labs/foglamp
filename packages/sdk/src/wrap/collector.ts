import { uuidv7 } from "uuidv7";

import { coerceMetadata, serialize } from "../serialize";
import type { Transport } from "../transport";
import type { IntegrationContext, ResolvedConfig } from "../types";
import type { Span, Trace, Usage } from "../wire";
import { mapUsageWrap } from "./usage";

// Per-call trace builder for the wrapping adapter (foglamp/wrap). Unlike the v7
// `Collector` (one global instance keyed by callId), one `WrapCollector` exists
// per wrapped call, so its state lives in plain fields — concurrent calls can
// never collide, and streamed text-deltas need no callId routing.
//
// It is fed two ways:
//   • tool spans   — from wrapped `tool.execute` (real, measured start/end).
//   • llm steps    — streaming: `onStepFinish` (sequential real timing) + `onChunk`
//                    sampling; non-streaming: reconstructed from the result.
// Both paths emit the same wire `Trace`/`Span` and share the global `Transport`.

const MAX_SPANS_PER_TRACE = 2_000;
const ERROR_MESSAGE_CAP = 8_192;
// One intra-stream sample per this many ms; hard cap matches the wire `.max(200)`.
const CHUNK_SAMPLE_INTERVAL_MS = 100;
const MAX_CHUNK_SAMPLES = 200;

// Evenly thin samples to at most `max`, always keeping the last entry (it anchors
// the cumulative text length used for the token rescale). Mirrors collector.ts.
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

// Reconstruct per-step time windows for a non-streaming result (no per-step
// timestamps are exposed). In a tool loop, step k runs up to tool k's start and
// resumes after it ends, so tool windows are the natural boundaries; any missing
// boundary splits the remaining span evenly.
function reconstructStepTimes(
  start: number,
  end: number,
  steps: number,
  toolWindows: ReadonlyArray<[number, number]>,
): Array<[number, number]> {
  if (steps <= 1) return [[start, end]];
  const sorted = [...toolWindows].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let cursor = start;
  for (let i = 0; i < steps; i++) {
    if (i === steps - 1) {
      out.push([Math.min(cursor, end), end]);
    } else if (sorted[i]) {
      const boundary = Math.max(cursor, sorted[i]![0]);
      out.push([cursor, boundary]);
      cursor = Math.max(boundary, sorted[i]![1]);
    } else {
      const span = Math.max(0, (end - cursor) / (steps - i));
      const stop = cursor + span;
      out.push([cursor, stop]);
      cursor = stop;
    }
  }
  return out;
}

export interface StepView {
  usage?: unknown;
  text?: string;
  finishReason?: string;
  response?: { modelId?: string };
}

interface LlmSpanInput {
  stepNumber: number;
  start: number;
  end: number;
  usage: Usage | undefined;
  provider: string | undefined;
  modelId: string | undefined;
  finishReason: string | undefined;
  output: unknown;
  chunks?: { chunkOffsets: number[]; chunkTokens: number[] } | undefined;
}

export class WrapCollector {
  private readonly transport: Transport;
  private readonly config: ResolvedConfig;
  private readonly context: IntegrationContext;
  private readonly operation: string;
  private readonly traceId = uuidv7();
  private readonly startTime = Date.now();
  private endTime = this.startTime;

  private readonly rootInput: string | undefined;
  private finalOutput: string | undefined;
  private error: string | undefined;
  private provider: string | undefined;
  private modelId: string | undefined;
  private finalized = false;

  private readonly spans: Span[] = [];
  private readonly toolWindows: Array<[number, number]> = [];

  // Streaming state. `streamStepIndex` is the in-flight step that text-deltas
  // attribute to; `lastBoundary` is its start (previous step's end, or call start).
  private streamStepIndex = 0;
  private lastBoundary = this.startTime;
  private readonly chunkSamples = new Map<number, Array<[number, number]>>();
  private readonly chunkTextLen = new Map<number, number>();
  private readonly ttft = new Map<number, number>();

  constructor(
    transport: Transport,
    config: ResolvedConfig,
    context: IntegrationContext,
    init: { operation: string; provider?: string; modelId?: string; promptRaw?: unknown },
  ) {
    this.transport = transport;
    this.config = config;
    this.context = context;
    this.operation = init.operation;
    this.provider = init.provider;
    this.modelId = init.modelId;
    this.rootInput = config.recordInputs
      ? serialize(init.promptRaw, config.maxPayloadChars)
      : undefined;
  }

  // --- tools (all modes) --------------------------------------------------

  recordTool(args: {
    name?: string;
    toolCallId?: string;
    input: unknown;
    output?: unknown;
    error?: unknown;
    start: number;
    end: number;
  }): void {
    const isError = args.error !== undefined;
    const id = args.toolCallId ?? `${this.spans.length}`;
    const end = Math.max(args.start, args.end);
    this.toolWindows.push([args.start, end]);
    this.spans.push({
      spanId: `${this.traceId}:tool:${id}`,
      parentSpanId: `${this.traceId}:root`,
      spanType: "tool",
      name: args.name ?? "tool",
      startTime: args.start,
      endTime: end,
      status: isError ? "error" : "ok",
      errorMessage: isError ? serialize(errMsg(args.error), ERROR_MESSAGE_CAP) : undefined,
      input: this.config.recordInputs
        ? serialize(args.input, this.config.maxPayloadChars)
        : undefined,
      output: this.config.recordOutputs
        ? serialize(isError ? errMsg(args.error) : args.output, this.config.maxPayloadChars)
        : undefined,
    });
    if (end > this.endTime) this.endTime = end;
  }

  // --- streaming (streamText) --------------------------------------------

  onChunk(chunk: { type?: string; text?: string; textDelta?: string } | undefined): void {
    if (!chunk || chunk.type !== "text-delta") return;
    const text =
      typeof chunk.text === "string"
        ? chunk.text
        : typeof chunk.textDelta === "string"
          ? chunk.textDelta
          : undefined;
    if (!text || text.length === 0) return;

    const step = this.streamStepIndex;
    const now = Date.now();
    if (!this.ttft.has(step)) this.ttft.set(step, Math.max(0, now - this.lastBoundary));

    const cumLen = (this.chunkTextLen.get(step) ?? 0) + text.length;
    this.chunkTextLen.set(step, cumLen);

    const offsetMs = Math.max(0, now - this.lastBoundary);
    const samples = this.chunkSamples.get(step);
    if (!samples) {
      this.chunkSamples.set(step, [[offsetMs, cumLen]]);
      return;
    }
    const last = samples[samples.length - 1]!;
    if (offsetMs - last[0] >= CHUNK_SAMPLE_INTERVAL_MS) {
      samples.push([offsetMs, cumLen]);
    } else {
      last[1] = cumLen;
    }
  }

  /** streamText `onStepFinish`: close the in-flight step with real timing. */
  addStreamStep(step: StepView | undefined): void {
    const stepNumber = this.streamStepIndex;
    const start = this.lastBoundary;
    const end = Date.now();
    this.lastBoundary = end;
    const usage = mapUsageWrap(step?.usage as never);
    const chunks = this.buildChunkArrays(stepNumber, usage);
    this.chunkSamples.delete(stepNumber);
    this.chunkTextLen.delete(stepNumber);
    this.pushLlmSpan({
      stepNumber,
      start,
      end,
      usage,
      provider: this.provider,
      modelId: step?.response?.modelId ?? this.modelId,
      finishReason: step?.finishReason,
      output: step?.text,
      chunks,
    });
    this.streamStepIndex++;
  }

  /** streamText `onFinish`. */
  finalizeStream(event: { text?: string } | undefined): void {
    this.finalizeOk(event?.text);
  }

  // --- non-streaming (generateText) --------------------------------------

  completeFromResult(result: { steps?: StepView[]; text?: string; usage?: unknown } | undefined): void {
    const steps = Array.isArray(result?.steps) ? (result!.steps as StepView[]) : [];
    const end = Date.now();
    this.endTime = Math.max(this.endTime, end);

    if (steps.length === 0) {
      this.pushLlmSpan({
        stepNumber: 0,
        start: this.startTime,
        end,
        usage: mapUsageWrap(result?.usage as never),
        provider: this.provider,
        modelId: this.modelId,
        finishReason: undefined,
        output: result?.text,
      });
    } else {
      const times = reconstructStepTimes(this.startTime, end, steps.length, this.toolWindows);
      steps.forEach((s, i) => {
        const [st, en] = times[i] ?? [this.startTime, end];
        this.pushLlmSpan({
          stepNumber: i,
          start: st,
          end: en,
          usage: mapUsageWrap(s?.usage as never),
          provider: this.provider,
          modelId: s?.response?.modelId ?? this.modelId,
          finishReason: s?.finishReason,
          output: s?.text,
        });
      });
    }
    this.finalizeOk(result?.text);
  }

  // --- object generation (generateObject / streamObject) -----------------

  completeObject(args: { usage?: unknown; object?: unknown; modelId?: string }): void {
    const end = Date.now();
    this.endTime = Math.max(this.endTime, end);
    this.pushLlmSpan({
      stepNumber: 0,
      start: this.startTime,
      end,
      usage: mapUsageWrap(args.usage as never),
      provider: this.provider,
      modelId: args.modelId ?? this.modelId,
      finishReason: undefined,
      output: args.object,
    });
    this.finalizeOk(args.object);
  }

  fail(error: unknown): void {
    this.error = serialize(errMsg(error), ERROR_MESSAGE_CAP) ?? "error";
    this.finalize();
  }

  // --- internals ----------------------------------------------------------

  private finalizeOk(rawOutput: unknown): void {
    if (this.config.recordOutputs) {
      const s = serialize(rawOutput, this.config.maxPayloadChars);
      if (s) this.finalOutput = s;
    }
    this.finalize();
  }

  private pushLlmSpan(s: LlmSpanInput): void {
    const end = Math.max(s.start, s.end);
    const metadata: Record<string, string> = { stepNumber: String(s.stepNumber) };
    if (s.finishReason) metadata.finishReason = s.finishReason;
    this.spans.push({
      spanId: `${this.traceId}:step:${s.stepNumber}`,
      parentSpanId: `${this.traceId}:root`,
      spanType: "llm",
      name: `step ${s.stepNumber}`,
      startTime: s.start,
      endTime: end,
      status: s.finishReason === "error" ? "error" : "ok",
      provider: s.provider,
      modelId: s.modelId,
      usage: s.usage,
      ttftMs: this.ttft.get(s.stepNumber),
      chunkOffsets: s.chunks?.chunkOffsets,
      chunkTokens: s.chunks?.chunkTokens,
      output: this.config.recordOutputs
        ? serialize(s.output, this.config.maxPayloadChars)
        : undefined,
      metadata,
    });
    if (end > this.endTime) this.endTime = end;
  }

  // Rescale a step's [offsetMs, cumulativeTextLength] samples to parallel
  // offset/token arrays (text length → visible output tokens). Mirrors collector.ts.
  private buildChunkArrays(
    step: number,
    usage: Usage | undefined,
  ): { chunkOffsets: number[]; chunkTokens: number[] } | undefined {
    const raw = this.chunkSamples.get(step);
    const finalTextLen = this.chunkTextLen.get(step) ?? 0;
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

  private finalize(): void {
    if (this.finalized) return;
    this.finalized = true;

    const ctx = { ...this.context };
    // A trace must carry a name or ingest rejects it; fall back to the AI SDK
    // operation kind (generateText/streamText/…) when none was supplied.
    if (!ctx.traceName && !ctx.agentName) ctx.traceName = this.operation;

    const endTime = Math.max(this.endTime, this.startTime);
    const root: Span = {
      spanId: `${this.traceId}:root`,
      spanType: "agent",
      name: ctx.traceName ?? ctx.agentName ?? this.operation,
      startTime: this.startTime,
      endTime,
      status: this.error ? "error" : "ok",
      errorMessage: this.error,
      provider: this.provider,
      modelId: this.modelId,
      input: this.rootInput,
      output: this.finalOutput,
    };

    let spans = [root, ...this.spans];
    if (spans.length > MAX_SPANS_PER_TRACE) {
      spans = [root, ...this.spans.slice(-(MAX_SPANS_PER_TRACE - 1))];
    }

    const trace: Trace = {
      traceId: this.traceId,
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

function errMsg(error: unknown): unknown {
  return error instanceof Error ? error.message : error;
}
