import { uuidv7 } from "uuidv7";

import { extractWebSearchCount } from "../providerUsage";
import { coerceMetadata, serialize, toolCatalogJson } from "../serialize";
import {
  extractRateLimit,
  extractSafetyMetadata,
  extractSources,
  extractSystemFingerprint,
  type RateLimitInfo,
  stepResponseHeaders,
} from "../signals";
import type { Transport } from "../transport";
import type { IntegrationContext, ResolvedConfig } from "../types";
import type { Span, Trace, Usage } from "../wire";
import { mapUsageWrap } from "./usage";

// Merge web-search usage (from provider metadata / tools) into the mapped usage.
function withWebSearch(usage: Usage | undefined, step: unknown): Usage | undefined {
  const webSearchCount = extractWebSearchCount(step);
  if (webSearchCount === undefined) return usage;
  return { ...(usage ?? {}), webSearchCount };
}

// Per-call trace builder for the wrapping adapter (foglamp/wrap). Unlike the v7
// `Collector` (one global instance keyed by callId), one `WrapCollector` exists
// per wrapped call, so its state lives in plain fields — concurrent calls can
// never collide, and streamed text-deltas need no callId routing.
//
// It is fed two ways:
//   • tool spans   — from wrapped `tool.execute` (real, measured start/end).
//   • llm steps    — streaming: `onStepFinish` (sequential real timing) + `onChunk`
//                    TTFT/reasoning timing; non-streaming: reconstructed from the result.
// Both paths emit the same wire `Trace`/`Span` and share the global `Transport`.

const MAX_SPANS_PER_TRACE = 2_000;
const ERROR_MESSAGE_CAP = 8_192;

// Reconstruct per-step time windows for a non-streaming result (no per-step
// timestamps are exposed). `stepToolWindows[k]` holds the measured execution
// windows of the tools *step k requested* (matched by toolCallId — a step may
// request many tools in parallel, so windows are grouped per step, never
// consumed one-per-step). Step k's generation runs from the cursor up to the
// first of its own tools; the next step resumes once the last of them ends.
// A step with no matched windows splits the remaining span evenly.
// Exported for tests.
export function reconstructStepTimes(
  start: number,
  end: number,
  stepToolWindows: ReadonlyArray<ReadonlyArray<[number, number]>>,
): Array<[number, number]> {
  const steps = stepToolWindows.length;
  if (steps === 0) return [];
  const out: Array<[number, number]> = [];
  let cursor = start;
  for (let i = 0; i < steps; i++) {
    const windows = stepToolWindows[i]!;
    const last = i === steps - 1;
    if (windows.length > 0) {
      const firstToolStart = Math.min(...windows.map((w) => w[0]));
      const lastToolEnd = Math.max(...windows.map((w) => w[1]));
      const boundary = Math.min(Math.max(cursor, firstToolStart), end);
      out.push([Math.min(cursor, end), boundary]);
      cursor = Math.min(Math.max(boundary, lastToolEnd), end);
    } else if (last) {
      out.push([Math.min(cursor, end), end]);
    } else {
      const span = Math.max(0, (end - cursor) / (steps - i));
      const stop = cursor + span;
      out.push([cursor, stop]);
      cursor = stop;
    }
  }
  return out;
}

// The toolCallIds a step requested, read from its toolCalls/toolResults —
// present on v4 through v7 step results. Used to attribute measured tool
// windows (and tool spans) to the step that requested them.
function stepToolCallIds(step: StepView | undefined): string[] {
  const ids = new Set<string>();
  for (const list of [step?.toolCalls, step?.toolResults]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const id = (entry as { toolCallId?: unknown } | null)?.toolCallId;
      if (typeof id === "string" && id.length > 0) ids.add(id);
    }
  }
  return [...ids];
}

export interface StepView {
  usage?: unknown;
  text?: string;
  finishReason?: string;
  response?: { modelId?: string; headers?: unknown };
  // Provider-specific usage (web search etc.) — read by extractWebSearchCount.
  providerMetadata?: unknown;
  experimental_providerMetadata?: unknown;
  content?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  // RAG/grounding citations (read by extractSources).
  sources?: unknown;
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
  reasoningDurationMs?: number | undefined;
  // Secondary provider signals (no modelCallMs in wrap — v4-v6 expose no
  // language-model-call lifecycle).
  systemFingerprint?: string | undefined;
  safetyMetadata?: string | undefined;
  sources?: string | undefined;
  rateLimit?: RateLimitInfo | undefined;
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
  // JSON catalog of tools offered to the model; stamped on every llm + root span.
  private readonly toolCatalog: string | undefined;
  private finalOutput: string | undefined;
  private error: string | undefined;
  private provider: string | undefined;
  private modelId: string | undefined;
  private finalized = false;

  private readonly spans: Span[] = [];
  // Measured tool executions keyed by toolCallId, so steps can claim their own
  // tools (window → step timing, span → re-parenting under the step).
  private readonly toolWindowByCallId = new Map<string, [number, number]>();
  private readonly toolSpanByCallId = new Map<string, Span>();

  // Streaming state. `streamStepIndex` is the in-flight step that text-deltas
  // attribute to; `lastBoundary` is its start (previous step's end, or call start).
  private streamStepIndex = 0;
  private lastBoundary = this.startTime;
  private readonly ttft = new Map<number, number>();
  // Reasoning-stream state, mirroring the v7 collector: open blocks (blockId →
  // start offset ms) and the accumulated per-step reasoning duration.
  private readonly activeReasoningBlocks = new Map<number, Map<string, number>>();
  private readonly reasoningDurMs = new Map<number, number>();

  constructor(
    transport: Transport,
    config: ResolvedConfig,
    context: IntegrationContext,
    init: {
      operation: string;
      provider?: string;
      modelId?: string;
      promptRaw?: unknown;
      toolsRaw?: unknown;
    },
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
    this.toolCatalog = config.recordInputs
      ? toolCatalogJson(init.toolsRaw, config.maxPayloadChars)
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
    // Parent to root for now; the step that requested this tool claims it
    // (re-parents it under the step span) when that step closes.
    const span: Span = {
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
    };
    this.spans.push(span);
    if (args.toolCallId) {
      this.toolWindowByCallId.set(args.toolCallId, [args.start, end]);
      this.toolSpanByCallId.set(args.toolCallId, span);
    }
    if (end > this.endTime) this.endTime = end;
  }

  // Attach a step's tools to it: re-parent their spans under the step span and
  // return their measured windows. Steps consume their tools exactly once.
  private claimStepTools(step: StepView | undefined, stepNumber: number): Array<[number, number]> {
    const windows: Array<[number, number]> = [];
    for (const id of stepToolCallIds(step)) {
      const window = this.toolWindowByCallId.get(id);
      if (!window) continue;
      windows.push(window);
      this.toolWindowByCallId.delete(id);
      const span = this.toolSpanByCallId.get(id);
      if (span) span.parentSpanId = `${this.traceId}:step:${stepNumber}`;
      this.toolSpanByCallId.delete(id);
    }
    return windows;
  }

  // --- streaming (streamText) --------------------------------------------

  onChunk(
    chunk: { type?: string; text?: string; textDelta?: string; id?: string } | undefined,
  ): void {
    if (!chunk) return;
    const step = this.streamStepIndex;
    const now = Date.now();

    // Reasoning blocks: start offsets tracked per block id (blocks can
    // interleave), durations accumulated on end. Reasoning chunks also anchor
    // TTFT — the first emitted chunk of any kind ends the silent wait, matching
    // the v7 first-chunk semantics.
    if (chunk.type === "reasoning-start" || chunk.type === "reasoning-end") {
      if (!this.ttft.has(step)) this.ttft.set(step, Math.max(0, now - this.lastBoundary));
      const blockId = chunk.id ?? "";
      const offsetMs = Math.max(0, now - this.lastBoundary);
      let blocks = this.activeReasoningBlocks.get(step);
      if (chunk.type === "reasoning-start") {
        if (!blocks) {
          blocks = new Map();
          this.activeReasoningBlocks.set(step, blocks);
        }
        blocks.set(blockId, offsetMs);
      } else {
        const blockStart = blocks?.get(blockId);
        if (blockStart === undefined) return;
        blocks!.delete(blockId);
        this.reasoningDurMs.set(
          step,
          (this.reasoningDurMs.get(step) ?? 0) + Math.max(0, offsetMs - blockStart),
        );
      }
      return;
    }

    const isReasoning = chunk.type === "reasoning-delta";
    if (chunk.type !== "text-delta" && !isReasoning) return;
    const text =
      typeof chunk.text === "string"
        ? chunk.text
        : typeof chunk.textDelta === "string"
          ? chunk.textDelta
          : undefined;
    if (!text || text.length === 0) return;

    if (!this.ttft.has(step)) this.ttft.set(step, Math.max(0, now - this.lastBoundary));
  }

  /** streamText `onStepFinish`: close the in-flight step with real timing. */
  addStreamStep(step: StepView | undefined): void {
    const stepNumber = this.streamStepIndex;
    const start = this.lastBoundary;
    const now = Date.now();
    this.lastBoundary = now;
    // The step span covers generation only: onStepFinish fires after the
    // step's tools have executed, so when the step requested tools, close the
    // span at the first tool's start — the tool spans (children of this step)
    // carry the execution time themselves.
    const toolWindows = this.claimStepTools(step, stepNumber);
    const end =
      toolWindows.length > 0
        ? Math.min(Math.max(start, Math.min(...toolWindows.map((w) => w[0]))), now)
        : now;
    const usage = withWebSearch(mapUsageWrap(step?.usage as never), step);
    // Close reasoning blocks that never saw a reasoning-end (best effort:
    // count them as running until the step boundary).
    const openBlocks = this.activeReasoningBlocks.get(stepNumber);
    if (openBlocks) {
      const endOffsetMs = Math.max(0, end - start);
      for (const blockStart of openBlocks.values()) {
        this.reasoningDurMs.set(
          stepNumber,
          (this.reasoningDurMs.get(stepNumber) ?? 0) + Math.max(0, endOffsetMs - blockStart),
        );
      }
    }
    const reasoningDurationMs = this.reasoningDurMs.get(stepNumber);
    this.activeReasoningBlocks.delete(stepNumber);
    this.reasoningDurMs.delete(stepNumber);
    this.pushLlmSpan({
      stepNumber,
      start,
      end,
      usage,
      provider: this.provider,
      modelId: step?.response?.modelId ?? this.modelId,
      finishReason: step?.finishReason,
      output: step?.text,
      reasoningDurationMs:
        reasoningDurationMs !== undefined ? Math.round(reasoningDurationMs) : undefined,
      ...this.stepSignals(step),
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
        usage: withWebSearch(mapUsageWrap(result?.usage as never), result),
        provider: this.provider,
        modelId: this.modelId,
        finishReason: undefined,
        output: result?.text,
        ...this.stepSignals(result as StepView | undefined),
      });
    } else {
      // Claim each step's tools first (matched by toolCallId): re-parents the
      // tool spans under their step and yields the per-step windows that bound
      // the reconstruction. Parallel tool calls all belong to one step, so the
      // grouping is what keeps a 13-tool step from collapsing later steps to 0ms.
      const stepWindows = steps.map((s, i) => this.claimStepTools(s, i));
      const times = reconstructStepTimes(this.startTime, end, stepWindows);
      steps.forEach((s, i) => {
        const [st, en] = times[i] ?? [this.startTime, end];
        this.pushLlmSpan({
          stepNumber: i,
          start: st,
          end: en,
          usage: withWebSearch(mapUsageWrap(s?.usage as never), s),
          provider: this.provider,
          modelId: s?.response?.modelId ?? this.modelId,
          finishReason: s?.finishReason,
          output: s?.text,
          ...this.stepSignals(s),
        });
      });
    }
    this.finalizeOk(result?.text);
  }

  // --- object generation (generateObject / streamObject) -----------------

  completeObject(args: {
    usage?: unknown;
    object?: unknown;
    modelId?: string;
    // The full result (generateObject) or onFinish event (streamObject), read
    // for provider signals (fingerprint, safety, rate-limit headers).
    raw?: StepView;
  }): void {
    const end = Date.now();
    this.endTime = Math.max(this.endTime, end);
    this.pushLlmSpan({
      stepNumber: 0,
      start: this.startTime,
      end,
      usage: withWebSearch(mapUsageWrap(args.usage as never), args.raw),
      provider: this.provider,
      modelId: args.modelId ?? args.raw?.response?.modelId ?? this.modelId,
      finishReason: args.raw?.finishReason,
      output: args.object,
      ...this.stepSignals(args.raw),
    });
    this.finalizeOk(args.object);
  }

  fail(error: unknown): void {
    this.error = serialize(errMsg(error), ERROR_MESSAGE_CAP) ?? "error";
    this.finalize();
  }

  // --- internals ----------------------------------------------------------

  // Secondary provider signals from a step view. modelCallMs is intentionally
  // absent — v4-v6 expose no language-model-call lifecycle to measure it.
  private stepSignals(step: StepView | undefined): {
    systemFingerprint?: string;
    safetyMetadata?: string;
    sources?: string;
    rateLimit?: RateLimitInfo;
  } {
    if (!step) return {};
    return {
      systemFingerprint: extractSystemFingerprint(step),
      safetyMetadata: extractSafetyMetadata(step, this.config.maxPayloadChars),
      sources: this.config.recordOutputs
        ? extractSources(step, this.config.maxPayloadChars)
        : undefined,
      rateLimit: extractRateLimit(stepResponseHeaders(step), Date.now()),
    };
  }

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
      reasoningDurationMs: s.reasoningDurationMs,
      output: this.config.recordOutputs
        ? serialize(s.output, this.config.maxPayloadChars)
        : undefined,
      toolCatalog: this.toolCatalog,
      systemFingerprint: s.systemFingerprint,
      safetyMetadata: s.safetyMetadata,
      sources: s.sources,
      rateLimit: s.rateLimit,
      metadata,
    });
    if (end > this.endTime) this.endTime = end;
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
      toolCatalog: this.toolCatalog,
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
      customer: ctx.customer,
      metadata: coerceMetadata(ctx.metadata),
      spans,
    };
    this.transport.enqueue(trace);
  }
}

function errMsg(error: unknown): unknown {
  return error instanceof Error ? error.message : error;
}
