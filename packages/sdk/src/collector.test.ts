import { describe, expect, test } from "bun:test";

import { Collector } from "./collector";
import { resolveConfig } from "./config";
import type { Transport } from "./transport";
import type { Span, Trace } from "./wire";

// A Transport stub that just captures enqueued traces.
function makeCollector() {
  const traces: Trace[] = [];
  const transport = { enqueue: (t: Trace) => traces.push(t) } as unknown as Transport;
  const config = resolveConfig({ apiKey: "fl_test", recordInputs: false, recordOutputs: true });
  const collector = new Collector(transport, config);
  return { collector, traces };
}

function llmSpan(trace: Trace): Span {
  const s = trace.spans.find((sp) => sp.spanType === "llm");
  if (!s) throw new Error("no llm span");
  return s;
}

describe("Collector model-call + provider signals", () => {
  test("modelCallMs is annotated; the span still covers the whole step", async () => {
    const { collector, traces } = makeCollector();
    const callId = "call-1";
    collector.onStart!({ callId, provider: "openai", modelId: "gpt-x" } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onLanguageModelCallStart!({ callId } as never);
    await Bun.sleep(15);
    collector.onLanguageModelCallEnd!({ callId } as never);
    // Simulate client-side tool time before the step closes.
    await Bun.sleep(15);
    collector.onStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 5, outputTokens: 7 },
      finishReason: "stop",
    } as never);
    collector.onFinish!({ callId, text: "done" } as never);

    expect(traces.length).toBe(1);
    const span = llmSpan(traces[0]!);
    expect(span.modelCallMs).toBeGreaterThan(0);
    // The model-call window is shorter than the whole step (which includes tools).
    const stepMs = span.endTime - span.startTime;
    expect(span.modelCallMs!).toBeLessThanOrEqual(stepMs);
    expect(stepMs).toBeGreaterThanOrEqual(span.modelCallMs!);
  });

  test("system fingerprint, safety, sources, and rate-limit flow onto the span", () => {
    const { collector, traces } = makeCollector();
    const callId = "call-2";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      providerMetadata: {
        openai: { systemFingerprint: "fp_test" },
        google: { safetyRatings: [{ category: "HARM_CATEGORY_HATE", probability: "LOW" }] },
      },
      sources: [{ sourceType: "url", url: "https://x.test", title: "X" }],
      response: {
        headers: {
          "x-ratelimit-remaining-tokens": "900",
          "x-ratelimit-limit-tokens": "1000",
        },
      },
    } as never);
    collector.onFinish!({ callId, text: "done" } as never);

    const span = llmSpan(traces[0]!);
    expect(span.systemFingerprint).toBe("fp_test");
    expect(span.safetyMetadata).toBeDefined();
    expect(JSON.parse(span.safetyMetadata!).google).toHaveLength(1);
    expect(span.sources).toBeDefined();
    expect(JSON.parse(span.sources!)[0].url).toBe("https://x.test");
    expect(span.rateLimit).toEqual({ tokensRemaining: 900, tokensLimit: 1000 });
  });

  test("sources are dropped when output capture is off", () => {
    const traces: Trace[] = [];
    const transport = { enqueue: (t: Trace) => traces.push(t) } as unknown as Transport;
    const config = resolveConfig({ apiKey: "fl_test", recordOutputs: false });
    const collector = new Collector(transport, config);
    const callId = "call-3";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      sources: [{ sourceType: "url", url: "https://x.test" }],
    } as never);
    collector.onFinish!({ callId } as never);

    expect(llmSpan(traces[0]!).sources).toBeUndefined();
  });

  test("no model-call events → modelCallMs stays absent", () => {
    const { collector, traces } = makeCollector();
    const callId = "call-4";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
    } as never);
    collector.onFinish!({ callId } as never);
    expect(llmSpan(traces[0]!).modelCallMs).toBeUndefined();
  });

  // generateObject/streamObject report their single step through the object-step
  // lifecycle, not onStepFinish — these must still produce an llm span carrying
  // usage and provider signals.
  test("object generation: onObjectStepFinish builds an llm span with usage + signals", () => {
    const { collector, traces } = makeCollector();
    const callId = "obj-1";
    collector.onStart!({ callId, provider: "openai", modelId: "gpt-4o" } as never);
    collector.onObjectStepStart!({
      callId,
      stepNumber: 0,
      promptMessages: [{ role: "user", content: "make an object" }],
    } as never);
    collector.onObjectStepFinish!({
      callId,
      stepNumber: 0,
      provider: "openai",
      modelId: "gpt-4o-2024-08-06",
      finishReason: "stop",
      usage: { inputTokens: 5, outputTokens: 7 },
      objectText: '{"a":1}',
      // streamObject reports TTFT via msToFirstChunk (no onChunk on this path).
      msToFirstChunk: 12,
      providerMetadata: {
        openai: { systemFingerprint: "fp_obj" },
        google: { safetyRatings: [{ category: "HARM_CATEGORY_HATE", probability: "LOW" }] },
      },
      response: {
        headers: {
          "x-ratelimit-remaining-tokens": "900",
          "x-ratelimit-limit-tokens": "1000",
        },
      },
    } as never);
    collector.onFinish!({ callId, object: { a: 1 } } as never);

    expect(traces.length).toBe(1);
    const trace = traces[0]!;
    const span = llmSpan(trace);
    expect(span.modelId).toBe("gpt-4o-2024-08-06");
    expect(span.usage?.outputTokens).toBe(7);
    expect(span.ttftMs).toBe(12);
    expect(span.systemFingerprint).toBe("fp_obj");
    expect(span.safetyMetadata).toBeDefined();
    expect(span.rateLimit).toEqual({ tokensRemaining: 900, tokensLimit: 1000 });
    expect(span.output).toBe('{"a":1}');
    // No language-model-call lifecycle on the object path → no modelCallMs.
    expect(span.modelCallMs).toBeUndefined();
    // The trace's root output is the parsed object reported at onFinish.
    const root = trace.spans.find((s) => s.spanType === "agent")!;
    expect(root.output).toBe('{"a":1}');
  });

  test("object generation: sources gated off / no signals → clean span", () => {
    const traces: Trace[] = [];
    const transport = { enqueue: (t: Trace) => traces.push(t) } as unknown as Transport;
    const config = resolveConfig({ apiKey: "fl_test", recordOutputs: false });
    const collector = new Collector(transport, config);
    const callId = "obj-2";
    collector.onStart!({ callId } as never);
    collector.onObjectStepStart!({ callId, stepNumber: 0 } as never);
    collector.onObjectStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      objectText: '{"a":1}',
      sources: [{ sourceType: "url", url: "https://x.test" }],
    } as never);
    collector.onFinish!({ callId, object: { a: 1 } } as never);

    const span = llmSpan(traces[0]!);
    expect(span.sources).toBeUndefined();
    expect(span.output).toBeUndefined();
    expect(span.systemFingerprint).toBeUndefined();
    expect(span.rateLimit).toBeUndefined();
  });
});

// The current v7 beta/canary delivers official per-step stats on
// StepResult.performance and fires onStepEnd/onObjectStepEnd/onEnd. We prefer
// those measured numbers over our derivations, capture the net-new ones, and
// dedup against the deprecated onStepFinish/onObjectStepFinish that older v7
// still emits.
describe("Collector official performance stats (v7 beta/canary)", () => {
  const PERF = {
    responseTimeMs: 480,
    effectiveOutputTokensPerSecond: 41.6,
    effectiveTotalTokensPerSecond: 62.5,
    outputTokensPerSecond: 55.2,
    inputTokensPerSecond: 800.1,
    timeToFirstOutputMs: 120,
    timeBetweenOutputChunksMs: { min: 5, p10: 8, median: 12, avg: 13.4, p90: 20, max: 40 },
  };

  test("performance present → official ttft/modelCall + all new TPS/jitter fields", () => {
    const { collector, traces } = makeCollector();
    const callId = "perf-1";
    collector.onStart!({ callId, provider: "openai", modelId: "gpt-x" } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onStepEnd!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 10, outputTokens: 20 },
      finishReason: "stop",
      performance: PERF,
    } as never);
    collector.onEnd!({ callId, text: "done" } as never);

    expect(traces.length).toBe(1);
    const span = llmSpan(traces[0]!);
    // ttftMs / responseTimeMs are rounded ints; modelCallMs mirrors responseTime.
    expect(span.ttftMs).toBe(120);
    expect(span.responseTimeMs).toBe(480);
    expect(span.modelCallMs).toBe(480);
    // TPS rates pass through as floats.
    expect(span.effectiveOutputTps).toBeCloseTo(41.6);
    expect(span.effectiveTotalTps).toBeCloseTo(62.5);
    expect(span.outputTps).toBeCloseTo(55.2);
    expect(span.inputTps).toBeCloseTo(800.1);
    // Jitter is kept as raw floats at the wire level (ingest rounds the ints).
    expect(span.chunkJitter).toEqual({
      min: 5,
      p10: 8,
      median: 12,
      avg: 13.4,
      p90: 20,
      max: 40,
    });
  });

  test("official performance overrides our onChunk/onLanguageModelCall derivations", async () => {
    const { collector, traces } = makeCollector();
    const callId = "perf-2";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    // Derive a (different) modelCallMs from the language-model-call lifecycle...
    collector.onLanguageModelCallStart!({ callId } as never);
    await Bun.sleep(15);
    collector.onLanguageModelCallEnd!({ callId } as never);
    // ...and a derived TTFT from the first-chunk marker.
    collector.onChunk({ chunk: { type: "ai.stream.firstChunk", callId, stepNumber: 0 } });
    collector.onStepEnd!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 10, outputTokens: 20 },
      finishReason: "stop",
      performance: PERF,
    } as never);
    collector.onEnd!({ callId, text: "done" } as never);

    const span = llmSpan(traces[0]!);
    // Official numbers win over the derived ones (which would differ from 120/480).
    expect(span.ttftMs).toBe(120);
    expect(span.modelCallMs).toBe(480);
  });

  test("performance absent → ttft/modelCall fall back to derived; new fields undefined", async () => {
    const { collector, traces } = makeCollector();
    const callId = "perf-3";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onLanguageModelCallStart!({ callId } as never);
    await Bun.sleep(15);
    collector.onLanguageModelCallEnd!({ callId } as never);
    await Bun.sleep(10);
    collector.onChunk({ chunk: { type: "ai.stream.firstChunk", callId, stepNumber: 0 } });
    collector.onStepEnd!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 10, outputTokens: 20 },
      finishReason: "stop",
    } as never);
    collector.onEnd!({ callId, text: "done" } as never);

    const span = llmSpan(traces[0]!);
    expect(span.modelCallMs).toBeGreaterThan(0); // derived from the lifecycle
    expect(span.ttftMs).toBeGreaterThan(0); // derived from the first-chunk marker
    // Net-new performance fields stay absent without an official source.
    expect(span.responseTimeMs).toBeUndefined();
    expect(span.effectiveOutputTps).toBeUndefined();
    expect(span.effectiveTotalTps).toBeUndefined();
    expect(span.outputTps).toBeUndefined();
    expect(span.inputTps).toBeUndefined();
    expect(span.chunkJitter).toBeUndefined();
  });

  test("non-streamed shape: only the present performance fields populate", () => {
    const { collector, traces } = makeCollector();
    const callId = "perf-4";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    // generateText (non-streamed): no TTFT, no per-chunk timing, no streaming TPS.
    collector.onStepEnd!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 10, outputTokens: 20 },
      finishReason: "stop",
      performance: {
        responseTimeMs: 300,
        effectiveOutputTokensPerSecond: 66.7,
        effectiveTotalTokensPerSecond: 100,
      },
    } as never);
    collector.onEnd!({ callId, text: "done" } as never);

    const span = llmSpan(traces[0]!);
    expect(span.responseTimeMs).toBe(300);
    expect(span.modelCallMs).toBe(300);
    expect(span.effectiveOutputTps).toBeCloseTo(66.7);
    expect(span.effectiveTotalTps).toBeCloseTo(100);
    // Streaming-only fields absent → undefined (not coerced).
    expect(span.ttftMs).toBeUndefined();
    expect(span.outputTps).toBeUndefined();
    expect(span.inputTps).toBeUndefined();
    expect(span.chunkJitter).toBeUndefined();
  });

  test("partial jitter (a sub-field missing) → chunkJitter omitted", () => {
    const { collector, traces } = makeCollector();
    const callId = "perf-5";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onStepEnd!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      performance: {
        responseTimeMs: 200,
        timeBetweenOutputChunksMs: { min: 5, p10: 8, median: 12, avg: 13.4, p90: 20 }, // no max
      },
    } as never);
    collector.onEnd!({ callId, text: "done" } as never);

    expect(llmSpan(traces[0]!).chunkJitter).toBeUndefined();
  });

  test("dedup: onStepEnd then deprecated onStepFinish for one step → a single llm span", () => {
    const { collector, traces } = makeCollector();
    const callId = "dedup-1";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onStepEnd!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      performance: PERF,
    } as never);
    // An older v7 in the peer range would also fire onStepFinish for the step.
    collector.onStepFinish!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
    } as never);
    collector.onEnd!({ callId, text: "done" } as never);

    const llmSpans = traces[0]!.spans.filter((s) => s.spanType === "llm");
    expect(llmSpans.length).toBe(1);
    // The first (onStepEnd) recording wins, keeping the official numbers.
    expect(llmSpans[0]!.responseTimeMs).toBe(480);
  });

  test("dedup: text onStepEnd + object onObjectStepFinish share the step id → one span", () => {
    const { collector, traces } = makeCollector();
    const callId = "dedup-2";
    collector.onStart!({ callId } as never);
    collector.onStepStart!({ callId, stepNumber: 0 } as never);
    collector.onStepEnd!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      performance: PERF,
    } as never);
    collector.onObjectStepFinish({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      objectText: '{"a":1}',
    });
    collector.onEnd!({ callId, text: "done" } as never);

    expect(traces[0]!.spans.filter((s) => s.spanType === "llm").length).toBe(1);
  });

  test("embedding/reranking operations are skipped (no empty root-only trace)", () => {
    const { collector, traces } = makeCollector();
    // The v7 beta/canary fires onStart/onEnd for embed too; we model only generation.
    collector.onStart!({ callId: "emb-1", operationId: "ai.embed" } as never);
    collector.onEnd!({ callId: "emb-1" } as never);
    collector.onStart!({ callId: "emb-2", operationId: "ai.embedMany" } as never);
    collector.onEnd!({ callId: "emb-2" } as never);
    collector.onStart!({ callId: "rr-1", operationId: "ai.rerank" } as never);
    collector.onEnd!({ callId: "rr-1" } as never);
    expect(traces.length).toBe(0);

    // A generation operation alongside them is still captured.
    collector.onStart!({ callId: "gen-1", operationId: "ai.generateText" } as never);
    collector.onStepStart!({ callId: "gen-1", stepNumber: 0 } as never);
    collector.onStepEnd!({
      callId: "gen-1",
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
    } as never);
    collector.onEnd!({ callId: "gen-1", text: "ok" } as never);
    expect(traces.length).toBe(1);
  });

  test("dedup: onObjectStepEnd then deprecated onObjectStepFinish → one span", () => {
    const { collector, traces } = makeCollector();
    const callId = "dedup-3";
    collector.onStart!({ callId } as never);
    collector.onObjectStepStart!({ callId, stepNumber: 0 } as never);
    collector.onObjectStepEnd!({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      objectText: '{"a":1}',
    } as never);
    collector.onObjectStepFinish({
      callId,
      stepNumber: 0,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
      objectText: '{"a":1}',
    });
    collector.onEnd!({ callId, object: { a: 1 } } as never);

    expect(traces[0]!.spans.filter((s) => s.spanType === "llm").length).toBe(1);
  });
});
