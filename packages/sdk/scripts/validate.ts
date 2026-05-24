// Behavioral check for the SDK's Telemetry → wire mapping. Drives the v7
// lifecycle hooks by hand (no live model) against a captured fetch, then asserts
// the produced IngestPayload: trace/span shape, id correlation, usage mapping,
// TTFT capture, metadata coercion, context binding, and the disabled no-op.
// Run manually during Phase 6 verification: `bun run scripts/validate.ts`.
import { ingestPayloadSchema, type IngestPayload } from "@watchtower/contracts";

import { watchtower } from "../src/index";

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
const wt = watchtower({
  apiKey: "wt_test_key",
  endpoint: "http://capture.local/ingest",
  fetch: cap.fetchImpl,
  flushIntervalMs: 10_000, // we flush explicitly
});

const integration = wt.integration({
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
// First streamed chunk → TTFT for step 0.
integration.onChunk({ chunk: { type: "ai.stream.firstChunk", callId: CALL, stepNumber: 0 } });
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
  toolCall: { toolCallId: "tc_1", toolName: "search", input: { q: "watchtower" } },
});
integration.onToolExecutionEnd({
  callId: CALL,
  durationMs: 40,
  toolCall: { toolCallId: "tc_1", toolName: "search", input: { q: "watchtower" } },
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

await wt.flush();

assert(cap.calls === 1, "one POST issued on flush");
const payload = cap.bodies[0]!;

// The payload must satisfy the real contract schema the ingest service uses.
const parsed = ingestPayloadSchema.safeParse(payload);
assert(parsed.success, `payload validates against @watchtower/contracts${parsed.success ? "" : `: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`}`);

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
assert(step0.usage?.inputTokens === 1000, "input tokens mapped");
assert(step0.usage?.cachedInputTokens === 200, "cacheRead → cachedInputTokens");
assert(step0.usage?.cacheWriteInputTokens === 50, "cacheWrite → cacheWriteInputTokens");
assert(step0.usage?.reasoningTokens === 40, "reasoning tokens mapped from detail");
assert(step0.provider === "openai" && step0.modelId === "gpt-4o", "model attribution on llm span");
assert(step0.metadata?.finishReason === "tool-calls", "finishReason recorded on llm span");
assert(tool.name === "search", "tool span named after tool");
assert(tool.parentSpanId === `${CALL}:root`, "tool parented to root");
assert(tool.status === "ok", "successful tool → ok");
assert(tool.input === '{"q":"watchtower"}', "tool input serialized");
assert(tool.output === '{"hits":3}', "tool output serialized");
assert(root.startTime <= step0.startTime && step1.endTime <= root.endTime, "root span envelopes child spans");
assert(base - 5_000 < root.startTime, "timestamps are epoch ms");

// --- recordInputs / recordOutputs disabled ---------------------------------
console.log("recordInputs/recordOutputs = false:");
const cap2 = makeCapture();
const wt2 = watchtower({ apiKey: "k", fetch: cap2.fetchImpl, recordInputs: false, recordOutputs: false });
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
const wt3 = watchtower({ apiKey: "k", fetch: cap3.fetchImpl });
const i3 = wt3.integration({ agentName: "boom" }) as unknown as Hooks;
i3.onStart({ callId: "c3", operationId: "ai.generateText", provider: "openai", modelId: "gpt-4o", messages: [] });
i3.onError(new Error("model exploded"));
await wt3.flush();
const t3 = cap3.bodies[0]?.traces[0];
assert(!!t3, "errored trace was flushed");
assert(t3!.spans[0]!.status === "error", "root span marked error");
assert(t3!.spans[0]!.errorMessage === "model exploded", "error message captured");

// --- Disabled no-op (no API key) -------------------------------------------
console.log("disabled (no WATCHTOWER_API_KEY):");
const prev = process.env.WATCHTOWER_API_KEY;
delete process.env.WATCHTOWER_API_KEY;
const cap4 = makeCapture();
const wt4 = watchtower({ fetch: cap4.fetchImpl });
const i4 = wt4.integration({ agentName: "x" }) as unknown as Hooks;
i4.onStart({ callId: "c4", operationId: "ai.generateText", provider: "openai", modelId: "gpt-4o", messages: [] });
i4.onStepFinish({ callId: "c4", stepNumber: 0, model: { provider: "openai", modelId: "gpt-4o" }, usage: {}, text: "x", finishReason: "stop" });
i4.onFinish({ callId: "c4", text: "x" });
await wt4.flush();
assert(cap4.calls === 0, "no network calls when disabled");
assert(wt4.pending === 0, "nothing buffered when disabled");
if (prev !== undefined) process.env.WATCHTOWER_API_KEY = prev;

console.log("\nALL SDK CHECKS PASSED ✅");
