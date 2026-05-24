import type { ClickHouseClient } from "@clickhouse/client";

// Read helpers for the dashboard API (Phase 9 wires these into tRPC services).
//
// AggregatingMergeTree summaries are read with query-time GROUP BY + the same
// aggregate functions (SimpleAggregateFunction partials re-combine; Aggregate
// functions use -Merge). FINAL is used *only* on the bounded trace-detail query
// over the spans table (ReplacingMergeTree dedup), never on unbounded scans.

async function rows<T>(
  client: ClickHouseClient,
  query: string,
  query_params: Record<string, unknown>,
): Promise<T[]> {
  const rs = await client.query({ query, query_params, format: "JSONEachRow" });
  return rs.json<T>();
}

export type TraceListRow = {
  trace_id: string;
  agent_name: string;
  workflow_name: string;
  workflow_run_id: string;
  session_id: string;
  trace_start: string;
  trace_end: string;
  duration_ms: number;
  span_count: string;
  llm_span_count: string;
  error_count: string;
  total_cost: string;
  priced_span_count: string;
  total_tokens: string;
};

export function listTraces(
  client: ClickHouseClient,
  params: { projectId: string; limit?: number; offset?: number },
): Promise<TraceListRow[]> {
  return rows<TraceListRow>(
    client,
    `SELECT
       trace_id,
       any(agent_name) AS agent_name,
       any(workflow_name) AS workflow_name,
       any(workflow_run_id) AS workflow_run_id,
       any(session_id) AS session_id,
       min(trace_summary.trace_start) AS trace_start,
       max(trace_summary.trace_end) AS trace_end,
       dateDiff('millisecond', min(trace_summary.trace_start), max(trace_summary.trace_end)) AS duration_ms,
       sum(span_count) AS span_count,
       sum(llm_span_count) AS llm_span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens
     FROM trace_summary
     WHERE project_id = {projectId:String}
     GROUP BY trace_id
     ORDER BY trace_start DESC
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
    {
      projectId: params.projectId,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  );
}

export type SpanDetailRow = {
  span_id: string;
  parent_span_id: string;
  span_type: string;
  name: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: string;
  error_message: string;
  provider: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  ttft_ms: number | null;
  total_cost: string | null;
  pricing_source: string;
  metadata: Record<string, string>;
  input: string;
  output: string;
};

/** All spans for one trace, deduped (FINAL) and ordered for the waterfall. */
export function getTraceSpans(
  client: ClickHouseClient,
  params: { projectId: string; traceId: string },
): Promise<SpanDetailRow[]> {
  return rows<SpanDetailRow>(
    client,
    `SELECT
       span_id, parent_span_id, span_type, name,
       start_time, end_time, duration_ms, status, error_message,
       provider, model_id,
       input_tokens, output_tokens, total_tokens, ttft_ms,
       total_cost, pricing_source, metadata, input, output
     FROM spans FINAL
     WHERE project_id = {projectId:String} AND trace_id = {traceId:String}
     ORDER BY start_time ASC, span_id ASC`,
    { projectId: params.projectId, traceId: params.traceId },
  );
}

export type WorkflowRunRow = {
  workflow_run_id: string;
  workflow_name: string;
  run_start: string;
  run_end: string;
  duration_ms: number;
  trace_count: string;
  span_count: string;
  error_count: string;
  total_cost: string;
  priced_span_count: string;
  total_tokens: string;
};

export function listWorkflowRuns(
  client: ClickHouseClient,
  params: { projectId: string; limit?: number; offset?: number },
): Promise<WorkflowRunRow[]> {
  return rows<WorkflowRunRow>(
    client,
    `SELECT
       workflow_run_id,
       any(workflow_name) AS workflow_name,
       min(workflow_run_summary.run_start) AS run_start,
       max(workflow_run_summary.run_end) AS run_end,
       dateDiff('millisecond', min(workflow_run_summary.run_start), max(workflow_run_summary.run_end)) AS duration_ms,
       uniqMerge(trace_count) AS trace_count,
       sum(span_count) AS span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens
     FROM workflow_run_summary
     WHERE project_id = {projectId:String}
     GROUP BY workflow_run_id
     ORDER BY run_start DESC
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
    {
      projectId: params.projectId,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  );
}

export type MetricsBucketRow = {
  bucket: string;
  span_count: string;
  error_count: string;
  total_cost: string;
  priced_span_count: string;
  total_tokens: string;
  /** [p50, p95, p99] in milliseconds. */
  duration_quantiles: number[];
  ttft_quantiles: number[];
};

/** Per-minute time series, optionally sliced by span_type / model / agent. */
export function queryMetricsTimeseries(
  client: ClickHouseClient,
  params: {
    projectId: string;
    from: string; // 'YYYY-MM-DD HH:MM:SS'
    to: string;
    spanType?: string;
    modelId?: string;
    agentName?: string;
  },
): Promise<MetricsBucketRow[]> {
  const filters: string[] = [
    "project_id = {projectId:String}",
    "bucket >= {from:DateTime}",
    "bucket < {to:DateTime}",
  ];
  if (params.spanType) filters.push("span_type = {spanType:String}");
  if (params.modelId) filters.push("model_id = {modelId:String}");
  if (params.agentName) filters.push("agent_name = {agentName:String}");

  return rows<MetricsBucketRow>(
    client,
    `SELECT
       bucket,
       sum(span_count) AS span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(duration_quantiles) AS duration_quantiles,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(ttft_quantiles) AS ttft_quantiles
     FROM metrics_by_minute
     WHERE ${filters.join(" AND ")}
     GROUP BY bucket
     ORDER BY bucket ASC`,
    {
      projectId: params.projectId,
      from: params.from,
      to: params.to,
      spanType: params.spanType,
      modelId: params.modelId,
      agentName: params.agentName,
    },
  );
}

export type ModelBreakdownRow = {
  model_id: string;
  span_count: string;
  total_cost: string;
  priced_span_count: string;
  total_tokens: string;
};

/** Per-model rollup over a window (for the Overview model breakdown). */
export function queryModelBreakdown(
  client: ClickHouseClient,
  params: { projectId: string; from: string; to: string },
): Promise<ModelBreakdownRow[]> {
  return rows<ModelBreakdownRow>(
    client,
    `SELECT
       model_id,
       sum(span_count) AS span_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens
     FROM metrics_by_minute
     WHERE project_id = {projectId:String}
       AND span_type = 'llm'
       AND bucket >= {from:DateTime} AND bucket < {to:DateTime}
     GROUP BY model_id
     ORDER BY total_cost DESC`,
    { projectId: params.projectId, from: params.from, to: params.to },
  );
}

export type AgentBreakdownRow = {
  agent_name: string;
  span_count: string;
  llm_span_count: string;
  error_count: string;
  total_cost: string;
  priced_span_count: string;
  total_tokens: string;
  /** [p50, p95, p99] llm latency in milliseconds. */
  duration_quantiles: number[];
};

/** Per-agent rollup over a window (for the Agents list + per-agent stats). */
export function queryAgentBreakdown(
  client: ClickHouseClient,
  params: { projectId: string; from: string; to: string },
): Promise<AgentBreakdownRow[]> {
  return rows<AgentBreakdownRow>(
    client,
    `SELECT
       agent_name,
       sum(span_count) AS span_count,
       sumIf(span_count, span_type = 'llm') AS llm_span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens,
       quantilesTDigestMergeIf(0.5, 0.95, 0.99)(duration_quantiles, span_type = 'llm') AS duration_quantiles
     FROM metrics_by_minute
     WHERE project_id = {projectId:String}
       AND bucket >= {from:DateTime} AND bucket < {to:DateTime}
       AND agent_name != ''
     GROUP BY agent_name
     ORDER BY total_cost DESC`,
    { projectId: params.projectId, from: params.from, to: params.to },
  );
}

export type AlertWindowRow = {
  span_count: string;
  error_count: string;
  total_cost: string;
  total_tokens: string;
  /** [p50, p95, p99] llm latency in milliseconds. */
  duration_quantiles: number[];
  ttft_quantiles: number[];
};

/**
 * Single-row rollup over an alert's evaluation window, optionally narrowed by
 * model / agent (the dimensions `metrics_by_minute` carries). The evaluator
 * derives the metric value (cost, latency p*, ttft, error rate, …) from this.
 */
export async function queryAlertWindow(
  client: ClickHouseClient,
  params: {
    projectId: string;
    from: string;
    to: string;
    modelId?: string;
    agentName?: string;
  },
): Promise<AlertWindowRow> {
  const filters: string[] = [
    "project_id = {projectId:String}",
    "bucket >= {from:DateTime}",
    "bucket < {to:DateTime}",
  ];
  if (params.modelId) filters.push("model_id = {modelId:String}");
  if (params.agentName) filters.push("agent_name = {agentName:String}");

  const result = await rows<AlertWindowRow>(
    client,
    `SELECT
       sum(span_count) AS span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(total_tokens) AS total_tokens,
       quantilesTDigestMergeIf(0.5, 0.95, 0.99)(duration_quantiles, span_type = 'llm') AS duration_quantiles,
       quantilesTDigestMergeIf(0.5, 0.95, 0.99)(ttft_quantiles, span_type = 'llm') AS ttft_quantiles
     FROM metrics_by_minute
     WHERE ${filters.join(" AND ")}`,
    {
      projectId: params.projectId,
      from: params.from,
      to: params.to,
      modelId: params.modelId,
      agentName: params.agentName,
    },
  );
  return (
    result[0] ?? {
      span_count: "0",
      error_count: "0",
      total_cost: "0",
      total_tokens: "0",
      duration_quantiles: [0, 0, 0],
      ttft_quantiles: [0, 0, 0],
    }
  );
}

/** Traces belonging to a single workflow run (the run timeline). */
export function listTracesByWorkflowRun(
  client: ClickHouseClient,
  params: { projectId: string; workflowRunId: string; limit?: number; offset?: number },
): Promise<TraceListRow[]> {
  return rows<TraceListRow>(
    client,
    `SELECT
       trace_id,
       any(agent_name) AS agent_name,
       any(workflow_name) AS workflow_name,
       any(workflow_run_id) AS workflow_run_id,
       any(session_id) AS session_id,
       min(trace_summary.trace_start) AS trace_start,
       max(trace_summary.trace_end) AS trace_end,
       dateDiff('millisecond', min(trace_summary.trace_start), max(trace_summary.trace_end)) AS duration_ms,
       sum(span_count) AS span_count,
       sum(llm_span_count) AS llm_span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens
     FROM trace_summary
     WHERE project_id = {projectId:String} AND workflow_run_id = {workflowRunId:String}
     GROUP BY trace_id
     ORDER BY trace_start ASC
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
    {
      projectId: params.projectId,
      workflowRunId: params.workflowRunId,
      limit: params.limit ?? 200,
      offset: params.offset ?? 0,
    },
  );
}

export type ProjectSummaryRow = {
  span_count: string;
  llm_span_count: string;
  error_count: string;
  total_cost: string;
  priced_span_count: string;
  total_tokens: string;
  /** [p50, p95, p99] llm latency in milliseconds. */
  duration_quantiles: number[];
  ttft_quantiles: number[];
};

/** Single-row Overview rollup over a window (totals, latency, cost coverage). */
export async function queryProjectSummary(
  client: ClickHouseClient,
  params: { projectId: string; from: string; to: string },
): Promise<ProjectSummaryRow> {
  const result = await rows<ProjectSummaryRow>(
    client,
    `SELECT
       sum(span_count) AS span_count,
       sumIf(span_count, span_type = 'llm') AS llm_span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens,
       quantilesTDigestMergeIf(0.5, 0.95, 0.99)(duration_quantiles, span_type = 'llm') AS duration_quantiles,
       quantilesTDigestMergeIf(0.5, 0.95, 0.99)(ttft_quantiles, span_type = 'llm') AS ttft_quantiles
     FROM metrics_by_minute
     WHERE project_id = {projectId:String}
       AND bucket >= {from:DateTime} AND bucket < {to:DateTime}`,
    { projectId: params.projectId, from: params.from, to: params.to },
  );
  return (
    result[0] ?? {
      span_count: "0",
      llm_span_count: "0",
      error_count: "0",
      total_cost: "0",
      priced_span_count: "0",
      total_tokens: "0",
      duration_quantiles: [0, 0, 0],
      ttft_quantiles: [0, 0, 0],
    }
  );
}
