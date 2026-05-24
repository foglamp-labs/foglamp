// Ordered ClickHouse DDL migrations. Kept as inline statements (rather than
// loose .sql files) so they bundle into the tsdown-built ingest deployable and
// remain the single source of truth. The runner (migrate.ts) applies these in
// order, tracking applied ids in a `schema_migrations` table; applying twice is
// a no-op (every statement is IF NOT EXISTS).
//
// Only ORDER BY and PARTITION BY are irreversible in ClickHouse. Everything
// else (columns, skip indexes, MVs, TTL) is an online ALTER — so new migrations
// append here; existing ones are never edited once shipped.

export type Migration = {
  id: string;
  statements: string[];
};

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
];
