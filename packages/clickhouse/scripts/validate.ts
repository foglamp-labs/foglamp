// Standalone integration check against a local ClickHouse (the wt-ch-test
// container). Runs migrations, inserts sample spans, and reads back through
// every materialized view + the trace-detail query. Not part of the unit suite
// (needs a live server); invoked manually during Phase 4 verification.
import { createClickHouseClient } from "../src/client";
import { runMigrations, applySpansRetention } from "../src/migrate";
import { insertSpans, type SpanRow } from "../src/spans";
import {
  getTraceSpans,
  listTraces,
  listWorkflowRuns,
  queryMetricsTimeseries,
  queryModelBreakdown,
} from "../src/queries";

const client = createClickHouseClient({
  url: "http://localhost:18123",
  username: "default",
  password: "watchtower",
  database: "watchtower",
});

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const base = Date.now();
const blank = {
  parent_span_id: "",
  error_message: "",
  provider: "",
  model_id: "",
  priced_model_id: "",
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
  reasoning_tokens: 0,
  cached_input_tokens: 0,
  cache_write_input_tokens: 0,
  image_count: 0,
  web_search_count: 0,
  request_count: 0,
  ttft_ms: null,
  prompt_cost: null,
  completion_cost: null,
  request_cost: null,
  image_cost: null,
  web_search_cost: null,
  internal_reasoning_cost: null,
  cache_read_cost: null,
  cache_write_cost: null,
  total_cost: null,
  pricing_source: "",
  priced_at: null,
  workflow_name: "",
  workflow_run_id: "",
  session_id: "",
  metadata: {} as Record<string, string>,
  input: "",
  output: "",
} satisfies Partial<SpanRow>;

const PID = "proj_test";
const rows: SpanRow[] = [
  {
    ...blank,
    project_id: PID,
    trace_id: "trace_1",
    span_id: "s_root",
    span_type: "agent",
    name: "generateText",
    start_time: base,
    end_time: base + 800,
    duration_ms: 800,
    status: "ok",
    provider: "openai",
    model_id: "gpt-4o",
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    agent_name: "support",
    workflow_name: "ticket-flow",
    workflow_run_id: "run_1",
    session_id: "sess_1",
    metadata: { env: "prod" },
  },
  {
    ...blank,
    project_id: PID,
    trace_id: "trace_1",
    span_id: "s_llm",
    parent_span_id: "s_root",
    span_type: "llm",
    name: "step-1",
    start_time: base + 10,
    end_time: base + 410,
    duration_ms: 400,
    status: "ok",
    provider: "openai",
    model_id: "gpt-4o",
    priced_model_id: "openai/gpt-4o",
    input_tokens: 1000,
    output_tokens: 500,
    total_tokens: 1500,
    ttft_ms: 120,
    prompt_cost: "0.0025000000",
    completion_cost: "0.0050000000",
    total_cost: "0.0075000000",
    pricing_source: "openrouter",
    priced_at: base + 410,
    agent_name: "support",
    workflow_name: "ticket-flow",
    workflow_run_id: "run_1",
    session_id: "sess_1",
    metadata: { env: "prod" },
    input: '{"messages":[]}',
    output: '"hi"',
  },
  {
    ...blank,
    project_id: PID,
    trace_id: "trace_1",
    span_id: "s_tool",
    parent_span_id: "s_root",
    span_type: "tool",
    name: "search",
    start_time: base + 420,
    end_time: base + 470,
    duration_ms: 50,
    status: "error",
    error_message: "boom",
    agent_name: "support",
    workflow_name: "ticket-flow",
    workflow_run_id: "run_1",
    session_id: "sess_1",
  },
];

console.log("running migrations...");
const applied = await runMigrations(client);
console.log("  applied:", applied);
assert(applied.length === 4, "4 migrations applied on first run");
const second = await runMigrations(client);
assert(second.length === 0, "re-running migrations is a no-op (idempotent)");

await applySpansRetention(client, 30);
console.log("  ✓ retention TTL applied");

console.log("inserting spans...");
await insertSpans(client, rows);
// MVs populate synchronously with the insert; give parts a moment to be queryable.
await new Promise((r) => setTimeout(r, 300));

console.log("trace list (trace_summary MV):");
const traces = await listTraces(client, { projectId: PID });
assert(traces.length === 1, "one trace summarized");
const t = traces[0]!;
assert(t.agent_name === "support", `agent_name = ${t.agent_name}`);
assert(t.workflow_run_id === "run_1", `workflow_run_id = ${t.workflow_run_id}`);
assert(Number(t.span_count) === 3, `span_count = ${t.span_count}`);
assert(Number(t.llm_span_count) === 1, `llm_span_count = ${t.llm_span_count}`);
assert(Number(t.error_count) === 1, `error_count = ${t.error_count}`);
assert(Number(t.total_cost) === 0.0075, `total_cost = ${t.total_cost}`);
assert(Number(t.priced_span_count) === 1, `priced_span_count = ${t.priced_span_count}`);
assert(Number(t.total_tokens) === 1500, `total_tokens = ${t.total_tokens}`);

console.log("trace detail (spans FINAL):");
const spans = await getTraceSpans(client, { projectId: PID, traceId: "trace_1" });
assert(spans.length === 3, "three spans returned, ordered");
assert(spans[0]!.span_id === "s_root", "root span first by start_time");
assert(spans[1]!.ttft_ms === 120, "ttft preserved on llm span");
assert(spans[1]!.metadata.env === "prod", "metadata map round-trips");

console.log("workflow runs (workflow_run_summary MV):");
const runs = await listWorkflowRuns(client, { projectId: PID });
assert(runs.length === 1, "one workflow run summarized");
assert(runs[0]!.workflow_run_id === "run_1", "run id");
assert(Number(runs[0]!.trace_count) === 1, `uniq trace_count = ${runs[0]!.trace_count}`);
assert(Number(runs[0]!.total_cost) === 0.0075, `run total_cost = ${runs[0]!.total_cost}`);

console.log("metrics timeseries (metrics_by_minute MV, llm slice):");
const from = new Date(base - 120_000).toISOString().slice(0, 19).replace("T", " ");
const to = new Date(base + 120_000).toISOString().slice(0, 19).replace("T", " ");
const series = await queryMetricsTimeseries(client, {
  projectId: PID,
  from,
  to,
  spanType: "llm",
});
assert(series.length >= 1, "at least one minute bucket");
const totalCost = series.reduce((s, r) => s + Number(r.total_cost), 0);
assert(Math.abs(totalCost - 0.0075) < 1e-9, `llm cost over window = ${totalCost}`);
const p = series.find((r) => r.ttft_quantiles?.length === 3);
assert(!!p && p.ttft_quantiles[0] === 120, `ttft p50 = ${p?.ttft_quantiles?.[0]}`);
assert(!!p && p.duration_quantiles[0] === 400, `duration p50 = ${p?.duration_quantiles?.[0]}`);

console.log("model breakdown:");
const models = await queryModelBreakdown(client, { projectId: PID, from, to });
assert(models.length === 1 && models[0]!.model_id === "gpt-4o", "one model: gpt-4o");
assert(Number(models[0]!.total_cost) === 0.0075, `model cost = ${models[0]!.total_cost}`);

await client.close();
console.log("\nALL CLICKHOUSE CHECKS PASSED ✅");
