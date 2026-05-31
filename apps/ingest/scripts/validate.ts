// Integration check for the ingest write path against the local test
// ClickHouse (foglamp-ch-test, port 18123). Bypasses HTTP/auth and drives the core
// pipeline directly: a wire payload → buildSpanRows (cost-at-ingest) → the
// WriteBuffer → ClickHouse → MV rollups. Proves cost math, id denormalization,
// metadata merge, and the flush path. Run manually during Phase 5 verification.
import { createClickHouseClient, listTraces, getTraceSpans } from "@foglamp/clickhouse";
import type { IngestPayload } from "@foglamp/contracts";
import { type ModelPrice, type PricingTable } from "@foglamp/cost";

import { WriteBuffer } from "../src/buffer";
import { matchCustomPrice } from "../src/customPricing";
import { buildSpanRows } from "../src/transform";

const client = createClickHouseClient({
  url: "http://localhost:18123",
  username: "default",
  password: "foglamp",
  database: "foglamp",
});

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

// A minimal pricing table: gpt-4o priced, everything else unknown.
const gpt4o: ModelPrice = {
  prompt: "0.0000025",
  completion: "0.00001",
  request: null,
  image: null,
  webSearch: null,
  internalReasoning: null,
  cacheRead: "0.00000125",
  cacheWrite: null,
};
const table: PricingTable = new Map([["openai/gpt-4o", gpt4o]]);

const PID = "proj_ingest_validate";
const base = Date.now();

const payload: IngestPayload = {
  version: "v1",
  traces: [
    {
      traceId: "t_ingest_1",
      traceName: "support-ticket",
      agentName: "support",
      workflowName: "ticket-flow",
      workflowRunId: "run_ingest_1",
      sessionId: "sess_1",
      metadata: { env: "prod", tier: "free" },
      spans: [
        {
          spanId: "s_root",
          spanType: "agent",
          name: "generateText",
          startTime: base,
          endTime: base + 900,
          status: "ok",
        },
        {
          spanId: "s_llm",
          parentSpanId: "s_root",
          spanType: "llm",
          name: "step-1",
          startTime: base + 10,
          endTime: base + 500,
          status: "ok",
          provider: "openai",
          modelId: "gpt-4o",
          ttftMs: 120,
          chunkOffsets: [120, 260, 400],
          chunkTokens: [125, 310, 500],
          usage: {
            inputTokens: 1000,
            outputTokens: 500,
            totalTokens: 1500,
            cachedInputTokens: 200,
          },
          metadata: { tier: "pro" }, // overrides trace-level tier
          input: '{"messages":[]}',
          output: '"hello"',
        },
        {
          spanId: "s_tool",
          parentSpanId: "s_root",
          spanType: "tool",
          name: "search",
          startTime: base + 520,
          endTime: base + 560,
          status: "error",
          errorMessage: "boom",
        },
      ],
    },
  ],
};

// --- Pure transform assertions -------------------------------------------
console.log("buildSpanRows (cost-at-ingest):");
const rows = buildSpanRows({ payload, projectId: PID, orgId: "org_ingest", retentionDays: 14, table, rules: [], now: base });
assert(rows.length === 3, "three rows built");

const root = rows.find((r) => r.span_id === "s_root")!;
const llm = rows.find((r) => r.span_id === "s_llm")!;
const tool = rows.find((r) => r.span_id === "s_tool")!;

// prompt billable = 1000 - 200 cached = 800 * 0.0000025 = 0.002
// completion = 500 * 0.00001 = 0.005 ; cacheRead = 200 * 0.00000125 = 0.00025
// total = 0.00725
assert(llm.total_cost === "0.0072500000", `llm total_cost = ${llm.total_cost}`);
assert(llm.prompt_cost === "0.0020000000", `llm prompt_cost = ${llm.prompt_cost}`);
assert(llm.cache_read_cost === "0.0002500000", `llm cache_read_cost = ${llm.cache_read_cost}`);
assert(llm.priced_model_id === "openai/gpt-4o", `priced_model_id = ${llm.priced_model_id}`);
assert(llm.pricing_source === "openrouter", `pricing_source = ${llm.pricing_source}`);
assert(llm.duration_ms === 490, `llm duration_ms = ${llm.duration_ms}`);
assert(llm.ttft_ms === 120, `ttft preserved = ${llm.ttft_ms}`);
assert(
  JSON.stringify(llm.chunk_offsets) === "[120,260,400]" &&
    JSON.stringify(llm.chunk_tokens) === "[125,310,500]",
  "chunk samples pass through buildSpanRows",
);
assert(
  root.chunk_offsets.length === 0 && tool.chunk_tokens.length === 0,
  "non-llm spans get empty chunk arrays",
);
assert(llm.metadata.tier === "pro", "span metadata overrides trace metadata");
assert(llm.metadata.env === "prod", "trace metadata inherited onto span");
assert(llm.agent_name === "support", "agent_name denormalized onto span");
assert(llm.workflow_run_id === "run_ingest_1", "workflow_run_id denormalized");
assert(root.total_cost === null, "agent root span has null cost (not double-counted)");
assert(tool.total_cost === null, "tool span has null cost");
assert(tool.status === "error", "tool error status carried");

// --- Custom pricing override --------------------------------------------
console.log("matchCustomPrice:");
const custom = matchCustomPrice(
  [{ pattern: "gpt-4*", price: { completion: "0.1" } }],
  "openai",
  "gpt-4o",
);
assert(custom?.completion === "0.1", "glob pattern gpt-4* matches gpt-4o");
const noMatch = matchCustomPrice(
  [{ pattern: "claude-*", price: { completion: "0.1" } }],
  "openai",
  "gpt-4o",
);
assert(noMatch === undefined, "non-matching pattern returns undefined");

// --- Write path: buffer → ClickHouse → MV rollup -------------------------
console.log("WriteBuffer → ClickHouse:");
let flushed = 0;
const buffer = new WriteBuffer(client, {
  intervalMs: 100,
  maxRows: 1000,
  hooks: {
    onFlush: (n) => (flushed += n),
    onError: (err) => {
      throw err;
    },
  },
});
buffer.push(rows);
await buffer.stop(); // flush + drain
assert(flushed === 3, `flushed ${flushed} rows`);

await new Promise((r) => setTimeout(r, 300)); // let MV parts settle

const traces = await listTraces(client, { projectId: PID });
assert(traces.length === 1, "one trace summarized");
assert(Number(traces[0]!.total_cost) === 0.00725, `trace total_cost = ${traces[0]!.total_cost}`);
assert(Number(traces[0]!.span_count) === 3, `span_count = ${traces[0]!.span_count}`);
assert(Number(traces[0]!.error_count) === 1, `error_count = ${traces[0]!.error_count}`);
assert(Number(traces[0]!.priced_span_count) === 1, `priced_span_count = ${traces[0]!.priced_span_count}`);

const spans = await getTraceSpans(client, { projectId: PID, traceId: "t_ingest_1" });
assert(spans.length === 3, "three spans queryable from CH");
assert(spans.find((s) => s.span_id === "s_llm")!.metadata.tier === "pro", "merged metadata round-trips through CH");

await client.close();
console.log("\nALL INGEST CHECKS PASSED ✅");
