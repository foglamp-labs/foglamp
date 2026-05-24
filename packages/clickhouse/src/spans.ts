import type { ClickHouseClient } from "@clickhouse/client";

// A ClickHouse-shaped span row (snake_case keys match the `spans` columns for
// JSONEachRow inserts). ingest builds these from the wire contract + cost
// breakdown; datetime fields are epoch milliseconds and converted on insert.
export type SpanRow = {
  project_id: string;
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
  agent_name: string;
  workflow_name: string;
  workflow_run_id: string;
  session_id: string;
  metadata: Record<string, string>;
  input: string;
  output: string;
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
