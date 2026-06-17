import type { ClickHouseClient } from "@clickhouse/client";

// A ClickHouse-shaped span row (snake_case keys match the `spans` columns for
// JSONEachRow inserts). ingest builds these from the wire contract + cost
// breakdown; datetime fields are epoch milliseconds and converted on insert.
export type SpanRow = {
  project_id: string;
  org_id: string; // denormalized at ingest (key → project → org); drives usage
  retention_days: number; // per-row TTL window, from the org's plan
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  span_type: string;
  name: string;
  start_time: number; // epoch ms
  end_time: number; // epoch ms
  duration_ms: number;
  status: string;
  error_message: string;
  provider: string;
  model_id: string;
  priced_model_id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  reasoning_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens: number;
  image_count: number;
  web_search_count: number;
  request_count: number;
  ttft_ms: number | null;
  chunk_offsets: number[]; // ms from step start, parallel to chunk_tokens
  chunk_tokens: number[]; // cumulative output tokens at each offset
  reasoning_offsets: number[]; // ms from step start, parallel to reasoning_chunk_tokens
  reasoning_chunk_tokens: number[]; // cumulative reasoning tokens at each offset
  reasoning_duration_ms: number | null; // wall-clock ms inside reasoning blocks
  prompt_cost: string | null;
  completion_cost: string | null;
  request_cost: string | null;
  image_cost: string | null;
  web_search_cost: string | null;
  internal_reasoning_cost: string | null;
  cache_read_cost: string | null;
  cache_write_cost: string | null;
  total_cost: string | null;
  pricing_source: string;
  priced_at: number | null; // epoch ms
  trace_name: string;
  agent_name: string;
  workflow_name: string;
  workflow_run_id: string;
  session_id: string;
  metadata: Record<string, string>;
  input: string;
  output: string;
  tool_catalog: string; // JSON catalog of tools offered to the model (llm/agent spans)
  model_call_ms: number | null; // pure provider-call ms (llm step; null = not captured)
  system_fingerprint: string; // OpenAI-style model build id (drift detection)
  safety_metadata: string; // JSON blob of provider safety ratings
  sources: string; // JSON array of RAG/grounding citations
  rate_limit_requests_limit: number | null;
  rate_limit_requests_remaining: number | null;
  rate_limit_requests_reset_ms: number | null;
  rate_limit_tokens_limit: number | null;
  rate_limit_tokens_remaining: number | null;
  rate_limit_tokens_reset_ms: number | null;
  // Official AI SDK step `performance` statistics (v7 beta/canary; null otherwise).
  response_time_ms: number | null; // provider response wall-clock (also feeds model_call_ms)
  effective_output_tps: number | null; // outputTokens / requestSeconds
  effective_total_tps: number | null; // (inputTokens + outputTokens) / requestSeconds
  output_tps: number | null; // post-first-chunk output rate (streaming)
  input_tps: number | null; // prefill rate before first chunk (streaming)
  // Inter-output-chunk gap stats (ms); avg kept fractional, rest rounded.
  chunk_jitter_min: number | null;
  chunk_jitter_p10: number | null;
  chunk_jitter_median: number | null;
  chunk_jitter_avg: number | null;
  chunk_jitter_p90: number | null;
  chunk_jitter_max: number | null;
};

/** Format epoch milliseconds as a ClickHouse DateTime64(3) literal (UTC). */
export function toClickHouseDateTime64(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`
  );
}

function toInsertRow(row: SpanRow): Record<string, unknown> {
  return {
    ...row,
    start_time: toClickHouseDateTime64(row.start_time),
    end_time: toClickHouseDateTime64(row.end_time),
    priced_at: row.priced_at == null ? null : toClickHouseDateTime64(row.priced_at),
  };
}

/**
 * Extend retention for an org's still-alive spans to at least `retentionDays`
 * (used on plan upgrade). `greatest(...)` means it only ever lengthens the TTL,
 * never shortens — so a later downgrade leaves existing data untouched (new
 * spans simply get the lower value at ingest). Async background mutation; rows
 * already past their old TTL may already be gone.
 */
export async function updateOrgRetention(
  client: ClickHouseClient,
  orgId: string,
  retentionDays: number,
): Promise<void> {
  await client.command({
    query: `ALTER TABLE spans UPDATE retention_days = greatest(retention_days, {days:UInt16}) WHERE org_id = {orgId:String}`,
    query_params: { days: retentionDays, orgId },
  });
}

/** Bulk-insert spans. The write buffer in ingest calls this on each flush. */
export async function insertSpans(
  client: ClickHouseClient,
  rows: SpanRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.insert({
    table: "spans",
    values: rows.map(toInsertRow),
    format: "JSONEachRow",
    clickhouse_settings: { date_time_input_format: "best_effort" },
  });
}
