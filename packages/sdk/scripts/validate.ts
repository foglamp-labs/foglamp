// Behavioral check for the SDK's Telemetry → wire mapping. Drives the v7
// lifecycle hooks by hand (no live model) against a captured fetch, then asserts
// the produced IngestPayload: trace/span shape, id correlation, usage mapping,
// TTFT capture, metadata coercion, context binding, and the disabled no-op.
// Run manually during Phase 6 verification: `bun run scripts/validate.ts`.
import { ingestPayloadSchema, type IngestPayload } from "@foglamp/contracts";

import { foglamp } from "../src/index";
import { wrap } from "../src/wrap/index";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

// A fetch double that records every POSTed body.
function makeCapture() {
  const bodies: IngestPayload[] = [];
  let calls = 0;
  const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
    calls += 1;
    bodies.push(JSON.parse(String(init?.body)) as IngestPayload);
    return new Response(null, { status: 200, statusText: "OK" });
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    bodies,
    get calls() {
      return calls;
    },
  };
}

// Loosely-typed hook driver — the collector reads events through structural
// views, so plain objects with the needed fields suffice.
type Hooks = Record<string, (event: unknown) => void>;

const CALL = "call_abc";
const base = Date.now();

// --- Happy path: generateText, 2 steps, 1 tool, streamed first chunk --------
console.log("Telemetry lifecycle → IngestPayload:");
const cap = makeCapture();
const fog = foglamp({
  apiKey: "fl_test_key",
  endpoint: "http://capture.local/ingest",
  fetch: cap.fetchImpl,
  flushIntervalMs: 10_000, // we flush explicitly
});

const integration = fog.integration({
  agentName: "support",
  workflowName: "ticket-flow",
  workflowRunId: "run_1",
  sessionId: "sess_1",
  metadata: { env: "prod", tier: 2, beta: true },
}) as unknown as Hooks;

integration.onStart({
  callId: CALL,
  operationId: "ai.streamText",
  provider: "openai",
  modelId: "gpt-4o",
  functionId: "ignored-because-context-bound",
  messages: [{ role: "user", content: "help me" }],
});
integration.onStepStart({ callId: CALL, stepNumber: 0, messages: [{ role: "user", content: "help me" }] });
// First streamed chunk → TTFT for step 0, then text-deltas drive intra-stream
// sampling. The deltas carry no callId/stepNumber, exercising the fallback that
// routes them to the single streaming step.
integration.onChunk({ chunk: { type: "ai.stream.firstChunk", callId: CALL, stepNumber: 0 } });
integration.onChunk({ chunk: { type: "text-delta", text: "Hello, " } });
integration.onChunk({ chunk: { type: "text-delta", text: "this is " } });
integration.onChunk({ chunk: { type: "text-delta", text: "the answer." } });
integration.onStepFinish({
  callId: CALL,
  stepNumber: 0,
  model: { provider: "openai", modelId: "gpt-4o" },
  usage: {
    inputTokens: 1000,
    outputTokens: 200,
    totalTokens: 1200,
    inputTokenDetails: { cacheReadTokens: 200, cacheWriteTokens: 50 },
    outputTokenDetails: { reasoningTokens: 40 },
  },
  text: "",
  finishReason: "tool-calls",
});
integration.onToolExecutionStart({
  callId: CALL,
  toolCall: { toolCallId: "tc_1", toolName: "search", input: { q: "foglamp" } },
});
integration.onToolExecutionEnd({
  callId: CALL,
  durationMs: 40,
  toolCall: { toolCallId: "tc_1", toolName: "search", input: { q: "foglamp" } },
  toolOutput: { type: "tool-result", output: { hits: 3 } },
});
integration.onStepFinish({
  callId: CALL,
  stepNumber: 1,
  model: { provider: "openai", modelId: "gpt-4o" },
  usage: { inputTokens: 1300, outputTokens: 80, totalTokens: 1380 },
  text: "Here is your answer.",
  finishReason: "stop",
});
integration.onFinish({ callId: CALL, text: "Here is your answer." });

await fog.flush();

assert(cap.calls === 1, "one POST issued on flush");
const payload = cap.bodies[0]!;

// The payload must satisfy the real contract schema the ingest service uses.
const parsed = ingestPayloadSchema.safeParse(payload);
assert(parsed.success, `payload validates against @foglamp/contracts${parsed.success ? "" : `: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`}`);

assert(payload.version === "v1", "wire version is v1");
assert(payload.traces.length === 1, "one trace");
const trace = payload.traces[0]!;
assert(trace.traceId === CALL, "traceId === callId");
assert(trace.agentName === "support", "agentName from bound context");
assert(trace.workflowRunId === "run_1", "workflowRunId from context");
assert(trace.sessionId === "sess_1", "sessionId from context");
assert(trace.metadata?.env === "prod", "string metadata preserved");
assert(trace.metadata?.tier === "2", "number metadata coerced to string");
assert(trace.metadata?.beta === "true", "boolean metadata coerced to string");

const spans = trace.spans;
const root = spans.find((s) => s.spanType === "agent")!;
const step0 = spans.find((s) => s.spanId === `${CALL}:step:0`)!;
const step1 = spans.find((s) => s.spanId === `${CALL}:step:1`)!;
const tool = spans.find((s) => s.spanType === "tool")!;

assert(spans.length === 4, `4 spans (root + 2 llm + 1 tool), got ${spans.length}`);
assert(root.spanId === `${CALL}:root`, "root span id");
assert(root.name === "support", "root span named after agent");
assert(root.output === "Here is your answer.", "root output captured from onFinish");
assert(step0.spanType === "llm" && step0.parentSpanId === `${CALL}:root`, "llm step parented to root");
assert(step0.ttftMs !== undefined && step0.ttftMs >= 0, `TTFT captured for streamed step 0 (${step0.ttftMs}ms)`);
assert(step1.ttftMs === undefined, "no TTFT for step without a first-chunk marker");
assert(
  Array.isArray(step0.chunkOffsets) && step0.chunkOffsets!.length >= 1,
  `chunk samples captured for streamed step 0 (${step0.chunkOffsets?.length} samples)`,
);
assert(
  step0.chunkOffsets!.length === step0.chunkTokens!.length,
  "chunkOffsets and chunkTokens are parallel arrays",
);
// outputTokens 200 − reasoningTokens 40 = 160 visible tokens at the final sample.
assert(
  step0.chunkTokens![step0.chunkTokens!.length - 1] === 160,
  `final cumulative tokens rescaled to output−reasoning (got ${step0.chunkTokens![step0.chunkTokens!.length - 1]})`,
);
assert(
  step1.chunkOffsets === undefined && step1.chunkTokens === undefined,
  "no chunk arrays for a non-streamed step",
);
assert(step0.usage?.inputTokens === 1000, "input tokens mapped");
assert(step0.usage?.cachedInputTokens === 200, "cacheRead → cachedInputTokens");
assert(step0.usage?.cacheWriteInputTokens === 50, "cacheWrite → cacheWriteInputTokens");
assert(step0.usage?.reasoningTokens === 40, "reasoning tokens mapped from detail");
assert(step0.provider === "openai" && step0.modelId === "gpt-4o", "model attribution on llm span");
assert(step0.metadata?.finishReason === "tool-calls", "finishReason recorded on llm span");
assert(tool.name === "search", "tool span named after tool");
assert(tool.parentSpanId === `${CALL}:root`, "tool parented to root");
assert(tool.status === "ok", "successful tool → ok");
assert(tool.input === '{"q":"foglamp"}', "tool input serialized");
assert(tool.output === '{"hits":3}', "tool output serialized");
assert(root.startTime <= step0.startTime && step1.endTime <= root.endTime, "root span envelopes child spans");
assert(base - 5_000 < root.startTime, "timestamps are epoch ms");

// --- recordInputs / recordOutputs disabled ---------------------------------
console.log("recordInputs/recordOutputs = false:");
const cap2 = makeCapture();
const wt2 = foglamp({ apiKey: "k", fetch: cap2.fetchImpl, recordInputs: false, recordOutputs: false });
const i2 = wt2.integration({ agentName: "a" }) as unknown as Hooks;
i2.onStart({ callId: "c2", operationId: "ai.generateText", provider: "openai", modelId: "gpt-4o", messages: [{ role: "user", content: "secret" }] });
i2.onStepFinish({ callId: "c2", stepNumber: 0, model: { provider: "openai", modelId: "gpt-4o" }, usage: { inputTokens: 5 }, text: "secret answer", finishReason: "stop" });
i2.onFinish({ callId: "c2", text: "secret answer" });
await wt2.flush();
const t2 = cap2.bodies[0]!.traces[0]!;
assert(t2.spans.every((s) => s.input === undefined), "no inputs captured when recordInputs=false");
assert(t2.spans.every((s) => s.output === undefined), "no outputs captured when recordOutputs=false");
assert(t2.spans.find((s) => s.spanType === "llm")?.usage?.inputTokens === 5, "usage still captured (not gated by recordInputs)");

// --- onError closes the open trace -----------------------------------------
console.log("onError path:");
const cap3 = makeCapture();
const wt3 = foglamp({ apiKey: "k", fetch: cap3.fetchImpl });
const i3 = wt3.integration({ agentName: "boom" }) as unknown as Hooks;
i3.onStart({ callId: "c3", operationId: "ai.generateText", provider: "openai", modelId: "gpt-4o", messages: [] });
i3.onError(new Error("model exploded"));
await wt3.flush();
const t3 = cap3.bodies[0]?.traces[0];
assert(!!t3, "errored trace was flushed");
assert(t3!.spans[0]!.status === "error", "root span marked error");
assert(t3!.spans[0]!.errorMessage === "model exploded", "error message captured");

// --- Disabled no-op (no API key) -------------------------------------------
console.log("disabled (no FOGLAMP_API_KEY):");
const prev = process.env.FOGLAMP_API_KEY;
delete process.env.FOGLAMP_API_KEY;
const cap4 = makeCapture();
const wt4 = foglamp({ fetch: cap4.fetchImpl });
const i4 = wt4.integration({ agentName: "x" }) as unknown as Hooks;
i4.onStart({ callId: "c4", operationId: "ai.generateText", provider: "openai", modelId: "gpt-4o", messages: [] });
i4.onStepFinish({ callId: "c4", stepNumber: 0, model: { provider: "openai", modelId: "gpt-4o" }, usage: {}, text: "x", finishReason: "stop" });
i4.onFinish({ callId: "c4", text: "x" });
await wt4.flush();
assert(cap4.calls === 0, "no network calls when disabled");
assert(wt4.pending === 0, "nothing buffered when disabled");
if (prev !== undefined) process.env.FOGLAMP_API_KEY = prev;

// --- traceName propagation & fallback --------------------------------------
console.log("traceName:");
const capTN = makeCapture();
const wtTN = foglamp({ apiKey: "fl_test", endpoint: "http://x.local/ingest", fetch: capTN.fetchImpl });
const iTN = wtTN.integration({ traceName: "summarize", agentName: "support" }) as unknown as Hooks;
iTN.onStart({ callId: "cTN", operationId: "ai.generateText", provider: "openai", modelId: "gpt-4o", messages: [] });
iTN.onStepFinish({ callId: "cTN", stepNumber: 0, model: { provider: "openai", modelId: "gpt-4o" }, usage: { inputTokens: 5 }, text: "x", finishReason: "stop" });
iTN.onFinish({ callId: "cTN", text: "x" });
await wtTN.flush();
const tTN = capTN.bodies[0]!.traces[0]!;
assert(tTN.traceName === "summarize", "traceName flows onto the wire trace");
assert(tTN.spans[0]!.name === "summarize", "root span name = traceName (wins over agentName)");

// traceName only (one-off call, no agent) — must satisfy the contract.
const capTN2 = makeCapture();
const wtTN2 = foglamp({ apiKey: "fl_test", endpoint: "http://x.local/ingest", fetch: capTN2.fetchImpl });
const iTN2 = wtTN2.integration({ traceName: "classify" }) as unknown as Hooks;
iTN2.onStart({ callId: "cTN2", operationId: "ai.generateText", provider: "openai", modelId: "gpt-4o", messages: [] });
iTN2.onStepFinish({ callId: "cTN2", stepNumber: 0, model: { provider: "openai", modelId: "gpt-4o" }, usage: { inputTokens: 3 }, text: "y", finishReason: "stop" });
iTN2.onFinish({ callId: "cTN2", text: "y" });
await wtTN2.flush();
assert(capTN2.bodies[0]!.traces[0]!.agentName === undefined, "agentName absent for a named one-off");
assert(ingestPayloadSchema.safeParse(capTN2.bodies[0]).success, "traceName-only payload validates against the contract");

// --- integration() eager validation ----------------------------------------
console.log("integration() validation:");
const wtV = foglamp({ apiKey: "fl_test", endpoint: "http://x.local/ingest", fetch: makeCapture().fetchImpl });
let threwName = false;
try { wtV.integration({} as never); } catch { threwName = true; }
assert(threwName, "integration({}) throws when neither traceName nor agentName given");
let threwWf = false;
try { wtV.integration({ agentName: "a", workflowName: "wf" } as never); } catch { threwWf = true; }
assert(threwWf, "integration() throws when workflowName given without workflowRunId");

// ===========================================================================
// foglamp/wrap — the v4+ wrapping adapter. Drives a FAKE `ai` module so we never
// touch a real model: its functions invoke the composed callbacks / return
// results with version-specific shapes, and a tool with a timed `execute`.
// ===========================================================================
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- generateText: v4 usage shape (promptTokens), real tool timing ----------
console.log("\nwrap() generateText (v4 usage shape + tool timing):");
const capW = makeCapture();
let userToolRan = false;
const fakeAiGen = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateText: async (args: any) => {
    // The wrapper has already replaced execute with a timed version.
    if (args.tools?.search?.execute) {
      await args.tools.search.execute({ q: "foglamp" }, { toolCallId: "tc_1" });
    }
    return {
      text: "final answer",
      // v4 field names — must still map to input/outputTokens.
      usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
      steps: [
        { usage: { promptTokens: 1000, completionTokens: 200 }, text: "", finishReason: "tool-calls", response: { modelId: "gpt-4o" } },
        { usage: { promptTokens: 1300, completionTokens: 80 }, text: "final answer", finishReason: "stop" },
      ],
    };
  },
  streamText: () => ({}),
  generateObject: async () => ({}),
  streamObject: () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
const wGen = wrap(fakeAiGen, {
  apiKey: "fl_test",
  endpoint: "http://capture.local/ingest",
  fetch: capW.fetchImpl,
  flushIntervalMs: 10_000,
  context: { agentName: "support" },
});
const genResult = await (wGen.generateText as (a: unknown) => Promise<{ text: string }>)({
  model: { provider: "openai", modelId: "gpt-4o" },
  prompt: "help me",
  tools: { search: { description: "search", execute: async () => { userToolRan = true; await sleep(12); return { hits: 3 }; } } },
});
await wGen.flush();

assert(genResult.text === "final answer", "wrapped generateText returns the model result unchanged");
assert(userToolRan, "the user's original tool execute still ran");
assert(capW.calls === 1, "one POST issued on flush");
const wPayload = capW.bodies[0]!;
assert(ingestPayloadSchema.safeParse(wPayload).success, "wrap payload validates against the contract");
const wTrace = wPayload.traces[0]!;
assert(wTrace.agentName === "support", "wrap-time context applied");
const wSpans = wTrace.spans;
const wRoot = wSpans.find((s) => s.spanType === "agent")!;
const wStep0 = wSpans.find((s) => s.spanId.endsWith(":step:0"))!;
const wTool = wSpans.find((s) => s.spanType === "tool")!;
assert(wStep0.usage?.inputTokens === 1000, "v4 promptTokens → inputTokens");
assert(wStep0.usage?.outputTokens === 200, "v4 completionTokens → outputTokens");
assert(wTool.name === "search" && wTool.status === "ok", "tool span captured from wrapped execute");
assert(wTool.endTime - wTool.startTime >= 5, `tool span has a real measured duration (${wTool.endTime - wTool.startTime}ms, not estimated)`);
assert(wTool.output === '{"hits":3}', "tool output serialized");
assert(wRoot.output === "final answer", "root output from result text");
assert(wRoot.startTime <= wTool.startTime && wTool.endTime <= wRoot.endTime, "root envelopes the tool span");

// --- streamText: v5/v6 usage shape (inputTokens), TTFT + chunk curve --------
console.log("wrap() streamText (v5/v6 usage shape + streaming curve + callback composition):");
const capS = makeCapture();
let userChunks = 0;
let userSteps = 0;
const fakeAiStream = {
  generateText: async () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  streamText: (args: any) => {
    args.onChunk?.({ chunk: { type: "text-delta", text: "Hello, " } });
    args.onChunk?.({ chunk: { type: "text-delta", text: "this is " } });
    args.onChunk?.({ chunk: { type: "text-delta", text: "the answer." } });
    args.onStepFinish?.({ usage: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200, outputTokenDetails: { reasoningTokens: 40 } }, text: "the answer.", finishReason: "stop", response: { modelId: "gpt-4o" } });
    args.onFinish?.({ text: "the answer." });
    return { textStream: [] };
  },
  generateObject: async () => ({}),
  streamObject: () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
const wStream = wrap(fakeAiStream, { apiKey: "fl_test", fetch: capS.fetchImpl, flushIntervalMs: 10_000 });
(wStream.streamText as (a: unknown) => unknown)({
  model: { provider: "openai", modelId: "gpt-4o" },
  prompt: "help me",
  foglamp: { traceName: "summarize" },
  onChunk: () => { userChunks++; },
  onStepFinish: () => { userSteps++; },
});
await wStream.flush();

const sTrace = capS.bodies[0]!.traces[0]!;
assert(ingestPayloadSchema.safeParse(capS.bodies[0]).success, "streamText wrap payload validates");
assert(sTrace.traceName === "summarize", "per-call `foglamp:` override applied (call-time wins)");
const sStep = sTrace.spans.find((s) => s.spanType === "llm")!;
assert(sStep.usage?.inputTokens === 1000, "v5/v6 inputTokens mapped");
assert(sStep.usage?.reasoningTokens === 40, "reasoning tokens from outputTokenDetails");
assert(sStep.ttftMs !== undefined && sStep.ttftMs >= 0, `TTFT captured (${sStep.ttftMs}ms)`);
assert(Array.isArray(sStep.chunkOffsets) && sStep.chunkOffsets!.length >= 1, "chunk samples captured");
assert(sStep.chunkTokens![sStep.chunkTokens!.length - 1] === 160, `final tokens rescaled to output−reasoning (got ${sStep.chunkTokens![sStep.chunkTokens!.length - 1]})`);
assert(userChunks === 3 && userSteps === 1, "user-supplied onChunk/onStepFinish still invoked (composition, not clobber)");

// --- generateObject + streamObject -----------------------------------------
console.log("wrap() generateObject + streamObject:");
const capO = makeCapture();
const fakeAiObj = {
  generateText: async () => ({}),
  streamText: () => ({}),
  generateObject: async () => ({ object: { ok: true }, usage: { promptTokens: 50, completionTokens: 10 }, response: { modelId: "gpt-4o" } }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  streamObject: (args: any) => { args.onFinish?.({ usage: { inputTokens: 20, outputTokens: 5 }, object: { done: true } }); return { partialObjectStream: [] }; },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
const wObj = wrap(fakeAiObj, { apiKey: "fl_test", fetch: capO.fetchImpl, flushIntervalMs: 10_000, context: { agentName: "classify" } });
await (wObj.generateObject as (a: unknown) => Promise<unknown>)({ model: { provider: "openai", modelId: "gpt-4o" }, prompt: "p" });
(wObj.streamObject as (a: unknown) => unknown)({ model: { provider: "openai", modelId: "gpt-4o" }, prompt: "p" });
await wObj.flush();
// Both object traces share one Transport, so a single flush POSTs them together.
const objTraces = capO.bodies[0]!.traces;
assert(objTraces.length === 2, `both object traces in one batch (got ${objTraces.length})`);
assert(objTraces[0]!.spans.find((s) => s.spanType === "llm")?.usage?.inputTokens === 50, "generateObject usage mapped (promptTokens)");
assert(objTraces[1]!.spans.find((s) => s.spanType === "llm")?.usage?.inputTokens === 20, "streamObject usage mapped from onFinish");

// --- disabled no-op: passthrough, no capture --------------------------------
console.log("wrap() disabled (no API key):");
const prevW = process.env.FOGLAMP_API_KEY;
delete process.env.FOGLAMP_API_KEY;
const capD = makeCapture();
const fakeAiD = { generateText: async () => ({ text: "ok" }), streamText: () => ({}), generateObject: async () => ({}), streamObject: () => ({}) } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const wD = wrap(fakeAiD, { fetch: capD.fetchImpl });
const dRes = await (wD.generateText as (a: unknown) => Promise<{ text: string }>)({ model: { modelId: "m" }, prompt: "p" });
await wD.flush();
assert(dRes.text === "ok", "disabled wrap still forwards to the real function");
assert(capD.calls === 0, "no network calls when disabled");
if (prevW !== undefined) process.env.FOGLAMP_API_KEY = prevW;

console.log("\nALL SDK CHECKS PASSED ✅");
