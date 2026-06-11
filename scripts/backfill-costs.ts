#!/usr/bin/env bun
// Reprice spans that ingested while their model id didn't resolve to a price
// (e.g. Bedrock ids before the normalizer understood them). Costs are computed
// with the exact same code path as ingest (resolveModelPrice + computeCost)
// against current OpenRouter pricing, then written back in two parts:
//
//  1. Delta rows into the rollup tables (trace_summary, workflow_run_summary,
//     metrics_by_minute). Their materialized views only fire on inserts into
//     `spans`, so a mutation alone would leave every dashboard aggregate stale.
//     Delta rows carry ONLY the new cost + priced-span counts; span/token
//     counts stay 0 (already counted at ingest), min/max/any columns re-supply
//     current values (merge-idempotent), and tDigest states are inserted empty
//     so latency quantiles aren't double-counted.
//  2. One ALTER TABLE UPDATE on `spans` setting the per-span cost breakdown.
//
// Custom per-project pricing overrides are NOT consulted — a span in the
// unpriced set by definition matched no override at ingest. Repriced rows get
// pricing_source='openrouter'.
//
// Usage (dry-run by default; pass --execute to write):
//   CLICKHOUSE_URL=http://localhost:8123 CLICKHOUSE_USER=default \
//   CLICKHOUSE_PASSWORD=... CLICKHOUSE_DATABASE=foglamp \
//   bun scripts/backfill-costs.ts [--execute]

import {
  computeCost,
  parsePricingResponse,
  resolveModelPrice,
  type CostBreakdown,
} from "@foglamp/cost";

const CH_URL = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
const CH_USER = process.env.CLICKHOUSE_USER ?? "default";
const CH_PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? "";
const CH_DATABASE = process.env.CLICKHOUSE_DATABASE ?? "foglamp";
const MODELS_URL =
  process.env.OPENROUTER_MODELS_URL ?? "https://openrouter.ai/api/v1/models";
const EXECUTE = process.argv.includes("--execute");

async function ch(query: string): Promise<string> {
  const res = await fetch(`${CH_URL}/?database=${CH_DATABASE}`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${CH_USER}:${CH_PASSWORD}`)}`,
    },
    body: query,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${text}`);
  return text;
}

const q = (s: string) => `'${s.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
const dt64 = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`
  );
};
const dec18 = (v: string | null) =>
  v == null ? "NULL" : `CAST('${v}' AS Nullable(Decimal(18, 10)))`;
const dec38 = (v: string) => `CAST('${v}' AS Decimal(38, 10))`;

type Row = {
  project_id: string;
  trace_id: string;
  span_id: string;
  span_type: string;
  provider: string;
  model_id: string;
  start_ms: string;
  end_ms: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens: number;
  image_count: number;
  web_search_count: number;
  request_count: number;
  trace_name: string;
  agent_name: string;
  workflow_name: string;
  workflow_run_id: string;
};

const nowMs = Date.now();

// ---- 1. load pricing + the unpriced span set (FINAL dedupes resends) -------

const pricingRes = await fetch(MODELS_URL, { headers: { accept: "application/json" } });
if (!pricingRes.ok) throw new Error(`pricing fetch failed: ${pricingRes.status}`);
const table = parsePricingResponse(await pricingRes.json());
console.log(`pricing table: ${table.size} model ids`);

const rows = (
  await ch(`
    SELECT project_id, trace_id, span_id, span_type, provider, model_id,
           toUnixTimestamp64Milli(start_time) AS start_ms,
           toUnixTimestamp64Milli(end_time) AS end_ms,
           input_tokens, output_tokens, reasoning_tokens, cached_input_tokens,
           cache_write_input_tokens, image_count, web_search_count, request_count,
           trace_name, agent_name, workflow_name, workflow_run_id
    FROM spans FINAL
    WHERE pricing_source = '' AND span_type IN ('llm', 'embedding')
      AND model_id != '' AND ingested_at <= toDateTime64(${nowMs / 1000}, 3)
    FORMAT JSONEachRow`)
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Row);

console.log(`unpriced model-bearing spans: ${rows.length}`);
if (rows.length === 0) process.exit(0);

// ---- 2. price each span exactly like ingest would -------------------------

type Priced = { row: Row; resolvedId: string; costs: CostBreakdown };
const priced: Priced[] = [];
const unresolved = new Map<string, number>();

for (const row of rows) {
  const resolved = resolveModelPrice(table, row.provider, row.model_id);
  if (!resolved) {
    const key = `${row.provider} ${row.model_id}`;
    unresolved.set(key, (unresolved.get(key) ?? 0) + 1);
    continue;
  }
  const costs = computeCost(
    {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.input_tokens + row.output_tokens,
      reasoningTokens: row.reasoning_tokens,
      cachedInputTokens: row.cached_input_tokens,
      cacheWriteInputTokens: row.cache_write_input_tokens,
      imageCount: row.image_count,
      webSearchCount: row.web_search_count,
      requestCount: row.request_count,
    },
    resolved.price,
  );
  priced.push({ row, resolvedId: resolved.resolvedId, costs });
}

for (const [key, n] of unresolved)
  console.log(`  still unresolved (left untouched): ${key} × ${n}`);
console.log(`repriceable spans: ${priced.length}`);
if (priced.length === 0) process.exit(0);

const grandTotal = priced.reduce((s, p) => s + Number(p.costs.totalCost ?? 0), 0);
for (const p of priced)
  console.log(
    `  ${p.row.span_id}  ${p.row.model_id} → ${p.resolvedId}  $${p.costs.totalCost}`,
  );
console.log(`total backfilled cost: $${grandTotal.toFixed(6)}`);

// ---- 3. rollup delta rows ---------------------------------------------------

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}
const sumCost = (ps: Priced[]) =>
  ps.reduce((s, p) => s + Number(p.costs.totalCost ?? 0), 0).toFixed(10);
const minStart = (ps: Priced[]) => Math.min(...ps.map((p) => Number(p.row.start_ms)));
const maxEnd = (ps: Priced[]) => Math.max(...ps.map((p) => Number(p.row.end_ms)));
const pricedLlm = (ps: Priced[]) =>
  ps.filter((p) => p.row.span_type === "llm" && p.costs.totalCost != null).length;

const statements: string[] = [];

for (const [, group] of groupBy(priced, (p) => `${p.row.project_id}\0${p.row.trace_id}`)) {
  const r = group[0]!.row;
  statements.push(
    `INSERT INTO trace_summary (project_id, trace_id, agent_name, workflow_name, trace_name, workflow_run_id, session_id, trace_start, trace_end, span_count, llm_span_count, tool_span_count, error_count, total_cost, priced_span_count, input_tokens, output_tokens, total_tokens)
VALUES (${q(r.project_id)}, ${q(r.trace_id)}, ${q(r.agent_name)}, ${q(r.workflow_name)}, ${q(r.trace_name)}, ${q(r.workflow_run_id)}, '', toDateTime64('${dt64(minStart(group))}', 3), toDateTime64('${dt64(maxEnd(group))}', 3), 0, 0, 0, 0, ${dec38(sumCost(group))}, ${pricedLlm(group)}, 0, 0, 0)`,
  );
}

const wfGroups = groupBy(
  priced.filter((p) => p.row.workflow_run_id !== ""),
  (p) => `${p.row.project_id}\0${p.row.workflow_run_id}`,
);
for (const [, group] of wfGroups) {
  const r = group[0]!.row;
  const traceIds = [...new Set(group.map((p) => p.row.trace_id))];
  statements.push(
    `INSERT INTO workflow_run_summary (project_id, workflow_run_id, workflow_name, run_start, run_end, trace_count, span_count, llm_span_count, error_count, total_cost, priced_span_count, total_tokens)
SELECT ${q(r.project_id)}, ${q(r.workflow_run_id)}, ${q(r.workflow_name)}, toDateTime64('${dt64(minStart(group))}', 3), toDateTime64('${dt64(maxEnd(group))}', 3), uniqState(tid), toUInt64(0), toUInt64(0), toUInt64(0), ${dec38(sumCost(group))}, toUInt64(${pricedLlm(group)}), toUInt64(0)
FROM (SELECT arrayJoin([${traceIds.map(q).join(", ")}]) AS tid)`,
  );
}

for (const [, group] of groupBy(
  priced,
  (p) =>
    `${p.row.project_id}\0${Math.floor(Number(p.row.start_ms) / 60_000)}\0${p.row.span_type}\0${p.row.model_id}\0${p.row.agent_name}`,
)) {
  const r = group[0]!.row;
  const bucket = dt64(Math.floor(Number(r.start_ms) / 60_000) * 60_000).slice(0, 19);
  const pricedCount = group.filter((p) => p.costs.totalCost != null).length;
  statements.push(
    `INSERT INTO metrics_by_minute (project_id, bucket, span_type, model_id, agent_name, span_count, error_count, total_cost, priced_span_count, input_tokens, output_tokens, total_tokens, duration_quantiles, ttft_quantiles)
SELECT ${q(r.project_id)}, toDateTime('${bucket}'), ${q(r.span_type)}, ${q(r.model_id)}, ${q(r.agent_name)}, toUInt64(0), toUInt64(0), ${dec38(sumCost(group))}, toUInt64(${pricedCount}), toUInt64(0), toUInt64(0), toUInt64(0), quantilesTDigestStateIf(0.5, 0.95, 0.99)(toUInt32(0), 0), quantilesTDigestStateIf(0.5, 0.95, 0.99)(toUInt32(0), 0)
FROM numbers(1)`,
  );
}

// ---- 4. the span mutation ---------------------------------------------------

const COST_COLUMNS: [string, (c: CostBreakdown) => string | null][] = [
  ["prompt_cost", (c) => c.promptCost],
  ["completion_cost", (c) => c.completionCost],
  ["request_cost", (c) => c.requestCost],
  ["image_cost", (c) => c.imageCost],
  ["web_search_cost", (c) => c.webSearchCost],
  ["internal_reasoning_cost", (c) => c.internalReasoningCost],
  ["cache_read_cost", (c) => c.cacheReadCost],
  ["cache_write_cost", (c) => c.cacheWriteCost],
  ["total_cost", (c) => c.totalCost],
];

const caseFor = (value: (p: Priced) => string, fallback: string) =>
  `CASE span_id ${priced.map((p) => `WHEN ${q(p.row.span_id)} THEN ${value(p)}`).join(" ")} ELSE ${fallback} END`;

statements.push(
  `ALTER TABLE spans UPDATE
  priced_model_id = ${caseFor((p) => q(p.resolvedId), "priced_model_id")},
${COST_COLUMNS.map(([col, get]) => `  ${col} = ${caseFor((p) => dec18(get(p.costs)), col)}`).join(",\n")},
  pricing_source = 'openrouter',
  priced_at = toDateTime64('${dt64(nowMs)}', 3)
WHERE pricing_source = '' AND span_type IN ('llm', 'embedding')
  AND ingested_at <= toDateTime64(${nowMs / 1000}, 3)
  AND span_id IN (${priced.map((p) => q(p.row.span_id)).join(", ")})`,
);

// ---- 5. run -----------------------------------------------------------------

console.log(`\n${statements.length} statements (${statements.length - 1} rollup deltas + 1 mutation)`);
if (!EXECUTE) {
  console.log("\nDRY RUN — rerun with --execute to apply. Statements:\n");
  for (const s of statements) console.log(`${s}\n`);
  process.exit(0);
}

for (const [i, s] of statements.entries()) {
  await ch(s);
  console.log(`applied ${i + 1}/${statements.length}`);
}

// Wait for the mutation to finish materializing.
for (;;) {
  const pending = Number(
    (await ch(`SELECT count() FROM system.mutations WHERE table = 'spans' AND is_done = 0`)).trim(),
  );
  if (pending === 0) break;
  console.log(`waiting on ${pending} mutation(s)…`);
  await new Promise((r) => setTimeout(r, 2000));
}

const remaining = (
  await ch(
    `SELECT count() FROM spans WHERE pricing_source = '' AND span_type IN ('llm','embedding') AND model_id != '' AND ingested_at <= toDateTime64(${nowMs / 1000}, 3)`,
  )
).trim();
console.log(`done. unpriced spans remaining in the window: ${remaining} (expected ${rows.length - priced.length})`);
