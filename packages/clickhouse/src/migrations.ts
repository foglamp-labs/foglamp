// Ordered ClickHouse DDL migrations. Kept as inline statements (rather than
// loose .sql files) so they bundle into the tsdown-built ingest deployable and
// remain the single source of truth. The runner (migrate.ts) applies these in
// order, tracking applied ids in a `schema_migrations` table; applying twice is
// a no-op (every statement is IF NOT EXISTS).
//
// Only ORDER BY and PARTITION BY are irreversible in ClickHouse. Everything
// else (columns, skip indexes, MVs, TTL) is an online ALTER — so new migrations
// append here; existing ones are never edited once shipped.
//
// Changing what a materialized view computes is the one sharp edge: an MV only
// processes rows inserted while it exists, so the old DROP VIEW + CREATE dance
// loses every span ingested in between (a permanent hole in the aggregate on a
// live system). Use modifyMaterializedViewQuery() instead — it swaps the SELECT
// atomically via ALTER TABLE … MODIFY QUERY, with no such window. The first
// migration, 0005_trace_name, predates this rule and is grandfathered; a unit
// test (migrate.test.ts) keeps every later migration honest.

export type Migration = {
  id: string;
  statements: string[];
};

/**
 * Build the gap-free statement that changes a materialized view's SELECT.
 *
 * The naive way to change an MV is DROP VIEW + CREATE MATERIALIZED VIEW, but an
 * MV only aggregates rows inserted *while it exists*: any span that lands
 * between the drop and the recreate never reaches the target table. On a live
 * ingest path that's an unrecoverable gap in the rollup.
 *
 * `ALTER TABLE <mv> MODIFY QUERY` swaps the query in place — the MV keeps firing
 * on every insert and simply starts using the new SELECT. This is the
 * "contract" half of an expand-contract MV change; the "expand" half is adding
 * any new columns to the source + target tables first (online, idempotent
 * `ADD COLUMN IF NOT EXISTS`) so the new SELECT's output already matches the
 * target's layout. Re-running is harmless: setting the same query twice is a
 * no-op, which keeps migrations idempotent.
 */
export function modifyMaterializedViewQuery(view: string, select: string): string {
  return `ALTER TABLE ${view} MODIFY QUERY ${select.trim()}`;
}

// The sole migration permitted to DROP a materialized view — it shipped before
// the MODIFY QUERY convention. migrate.test.ts asserts nothing newer does.
export const LEGACY_MV_DROP_MIGRATION = "0005_trace_name";

const DECIMAL = "Decimal(18, 10)";
const SUMMED_DECIMAL = "Decimal(38, 10)"; // sum() widens precision

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_spans",
    statements: [
      `CREATE TABLE IF NOT EXISTS spans
(
  project_id String,
  trace_id String,
  span_id String,
  parent_span_id String DEFAULT '',
  span_type LowCardinality(String),
  name String DEFAULT '',
  start_time DateTime64(3),
  end_time DateTime64(3),
  duration_ms UInt32 DEFAULT 0,
  status LowCardinality(String) DEFAULT 'ok',
  error_message String DEFAULT '',
  provider LowCardinality(String) DEFAULT '',
  model_id LowCardinality(String) DEFAULT '',
  priced_model_id String DEFAULT '',
  input_tokens UInt32 DEFAULT 0,
  output_tokens UInt32 DEFAULT 0,
  total_tokens UInt32 DEFAULT 0,
  reasoning_tokens UInt32 DEFAULT 0,
  cached_input_tokens UInt32 DEFAULT 0,
  cache_write_input_tokens UInt32 DEFAULT 0,
  image_count UInt16 DEFAULT 0,
  web_search_count UInt16 DEFAULT 0,
  request_count UInt16 DEFAULT 0,
  ttft_ms Nullable(UInt32),
  prompt_cost Nullable(${DECIMAL}),
  completion_cost Nullable(${DECIMAL}),
  request_cost Nullable(${DECIMAL}),
  image_cost Nullable(${DECIMAL}),
  web_search_cost Nullable(${DECIMAL}),
  internal_reasoning_cost Nullable(${DECIMAL}),
  cache_read_cost Nullable(${DECIMAL}),
  cache_write_cost Nullable(${DECIMAL}),
  total_cost Nullable(${DECIMAL}),
  pricing_source LowCardinality(String) DEFAULT '',
  priced_at Nullable(DateTime64(3)),
  agent_name LowCardinality(String) DEFAULT '',
  workflow_name LowCardinality(String) DEFAULT '',
  workflow_run_id String DEFAULT '',
  session_id String DEFAULT '',
  metadata Map(String, String),
  input String DEFAULT '' CODEC(ZSTD(3)),
  output String DEFAULT '' CODEC(ZSTD(3)),
  ingested_at DateTime64(3) DEFAULT now64(3),
  INDEX idx_workflow_run_id workflow_run_id TYPE bloom_filter GRANULARITY 1,
  INDEX idx_session_id session_id TYPE bloom_filter GRANULARITY 1,
  INDEX idx_agent_name agent_name TYPE bloom_filter GRANULARITY 1,
  INDEX idx_meta_keys mapKeys(metadata) TYPE bloom_filter GRANULARITY 1,
  INDEX idx_meta_values mapValues(metadata) TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(start_time)
ORDER BY (project_id, trace_id, start_time, span_id)`,
    ],
  },
  {
    id: "0002_trace_summary",
    statements: [
      `CREATE TABLE IF NOT EXISTS trace_summary
(
  project_id String,
  trace_id String,
  agent_name SimpleAggregateFunction(any, String),
  workflow_name SimpleAggregateFunction(any, String),
  workflow_run_id SimpleAggregateFunction(any, String),
  session_id SimpleAggregateFunction(any, String),
  trace_start SimpleAggregateFunction(min, DateTime64(3)),
  trace_end SimpleAggregateFunction(max, DateTime64(3)),
  span_count SimpleAggregateFunction(sum, UInt64),
  llm_span_count SimpleAggregateFunction(sum, UInt64),
  tool_span_count SimpleAggregateFunction(sum, UInt64),
  error_count SimpleAggregateFunction(sum, UInt64),
  total_cost SimpleAggregateFunction(sum, ${SUMMED_DECIMAL}),
  priced_span_count SimpleAggregateFunction(sum, UInt64),
  input_tokens SimpleAggregateFunction(sum, UInt64),
  output_tokens SimpleAggregateFunction(sum, UInt64),
  total_tokens SimpleAggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, trace_id)`,
      `CREATE MATERIALIZED VIEW IF NOT EXISTS trace_summary_mv TO trace_summary AS
SELECT
  project_id,
  trace_id,
  CAST(any(agent_name) AS String) AS agent_name,
  CAST(any(workflow_name) AS String) AS workflow_name,
  any(workflow_run_id) AS workflow_run_id,
  any(session_id) AS session_id,
  min(start_time) AS trace_start,
  max(end_time) AS trace_end,
  toUInt64(count()) AS span_count,
  toUInt64(countIf(span_type = 'llm')) AS llm_span_count,
  toUInt64(countIf(span_type = 'tool')) AS tool_span_count,
  toUInt64(countIf(status = 'error')) AS error_count,
  sum(ifNull(spans.total_cost, CAST(0 AS ${SUMMED_DECIMAL}))) AS total_cost,
  toUInt64(countIf(span_type = 'llm' AND spans.total_cost IS NOT NULL)) AS priced_span_count,
  toUInt64(sum(input_tokens)) AS input_tokens,
  toUInt64(sum(output_tokens)) AS output_tokens,
  toUInt64(sum(total_tokens)) AS total_tokens
FROM spans
GROUP BY project_id, trace_id`,
    ],
  },
  {
    id: "0003_workflow_run_summary",
    statements: [
      `CREATE TABLE IF NOT EXISTS workflow_run_summary
(
  project_id String,
  workflow_run_id String,
  workflow_name SimpleAggregateFunction(any, String),
  run_start SimpleAggregateFunction(min, DateTime64(3)),
  run_end SimpleAggregateFunction(max, DateTime64(3)),
  trace_count AggregateFunction(uniq, String),
  span_count SimpleAggregateFunction(sum, UInt64),
  llm_span_count SimpleAggregateFunction(sum, UInt64),
  error_count SimpleAggregateFunction(sum, UInt64),
  total_cost SimpleAggregateFunction(sum, ${SUMMED_DECIMAL}),
  priced_span_count SimpleAggregateFunction(sum, UInt64),
  total_tokens SimpleAggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, workflow_run_id)`,
      `CREATE MATERIALIZED VIEW IF NOT EXISTS workflow_run_summary_mv TO workflow_run_summary AS
SELECT
  project_id,
  workflow_run_id,
  CAST(any(workflow_name) AS String) AS workflow_name,
  min(start_time) AS run_start,
  max(end_time) AS run_end,
  uniqState(trace_id) AS trace_count,
  toUInt64(count()) AS span_count,
  toUInt64(countIf(span_type = 'llm')) AS llm_span_count,
  toUInt64(countIf(status = 'error')) AS error_count,
  sum(ifNull(spans.total_cost, CAST(0 AS ${SUMMED_DECIMAL}))) AS total_cost,
  toUInt64(countIf(span_type = 'llm' AND spans.total_cost IS NOT NULL)) AS priced_span_count,
  toUInt64(sum(total_tokens)) AS total_tokens
FROM spans
WHERE workflow_run_id != ''
GROUP BY project_id, workflow_run_id`,
    ],
  },
  {
    id: "0004_metrics_by_minute",
    statements: [
      `CREATE TABLE IF NOT EXISTS metrics_by_minute
(
  project_id String,
  bucket DateTime,
  span_type LowCardinality(String),
  model_id LowCardinality(String),
  agent_name LowCardinality(String),
  span_count SimpleAggregateFunction(sum, UInt64),
  error_count SimpleAggregateFunction(sum, UInt64),
  total_cost SimpleAggregateFunction(sum, ${SUMMED_DECIMAL}),
  priced_span_count SimpleAggregateFunction(sum, UInt64),
  input_tokens SimpleAggregateFunction(sum, UInt64),
  output_tokens SimpleAggregateFunction(sum, UInt64),
  total_tokens SimpleAggregateFunction(sum, UInt64),
  duration_quantiles AggregateFunction(quantilesTDigest(0.5, 0.95, 0.99), UInt32),
  ttft_quantiles AggregateFunction(quantilesTDigest(0.5, 0.95, 0.99), UInt32)
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, bucket, span_type, model_id, agent_name)`,
      `CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_by_minute_mv TO metrics_by_minute AS
SELECT
  project_id,
  toStartOfMinute(start_time) AS bucket,
  span_type,
  model_id,
  agent_name,
  toUInt64(count()) AS span_count,
  toUInt64(countIf(status = 'error')) AS error_count,
  sum(ifNull(spans.total_cost, CAST(0 AS ${SUMMED_DECIMAL}))) AS total_cost,
  toUInt64(countIf(spans.total_cost IS NOT NULL)) AS priced_span_count,
  toUInt64(sum(input_tokens)) AS input_tokens,
  toUInt64(sum(output_tokens)) AS output_tokens,
  toUInt64(sum(total_tokens)) AS total_tokens,
  quantilesTDigestState(0.5, 0.95, 0.99)(duration_ms) AS duration_quantiles,
  quantilesTDigestStateIf(0.5, 0.95, 0.99)(toUInt32(ifNull(ttft_ms, 0)), isNotNull(ttft_ms)) AS ttft_quantiles
FROM spans
GROUP BY project_id, bucket, span_type, model_id, agent_name`,
    ],
  },
  {
    // Names a trace independently of agent/workflow classification. Effective
    // display label downstream is `trace_name || agent_name`. The MV's SELECT
    // can't be ALTERed, so it's dropped and recreated with the new column.
    id: "0005_trace_name",
    statements: [
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS trace_name LowCardinality(String) DEFAULT ''`,
      `ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_trace_name trace_name TYPE bloom_filter GRANULARITY 1`,
      `ALTER TABLE trace_summary ADD COLUMN IF NOT EXISTS trace_name SimpleAggregateFunction(any, String)`,
      `DROP VIEW IF EXISTS trace_summary_mv`,
      `CREATE MATERIALIZED VIEW IF NOT EXISTS trace_summary_mv TO trace_summary AS
SELECT
  project_id,
  trace_id,
  CAST(any(agent_name) AS String) AS agent_name,
  CAST(any(workflow_name) AS String) AS workflow_name,
  CAST(any(trace_name) AS String) AS trace_name,
  any(workflow_run_id) AS workflow_run_id,
  any(session_id) AS session_id,
  min(start_time) AS trace_start,
  max(end_time) AS trace_end,
  toUInt64(count()) AS span_count,
  toUInt64(countIf(span_type = 'llm')) AS llm_span_count,
  toUInt64(countIf(span_type = 'tool')) AS tool_span_count,
  toUInt64(countIf(status = 'error')) AS error_count,
  sum(ifNull(spans.total_cost, CAST(0 AS ${SUMMED_DECIMAL}))) AS total_cost,
  toUInt64(countIf(span_type = 'llm' AND spans.total_cost IS NOT NULL)) AS priced_span_count,
  toUInt64(sum(input_tokens)) AS input_tokens,
  toUInt64(sum(output_tokens)) AS output_tokens,
  toUInt64(sum(total_tokens)) AS total_tokens
FROM spans
GROUP BY project_id, trace_id`,
    ],
  },
  {
    // Intra-stream sampling for streaming llm spans. Two parallel arrays:
    // chunk_offsets[i] is ms from step start, chunk_tokens[i] is cumulative
    // output tokens at that moment. Empty for non-streaming / pre-feature rows,
    // which the UI reads as "no streaming data". Aggregate MVs don't need them.
    id: "0006_chunk_samples",
    statements: [
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS chunk_offsets Array(UInt32) DEFAULT []`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS chunk_tokens Array(UInt32) DEFAULT []`,
    ],
  },
  {
    // Eval scores: one row per (eval, target) where target is a trace or span.
    // The scoring worker writes here; score_id is deterministic (eval:target)
    // so ReplacingMergeTree dedups re-runs. A per-minute rollup mirrors
    // metrics_by_minute and feeds eval-score alerts.
    id: "0007_scores",
    statements: [
      `CREATE TABLE IF NOT EXISTS scores
(
  project_id String,
  eval_id String,
  score_id String,
  target_type LowCardinality(String),
  target_id String,
  trace_id String DEFAULT '',
  scorer LowCardinality(String),
  label LowCardinality(String) DEFAULT '',
  score Nullable(Float64),
  passed Nullable(UInt8),
  reason String DEFAULT '' CODEC(ZSTD(3)),
  model_id LowCardinality(String) DEFAULT '',
  cost Nullable(${DECIMAL}),
  scored_at DateTime64(3),
  INDEX idx_scores_eval_id eval_id TYPE bloom_filter GRANULARITY 1,
  INDEX idx_scores_target_id target_id TYPE bloom_filter GRANULARITY 1,
  INDEX idx_scores_trace_id trace_id TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplacingMergeTree(scored_at)
PARTITION BY toYYYYMM(scored_at)
ORDER BY (project_id, eval_id, target_id, score_id)`,
      `CREATE TABLE IF NOT EXISTS score_metrics_by_minute
(
  project_id String,
  eval_id String,
  label LowCardinality(String),
  bucket DateTime,
  score_count SimpleAggregateFunction(sum, UInt64),
  pass_count SimpleAggregateFunction(sum, UInt64),
  fail_count SimpleAggregateFunction(sum, UInt64),
  score_sum SimpleAggregateFunction(sum, Float64),
  cost SimpleAggregateFunction(sum, ${SUMMED_DECIMAL}),
  score_quantiles AggregateFunction(quantilesTDigest(0.5, 0.95, 0.99), Float32)
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, eval_id, label, bucket)`,
      `CREATE MATERIALIZED VIEW IF NOT EXISTS score_metrics_by_minute_mv TO score_metrics_by_minute AS
SELECT
  project_id,
  eval_id,
  label,
  toStartOfMinute(scored_at) AS bucket,
  toUInt64(count()) AS score_count,
  toUInt64(countIf(passed = 1)) AS pass_count,
  toUInt64(countIf(passed = 0)) AS fail_count,
  sum(ifNull(score, 0)) AS score_sum,
  sum(ifNull(scores.cost, CAST(0 AS ${SUMMED_DECIMAL}))) AS cost,
  quantilesTDigestStateIf(0.5, 0.95, 0.99)(toFloat32(ifNull(score, 0)), isNotNull(score)) AS score_quantiles
FROM scores
GROUP BY project_id, eval_id, label, bucket`,
    ],
  },
  {
    // Per-org billing plumbing: org_id (denormalized at ingest from the key's
    // project→org) drives a daily usage rollup for the monthly span quota, and
    // retention_days makes data TTL plan-driven per row (replacing the global
    // TTL). Default 30 grandfathers pre-plan rows so they aren't nuked early.
    id: "0008_org_usage",
    statements: [
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS org_id String DEFAULT ''`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS retention_days UInt16 DEFAULT 30`,
      `ALTER TABLE spans MODIFY TTL toDateTime(start_time) + toIntervalDay(retention_days)`,
      `CREATE TABLE IF NOT EXISTS usage_by_org_day
(
  org_id String,
  day Date,
  span_count SimpleAggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
ORDER BY (org_id, day)`,
      `CREATE MATERIALIZED VIEW IF NOT EXISTS usage_by_org_day_mv TO usage_by_org_day AS
SELECT
  org_id,
  toDate(start_time) AS day,
  toUInt64(count()) AS span_count
FROM spans
WHERE org_id != ''
GROUP BY org_id, day`,
    ],
  },
  {
    // The tool catalog offered to the model (name → {description, params}),
    // captured by the SDK and stamped on llm + agent spans. ZSTD-compressed —
    // the same catalog repeats across a trace's llm spans, so it compresses to
    // near-nothing. Empty on tool/embedding/other spans.
    id: "0009_tool_catalog",
    statements: [
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS tool_catalog String DEFAULT '' CODEC(ZSTD(3))`,
    ],
  },
  {
    // Reasoning-stream sampling for streaming llm spans on reasoning models.
    // Mirrors chunk_offsets/chunk_tokens but for the reasoning text stream;
    // reasoning_duration_ms is total wall-clock ms inside reasoning blocks.
    // Nullable (not 0) because absence means "not captured", same as ttft_ms.
    id: "0010_reasoning_chunks",
    statements: [
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS reasoning_offsets Array(UInt32) DEFAULT []`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS reasoning_chunk_tokens Array(UInt32) DEFAULT []`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS reasoning_duration_ms Nullable(UInt32)`,
    ],
  },
  {
    // Secondary provider signals captured by the SDK:
    //  • model_call_ms       — pure provider-call wall-clock for an llm step
    //    (the span still covers model + tools; tool time = duration - model_call).
    //    Nullable (not 0): absent means "not captured" (v4-v6 wrap, non-llm).
    //  • system_fingerprint  — OpenAI-style model build id (drift detection).
    //  • safety_metadata     — JSON blob of provider safety ratings (no logprobs).
    //  • sources             — JSON array of RAG/grounding citations.
    //  • rate_limit_*        — normalized cross-provider rate-limit headroom;
    //    *_reset_ms is ms until the window resets. Nullable: absent ≠ zero quota.
    // JSON blobs are ZSTD-compressed (repetitive, often empty).
    id: "0011_signal_capture",
    statements: [
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS model_call_ms Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS system_fingerprint String DEFAULT ''`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS safety_metadata String DEFAULT '' CODEC(ZSTD(3))`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS sources String DEFAULT '' CODEC(ZSTD(3))`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS rate_limit_requests_limit Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS rate_limit_requests_remaining Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS rate_limit_requests_reset_ms Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS rate_limit_tokens_limit Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS rate_limit_tokens_remaining Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS rate_limit_tokens_reset_ms Nullable(UInt32)`,
    ],
  },
  {
    // Distinct LLM model ids per trace, so the traces list can show which model(s)
    // a trace used without scanning the raw spans. `groupUniqArray` over llm spans
    // with a non-empty model_id, kept as an AggregateFunction state and merged at
    // read time. Expand-contract: add the column to the target table first, then
    // MODIFY QUERY the MV in place so the live aggregate never gaps.
    id: "0012_trace_models",
    statements: [
      `ALTER TABLE trace_summary ADD COLUMN IF NOT EXISTS models AggregateFunction(groupUniqArray, String)`,
      modifyMaterializedViewQuery(
        "trace_summary_mv",
        `SELECT
  project_id,
  trace_id,
  CAST(any(agent_name) AS String) AS agent_name,
  CAST(any(workflow_name) AS String) AS workflow_name,
  CAST(any(trace_name) AS String) AS trace_name,
  any(workflow_run_id) AS workflow_run_id,
  any(session_id) AS session_id,
  min(start_time) AS trace_start,
  max(end_time) AS trace_end,
  toUInt64(count()) AS span_count,
  toUInt64(countIf(span_type = 'llm')) AS llm_span_count,
  toUInt64(countIf(span_type = 'tool')) AS tool_span_count,
  toUInt64(countIf(status = 'error')) AS error_count,
  sum(ifNull(spans.total_cost, CAST(0 AS ${SUMMED_DECIMAL}))) AS total_cost,
  toUInt64(countIf(span_type = 'llm' AND spans.total_cost IS NOT NULL)) AS priced_span_count,
  toUInt64(sum(input_tokens)) AS input_tokens,
  toUInt64(sum(output_tokens)) AS output_tokens,
  toUInt64(sum(total_tokens)) AS total_tokens,
  groupUniqArrayStateIf(CAST(model_id AS String), span_type = 'llm' AND model_id != '') AS models
FROM spans
GROUP BY project_id, trace_id`,
      ),
    ],
  },
  {
    // Official AI SDK step `performance` statistics (v7 beta/canary), used in
    // preference to our derived numbers where they overlap:
    //  • response_time_ms     — provider response wall-clock; also feeds
    //    model_call_ms (preferred over the language-model-call derivation).
    //  • effective_output_tps / effective_total_tps — full-response token rates.
    //  • output_tps / input_tps — streaming-only post-first-chunk / prefill rates.
    //  • chunk_jitter_*        — inter-output-chunk gap stats (ms); avg kept
    //    fractional (Float32), the rest rounded to UInt32 at ingest.
    // All Nullable: absent (not zero) on v4-v6 wrap, older v7, and non-llm spans.
    //
    // Rollups extend metrics_by_minute with TDigest quantiles for the headline
    // scalars, gated by isNotNull so pre-feature/null rows are excluded (same
    // pattern as ttft_quantiles). Caveat: chunk_jitter has no per-gap data here —
    // the SDK only gives pre-aggregated per-step percentiles — so we roll up the
    // per-step *median*, making chunk_jitter_median_quantiles a distribution of
    // per-step medians, not a true distribution of all inter-chunk gaps.
    // Expand-contract: ADD COLUMN to both tables first, then MODIFY QUERY the MV
    // in place so the live aggregate never gaps.
    id: "0013_step_performance",
    statements: [
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS response_time_ms Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS effective_output_tps Nullable(Float32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS effective_total_tps Nullable(Float32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS output_tps Nullable(Float32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS input_tps Nullable(Float32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS chunk_jitter_min Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS chunk_jitter_p10 Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS chunk_jitter_median Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS chunk_jitter_avg Nullable(Float32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS chunk_jitter_p90 Nullable(UInt32)`,
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS chunk_jitter_max Nullable(UInt32)`,
      `ALTER TABLE metrics_by_minute ADD COLUMN IF NOT EXISTS response_time_quantiles AggregateFunction(quantilesTDigest(0.5, 0.95, 0.99), UInt32)`,
      `ALTER TABLE metrics_by_minute ADD COLUMN IF NOT EXISTS effective_output_tps_quantiles AggregateFunction(quantilesTDigest(0.5, 0.95, 0.99), Float32)`,
      `ALTER TABLE metrics_by_minute ADD COLUMN IF NOT EXISTS effective_total_tps_quantiles AggregateFunction(quantilesTDigest(0.5, 0.95, 0.99), Float32)`,
      `ALTER TABLE metrics_by_minute ADD COLUMN IF NOT EXISTS chunk_jitter_median_quantiles AggregateFunction(quantilesTDigest(0.5, 0.95, 0.99), Float32)`,
      modifyMaterializedViewQuery(
        "metrics_by_minute_mv",
        `SELECT
  project_id,
  toStartOfMinute(start_time) AS bucket,
  span_type,
  model_id,
  agent_name,
  toUInt64(count()) AS span_count,
  toUInt64(countIf(status = 'error')) AS error_count,
  sum(ifNull(spans.total_cost, CAST(0 AS ${SUMMED_DECIMAL}))) AS total_cost,
  toUInt64(countIf(spans.total_cost IS NOT NULL)) AS priced_span_count,
  toUInt64(sum(input_tokens)) AS input_tokens,
  toUInt64(sum(output_tokens)) AS output_tokens,
  toUInt64(sum(total_tokens)) AS total_tokens,
  quantilesTDigestState(0.5, 0.95, 0.99)(duration_ms) AS duration_quantiles,
  quantilesTDigestStateIf(0.5, 0.95, 0.99)(toUInt32(ifNull(ttft_ms, 0)), isNotNull(ttft_ms)) AS ttft_quantiles,
  quantilesTDigestStateIf(0.5, 0.95, 0.99)(toUInt32(ifNull(response_time_ms, 0)), isNotNull(response_time_ms)) AS response_time_quantiles,
  quantilesTDigestStateIf(0.5, 0.95, 0.99)(toFloat32(ifNull(effective_output_tps, 0)), isNotNull(effective_output_tps)) AS effective_output_tps_quantiles,
  quantilesTDigestStateIf(0.5, 0.95, 0.99)(toFloat32(ifNull(effective_total_tps, 0)), isNotNull(effective_total_tps)) AS effective_total_tps_quantiles,
  quantilesTDigestStateIf(0.5, 0.95, 0.99)(toFloat32(ifNull(chunk_jitter_median, 0)), isNotNull(chunk_jitter_median)) AS chunk_jitter_median_quantiles
FROM spans
GROUP BY project_id, bucket, span_type, model_id, agent_name`,
      ),
    ],
  },
];
