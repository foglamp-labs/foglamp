// Standalone integration check against a local ClickHouse (the foglamp-ch-test
// container). Runs migrations, inserts sample spans, and reads back through
// every materialized view + the trace-detail query. Not part of the unit suite
// (needs a live server); invoked manually during Phase 4 verification.
import { createClickHouseClient } from "../src/client";
import { runMigrations, applySpansRetention } from "../src/migrate";
import { MIGRATIONS } from "../src/migrations";
import { insertSpans, updateOrgRetention, type SpanRow } from "../src/spans";
import { insertScores, type ScoreRow } from "../src/scores";
import {
  getSessionTurns,
  getTraceScores,
  getTraceSpans,
  listSessions,
  listTraces,
  listWorkflowRuns,
  queryMetricsTimeseries,
  queryModelBreakdown,
  queryOrgSpanUsage,
  queryScoreAlertWindow,
  queryScoreTimeseries,
} from "../src/queries";

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

const base = Date.now();
const ORG = "org_test";
const blank = {
  org_id: ORG,
  retention_days: 30,
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
  chunk_offsets: [],
  chunk_tokens: [],
  workflow_name: "",
  workflow_run_id: "",
  session_id: "",
  metadata: {} as Record<string, string>,
  input: "",
  output: "",
  tool_catalog: "",
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
    trace_name: "support",
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
    chunk_offsets: [120, 260, 400],
    chunk_tokens: [125, 310, 500],
    prompt_cost: "0.0025000000",
    completion_cost: "0.0050000000",
    total_cost: "0.0075000000",
    pricing_source: "openrouter",
    priced_at: base + 410,
    trace_name: "support",
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
    trace_name: "support",
    agent_name: "support",
    workflow_name: "ticket-flow",
    workflow_run_id: "run_1",
    session_id: "sess_1",
  },
];

console.log("running migrations...");
const applied = await runMigrations(client);
console.log("  applied:", applied);
assert(
  applied.length === MIGRATIONS.length,
  `all ${MIGRATIONS.length} migrations applied on first run (got ${applied.length})`,
);
const second = await runMigrations(client);
assert(second.length === 0, "re-running migrations is a no-op (idempotent)");

await applySpansRetention(client);
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
assert(
  JSON.stringify(spans[1]!.chunk_offsets) === "[120,260,400]" &&
    JSON.stringify(spans[1]!.chunk_tokens) === "[125,310,500]",
  "chunk samples round-trip on llm span",
);
assert(
  spans[0]!.chunk_offsets.length === 0 && spans[2]!.chunk_tokens.length === 0,
  "non-streaming spans have empty chunk arrays",
);

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

console.log("scores (scores table + score_metrics_by_minute MV):");
const EVAL = "eval_relevance";
const scoreRows: ScoreRow[] = [
  {
    project_id: PID,
    eval_id: EVAL,
    score_id: `${EVAL}:trace_1`,
    target_type: "trace",
    target_id: "trace_1",
    trace_id: "trace_1",
    scorer: "llm",
    label: "",
    score: 4,
    passed: 1,
    reason: "relevant and complete",
    model_id: "gemini-3.1-flash-lite",
    cost: "0.0000200000",
    scored_at: base + 500,
  },
  {
    project_id: PID,
    eval_id: EVAL,
    score_id: `${EVAL}:s_llm`,
    target_type: "span",
    target_id: "s_llm",
    trace_id: "trace_1",
    scorer: "llm",
    label: "",
    score: 2,
    passed: 0,
    reason: "partially off-topic",
    model_id: "gemini-3.1-flash-lite",
    cost: "0.0000150000",
    scored_at: base + 510,
  },
];
await insertScores(client, scoreRows);
await new Promise((r) => setTimeout(r, 300));

const traceScores = await getTraceScores(client, { projectId: PID, traceId: "trace_1" });
assert(traceScores.length === 2, `two scores for trace_1, got ${traceScores.length}`);
assert(
  traceScores.some((s) => s.target_type === "trace" && Number(s.score) === 4) &&
    traceScores.some((s) => s.target_type === "span" && s.passed === 0),
  "trace- and span-level scores round-trip",
);

const scoreSeries = await queryScoreTimeseries(client, { projectId: PID, evalId: EVAL, from, to });
assert(scoreSeries.length >= 1, "at least one score bucket");
const sCount = scoreSeries.reduce((n, r) => n + Number(r.score_count), 0);
const sSum = scoreSeries.reduce((n, r) => n + Number(r.score_sum), 0);
assert(sCount === 2 && Math.abs(sSum - 6) < 1e-9, `count=2 sum=6 (got ${sCount}/${sSum})`);

const win = await queryScoreAlertWindow(client, { projectId: PID, evalId: EVAL, from, to });
assert(Number(win.score_count) === 2, `window score_count = ${win.score_count}`);
assert(
  Math.abs(Number(win.score_sum) / Number(win.score_count) - 3) < 1e-9,
  `avg score = ${Number(win.score_sum) / Number(win.score_count)}`,
);
assert(
  Number(win.pass_count) === 1 && Number(win.fail_count) === 1,
  `pass=1 fail=1 (got ${win.pass_count}/${win.fail_count})`,
);
assert(
  Number(win.verdict_count) === 2,
  `verdict_count=2 (got ${win.verdict_count})`,
);

console.log("org usage rollup (usage_by_org_day MV):");
const dayFrom = new Date(base - 86_400_000).toISOString().slice(0, 10);
const dayTo = new Date(base + 86_400_000).toISOString().slice(0, 10);
const orgUsage = await queryOrgSpanUsage(client, { orgId: ORG, from: dayFrom, to: dayTo });
assert(orgUsage === 3, `org span usage = ${orgUsage} (expected 3)`);

console.log("retention extend on upgrade (updateOrgRetention):");
await updateOrgRetention(client, ORG, 100); // rows are 30 → greatest(30,100)=100
let retentionDays = 30;
for (let i = 0; i < 10; i++) {
  // ALTER … UPDATE is an async mutation; poll until it lands on the tiny table.
  await new Promise((r) => setTimeout(r, 400));
  const rs = await client.query({
    query: `SELECT min(retention_days) AS m FROM spans WHERE org_id = '${ORG}'`,
    format: "JSONEachRow",
  });
  retentionDays = Number(((await rs.json()) as { m: number }[])[0]?.m ?? 0);
  if (retentionDays === 100) break;
}
assert(retentionDays === 100, `retention extended to 100 (got ${retentionDays})`);

console.log("sessions (grouped from trace_summary by session_id):");
// A second trace in the same session (sess_1) → a 2-turn conversation. Its root
// agent span carries a messages-array input + final output for the timeline.
const sessionRows: SpanRow[] = [
  {
    ...blank,
    project_id: PID,
    trace_id: "trace_2",
    span_id: "s2_root",
    span_type: "agent",
    name: "generateText",
    start_time: base + 2000,
    end_time: base + 2600,
    duration_ms: 600,
    status: "ok",
    provider: "openai",
    model_id: "gpt-4o",
    trace_name: "support",
    agent_name: "support",
    session_id: "sess_1",
    input: '[{"role":"user","content":"and for SSO?"}]',
    output: '"For SSO, open Settings → Org."',
  },
  {
    ...blank,
    project_id: PID,
    trace_id: "trace_2",
    span_id: "s2_llm",
    parent_span_id: "s2_root",
    span_type: "llm",
    name: "step-1",
    start_time: base + 2010,
    end_time: base + 2400,
    duration_ms: 390,
    status: "ok",
    provider: "openai",
    model_id: "gpt-4o",
    priced_model_id: "openai/gpt-4o",
    input_tokens: 200,
    output_tokens: 100,
    total_tokens: 300,
    total_cost: "0.0030000000",
    pricing_source: "openrouter",
    priced_at: base + 2400,
    trace_name: "support",
    agent_name: "support",
    session_id: "sess_1",
  },
];
await insertSpans(client, sessionRows);
await new Promise((r) => setTimeout(r, 300));

const sessions = await listSessions(client, { projectId: PID });
assert(sessions.length === 1, `one session, got ${sessions.length}`);
const sess = sessions[0]!;
assert(sess.session_id === "sess_1", `session_id = ${sess.session_id}`);
assert(Number(sess.turn_count) === 2, `turn_count = ${sess.turn_count}`);
assert(Number(sess.total_cost) === 0.0105, `session total_cost = ${sess.total_cost} (0.0075 + 0.0030)`);
assert(Number(sess.total_tokens) === 1800, `session total_tokens = ${sess.total_tokens}`);
assert(Number(sess.error_count) === 1, `session error_count = ${sess.error_count}`);

const turns = await getSessionTurns(client, { projectId: PID, sessionId: "sess_1" });
assert(turns.length === 2, `two turns (root span per trace), got ${turns.length}`);
assert(
  turns[0]!.trace_id === "trace_1" && turns[1]!.trace_id === "trace_2",
  "turns ordered chronologically",
);
assert(
  turns[1]!.input === '[{"role":"user","content":"and for SSO?"}]',
  "turn input (messages) round-trips",
);
assert(turns[1]!.output === '"For SSO, open Settings → Org."', "turn output round-trips");

const sessTraces = await listTraces(client, { projectId: PID, sessionId: "sess_1" });
assert(sessTraces.length === 2, `two traces in session, got ${sessTraces.length}`);

await client.close();
console.log("\nALL CLICKHOUSE CHECKS PASSED ✅");
