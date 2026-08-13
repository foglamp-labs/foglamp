import { describe, expect, test } from "bun:test";

import { resolveConfig } from "../config";
import type { Transport } from "../transport";
import type { Span, Trace } from "../wire";
import { WrapCollector, reconstructStepTimes } from "./collector";

function makeCollector(operation = "generateText") {
  const traces: Trace[] = [];
  const transport = { enqueue: (t: Trace) => traces.push(t) } as unknown as Transport;
  const config = resolveConfig({ apiKey: "fl_test" });
  const collector = new WrapCollector(transport, config, {}, {
    operation,
    provider: "openai",
    modelId: "gpt-x",
  });
  return { collector, traces };
}

function llmSteps(trace: Trace): Span[] {
  return trace.spans
    .filter((s) => s.spanType === "llm")
    .sort((a, b) => a.spanId.localeCompare(b.spanId));
}

describe("reconstructStepTimes", () => {
  test("groups parallel tool windows per step — a many-tool step never zeroes the next", () => {
    // The prod failure shape: step 0 requests many tools in parallel (identical
    // windows), step 1 answers. The old one-window-per-step logic collapsed
    // step 0 (or 1) to a 0ms sliver; grouped windows keep every step non-empty.
    const parallel: Array<[number, number]> = Array.from({ length: 13 }, () => [
      10_000, 50_000,
    ]);
    const times = reconstructStepTimes(0, 100_000, [parallel, []]);
    expect(times).toEqual([
      [0, 10_000], // generation up to its own first tool
      [50_000, 100_000], // resumes when the last tool ends
    ]);
    for (const [s, e] of times) expect(e - s).toBeGreaterThan(0);
  });

  test("three steps: each generation window is bounded by its own tools", () => {
    const times = reconstructStepTimes(0, 100_000, [
      [
        [10_000, 40_000],
        [10_000, 20_000],
      ],
      [[60_000, 80_000]],
      [],
    ]);
    expect(times).toEqual([
      [0, 10_000],
      [40_000, 60_000],
      [80_000, 100_000],
    ]);
  });

  test("a middle step with no matched tools splits the remaining span evenly", () => {
    const times = reconstructStepTimes(0, 90_000, [[], [], []]);
    expect(times).toEqual([
      [0, 30_000],
      [30_000, 60_000],
      [60_000, 90_000],
    ]);
  });

  test("windows outside [start, end] are clamped, never producing inverted steps", () => {
    const times = reconstructStepTimes(1_000, 2_000, [[[500, 5_000]], []]);
    for (const [s, e] of times) {
      expect(s).toBeGreaterThanOrEqual(1_000);
      expect(e).toBeLessThanOrEqual(2_000);
      expect(e).toBeGreaterThanOrEqual(s);
    }
  });
});

describe("WrapCollector non-streaming (completeFromResult)", () => {
  test("parallel tool calls: steps keep real durations, tools re-parent under their step", async () => {
    const { collector, traces } = makeCollector();
    await Bun.sleep(15); // step 0 generation
    const toolStart = Date.now();
    await Bun.sleep(15); // three tools run in parallel
    const toolEnd = Date.now();
    for (const id of ["a", "b", "c"]) {
      collector.recordTool({
        name: "search",
        toolCallId: id,
        input: { q: id },
        output: "found",
        start: toolStart,
        end: toolEnd,
      });
    }
    await Bun.sleep(15); // step 1 generation
    collector.completeFromResult({
      steps: [
        {
          text: "calling tools",
          toolCalls: [{ toolCallId: "a" }, { toolCallId: "b" }, { toolCallId: "c" }],
          usage: { inputTokens: 10, outputTokens: 5 },
          finishReason: "tool-calls",
        },
        { text: "final", usage: { inputTokens: 12, outputTokens: 6 }, finishReason: "stop" },
      ],
      text: "final",
    });

    const trace = traces[0]!;
    const [step0, step1] = llmSteps(trace);
    // Step 0 covers generation only: it ends exactly where its tools begin.
    expect(step0!.endTime).toBe(toolStart);
    expect(step0!.endTime - step0!.startTime).toBeGreaterThan(0);
    // Step 1 resumes when the last tool ends — not collapsed to 0ms by the
    // parallel windows, and not starting before the tools finished.
    expect(step1!.startTime).toBe(toolEnd);
    expect(step1!.endTime - step1!.startTime).toBeGreaterThan(0);
    // The tools are children of the step that requested them.
    const toolSpans = trace.spans.filter((s) => s.spanType === "tool");
    expect(toolSpans).toHaveLength(3);
    for (const t of toolSpans) {
      expect(t.parentSpanId).toBe(`${trace.traceId}:step:0`);
    }
  });

  test("a tool no step claims stays parented to the root", async () => {
    const { collector, traces } = makeCollector();
    const now = Date.now();
    collector.recordTool({
      name: "orphan",
      toolCallId: "unclaimed",
      input: {},
      output: "x",
      start: now,
      end: now + 5,
    });
    collector.completeFromResult({
      steps: [{ text: "no tool calls listed", usage: { inputTokens: 1, outputTokens: 1 } }],
      text: "done",
    });

    const trace = traces[0]!;
    const tool = trace.spans.find((s) => s.spanType === "tool")!;
    expect(tool.parentSpanId).toBe(`${trace.traceId}:root`);
  });
});

describe("WrapCollector streaming (addStreamStep)", () => {
  test("a step with tools closes at its first tool's start; tools re-parent under it", async () => {
    const { collector, traces } = makeCollector("streamText");
    await Bun.sleep(10); // step 0 generation
    const toolStart = Date.now();
    await Bun.sleep(10);
    const toolEnd = Date.now();
    collector.recordTool({
      name: "search",
      toolCallId: "x",
      input: { q: "q" },
      output: "ok",
      start: toolStart,
      end: toolEnd,
    });
    collector.addStreamStep({
      text: "calling tool",
      toolCalls: [{ toolCallId: "x" }],
      usage: { inputTokens: 5, outputTokens: 2 },
      finishReason: "tool-calls",
    });
    await Bun.sleep(10); // step 1 generation
    collector.addStreamStep({
      text: "done",
      usage: { inputTokens: 6, outputTokens: 3 },
      finishReason: "stop",
    });
    collector.finalizeStream({ text: "done" });

    const trace = traces[0]!;
    const [step0, step1] = llmSteps(trace);
    // Generation-only semantics: the span ends where its tool begins, even
    // though onStepFinish fired after the tool completed.
    expect(step0!.endTime).toBe(toolStart);
    expect(step0!.endTime - step0!.startTime).toBeGreaterThan(0);
    expect(step1!.endTime - step1!.startTime).toBeGreaterThan(0);
    const tool = trace.spans.find((s) => s.spanType === "tool")!;
    expect(tool.parentSpanId).toBe(`${trace.traceId}:step:0`);
  });
});
