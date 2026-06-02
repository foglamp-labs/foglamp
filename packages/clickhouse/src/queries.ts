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
	trace_name: string;
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

export type SortDir = "asc" | "desc";
export type TraceSortField = "when" | "cost" | "duration" | "tokens" | "spans";

// Whitelist of sortable trace columns → SQL expression. Sort input is validated
// against these keys so the ORDER BY (which can't be parameterized) is never
// attacker-controlled.
const TRACE_SORT_COLUMN: Record<TraceSortField, string> = {
	when: "trace_start",
	cost: "total_cost",
	duration: "duration_ms",
	tokens: "total_tokens",
	spans: "span_count",
};

export function listTraces(
	client: ClickHouseClient,
	params: {
		projectId: string;
		agentName?: string;
		sessionId?: string;
		from?: string;
		to?: string;
		/** Keep only traces with at least one errored span. */
		errorsOnly?: boolean;
		/** Case-insensitive substring match on the trace name. */
		traceName?: string;
		sort?: { field: TraceSortField; dir: SortDir };
		limit?: number;
		offset?: number;
	},
): Promise<TraceListRow[]> {
	// agent_name and trace_start are `any()`/`min()` rollups per trace (not grouping
	// keys), so filter them in a HAVING over the aggregate rather than WHERE.
	const conditions: string[] = [];
	if (params.agentName !== undefined)
		conditions.push("agent_name = {agentName:String}");
	if (params.sessionId !== undefined)
		conditions.push("session_id = {sessionId:String}");
	if (params.from !== undefined)
		conditions.push("trace_start >= {from:DateTime64(3)}");
	if (params.to !== undefined)
		conditions.push("trace_start < {to:DateTime64(3)}");
	if (params.errorsOnly) conditions.push("error_count > 0");
	if (params.traceName !== undefined)
		conditions.push("positionCaseInsensitive(trace_name, {traceName:String}) > 0");
	const having = conditions.length ? `HAVING ${conditions.join(" AND ")}` : "";
	const sortCol = params.sort
		? TRACE_SORT_COLUMN[params.sort.field]
		: "trace_start";
	const sortDir = params.sort?.dir === "asc" ? "ASC" : "DESC";
	return rows<TraceListRow>(
		client,
		`SELECT
       trace_id,
       any(trace_name) AS trace_name,
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
     ${having}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
		{
			projectId: params.projectId,
			agentName: params.agentName,
			sessionId: params.sessionId,
			from: params.from,
			to: params.to,
			traceName: params.traceName,
			limit: params.limit ?? 50,
			offset: params.offset ?? 0,
		},
	);
}

export type SessionListRow = {
	session_id: string;
	agent_name: string;
	turn_count: string;
	span_count: string;
	llm_span_count: string;
	error_count: string;
	total_cost: string;
	priced_span_count: string;
	total_tokens: string;
	first_seen: string;
	last_seen: string;
};

/**
 * Sessions grouped from `trace_summary` by `session_id`. session_id is a stable
 * per-trace value (`SimpleAggregateFunction(any, …)`), so grouping on it buckets
 * every trace (and all its parts) of a conversation; `sum()`/`uniqExact()` then
 * aggregate correctly. Empty session_ids (untagged traces) are dropped.
 */
export type SessionSortField = "last" | "cost" | "tokens" | "turns";

const SESSION_SORT_COLUMN: Record<SessionSortField, string> = {
	last: "last_seen",
	cost: "total_cost",
	tokens: "total_tokens",
	turns: "turn_count",
};

export function listSessions(
	client: ClickHouseClient,
	params: {
		projectId: string;
		from?: string;
		to?: string;
		/** Keep only sessions with at least one errored span. */
		errorsOnly?: boolean;
		/** Exact-match filter on the session's agent. */
		agentName?: string;
		/** Case-insensitive substring match on the session id. */
		sessionId?: string;
		sort?: { field: SessionSortField; dir: SortDir };
		limit?: number;
		offset?: number;
	},
): Promise<SessionListRow[]> {
	const having: string[] = ["session_id != ''"];
	if (params.from !== undefined)
		having.push("last_seen >= {from:DateTime64(3)}");
	if (params.to !== undefined) having.push("first_seen < {to:DateTime64(3)}");
	if (params.errorsOnly) having.push("error_count > 0");
	if (params.agentName !== undefined)
		having.push("agent_name = {agentName:String}");
	if (params.sessionId !== undefined)
		having.push(
			"positionCaseInsensitive(session_id, {sessionSearch:String}) > 0",
		);
	const sortCol = params.sort
		? SESSION_SORT_COLUMN[params.sort.field]
		: "last_seen";
	const sortDir = params.sort?.dir === "asc" ? "ASC" : "DESC";
	return rows<SessionListRow>(
		client,
		`SELECT
       session_id,
       any(agent_name) AS agent_name,
       uniqExact(trace_id) AS turn_count,
       sum(span_count) AS span_count,
       sum(llm_span_count) AS llm_span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens,
       min(trace_summary.trace_start) AS first_seen,
       max(trace_summary.trace_end) AS last_seen
     FROM trace_summary
     WHERE project_id = {projectId:String}
     GROUP BY session_id
     HAVING ${having.join(" AND ")}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			agentName: params.agentName,
			sessionSearch: params.sessionId,
			limit: params.limit ?? 50,
			offset: params.offset ?? 0,
		},
	);
}

export type SessionCostQuantilesRow = { q: number[] };

/**
 * Quintile thresholds (20/40/60/80th percentiles) of per-session total cost
 * across the filtered set, over priced sessions only. Drives the cost heatmap:
 * the UI buckets each session's cost against these so each shade holds ~1/5 of
 * sessions regardless of how skewed the cost distribution is. Mirrors the
 * filtering of `listSessions`.
 */
export function sessionCostQuantiles(
	client: ClickHouseClient,
	params: {
		projectId: string;
		from?: string;
		to?: string;
		errorsOnly?: boolean;
		agentName?: string;
		sessionId?: string;
	},
): Promise<SessionCostQuantilesRow[]> {
	const having: string[] = ["session_id != ''", "total_cost > 0"];
	if (params.from !== undefined)
		having.push("last_seen >= {from:DateTime64(3)}");
	if (params.to !== undefined) having.push("first_seen < {to:DateTime64(3)}");
	if (params.errorsOnly) having.push("error_count > 0");
	if (params.agentName !== undefined)
		having.push("agent_name = {agentName:String}");
	if (params.sessionId !== undefined)
		having.push(
			"positionCaseInsensitive(session_id, {sessionSearch:String}) > 0",
		);
	return rows<SessionCostQuantilesRow>(
		client,
		`SELECT quantiles(0.2, 0.4, 0.6, 0.8)(total_cost) AS q
     FROM (
       SELECT
         session_id,
         any(agent_name) AS agent_name,
         sum(error_count) AS error_count,
         sum(total_cost) AS total_cost,
         min(trace_summary.trace_start) AS first_seen,
         max(trace_summary.trace_end) AS last_seen
       FROM trace_summary
       WHERE project_id = {projectId:String}
       GROUP BY session_id
       HAVING ${having.join(" AND ")}
     )`,
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			agentName: params.agentName,
			sessionSearch: params.sessionId,
		},
	);
}

export type SessionTurnRow = {
	trace_id: string;
	name: string;
	start_time: string;
	end_time: string;
	status: string;
	input: string;
	output: string;
};

/**
 * One row per turn in a session: the root `agent` span of each trace, in
 * chronological order. Carries the turn's input (prompt/messages) and output
 * (final text) for the conversation timeline.
 */
export function getSessionTurns(
	client: ClickHouseClient,
	params: { projectId: string; sessionId: string },
): Promise<SessionTurnRow[]> {
	return rows<SessionTurnRow>(
		client,
		`SELECT
       trace_id, name, start_time, end_time, status, input, output
     FROM spans FINAL
     WHERE project_id = {projectId:String}
       AND session_id = {sessionId:String}
       AND span_type = 'agent'
     ORDER BY start_time ASC, span_id ASC`,
		{ projectId: params.projectId, sessionId: params.sessionId },
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
	chunk_offsets: number[];
	chunk_tokens: number[];
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
       chunk_offsets, chunk_tokens,
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
	params: {
		projectId: string;
		workflowName?: string;
		limit?: number;
		offset?: number;
	},
): Promise<WorkflowRunRow[]> {
	// workflow_name is an `any()` rollup per run (not a grouping key), so filter
	// it via HAVING over the aggregate. An empty string selects the "Ungrouped"
	// bucket (runs the SDK emitted without a workflow_name).
	const having =
		params.workflowName !== undefined
			? "HAVING workflow_name = {workflowName:String}"
			: "";
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
     ${having}
     ORDER BY run_start DESC
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
		{
			projectId: params.projectId,
			workflowName: params.workflowName,
			limit: params.limit ?? 50,
			offset: params.offset ?? 0,
		},
	);
}

export type WorkflowRow = {
	workflow_name: string;
	run_count: string;
	trace_count: string;
	span_count: string;
	error_count: string;
	total_cost: string;
	priced_span_count: string;
	total_tokens: string;
	first_run: string;
	last_run: string;
};

/**
 * Workflows grouped by name (the Workflows grid). `workflow_name = ''` is the
 * "Ungrouped" bucket for runs the SDK emitted without a workflow name; the
 * service layer labels it. Ordered by most-recent activity.
 */
export function listWorkflows(
	client: ClickHouseClient,
	params: {
		projectId: string;
		from?: string;
		to?: string;
		limit?: number;
		offset?: number;
	},
): Promise<WorkflowRow[]> {
	// Keep workflows whose activity overlaps the window (first/last run are
	// min/max aggregates, so filter in HAVING).
	const conditions: string[] = [];
	if (params.from !== undefined)
		conditions.push("last_run >= {from:DateTime64(3)}");
	if (params.to !== undefined)
		conditions.push("first_run < {to:DateTime64(3)}");
	const having = conditions.length ? `HAVING ${conditions.join(" AND ")}` : "";
	return rows<WorkflowRow>(
		client,
		`SELECT
       workflow_name,
       uniqExact(workflow_run_id) AS run_count,
       uniqMerge(trace_count) AS trace_count,
       sum(span_count) AS span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens,
       min(workflow_run_summary.run_start) AS first_run,
       max(workflow_run_summary.run_end) AS last_run
     FROM workflow_run_summary
     WHERE project_id = {projectId:String}
     GROUP BY workflow_name
     ${having}
     ORDER BY last_run DESC
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			limit: params.limit ?? 100,
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
	input_tokens: string;
	output_tokens: string;
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
       sum(input_tokens) AS input_tokens,
       sum(output_tokens) AS output_tokens,
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
	input_tokens: string;
	output_tokens: string;
	/** [p50, p95, p99] llm latency in milliseconds. */
	duration_quantiles: number[];
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
       sum(total_tokens) AS total_tokens,
       sum(input_tokens) AS input_tokens,
       sum(output_tokens) AS output_tokens,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(duration_quantiles) AS duration_quantiles
     FROM metrics_by_minute
     WHERE project_id = {projectId:String}
       AND span_type = 'llm'
       AND bucket >= {from:DateTime} AND bucket < {to:DateTime}
     GROUP BY model_id
     ORDER BY total_cost DESC`,
		{ projectId: params.projectId, from: params.from, to: params.to },
	);
}

export type ModelTimeseriesRow = {
	bucket: string;
	model_id: string;
	total_cost: string;
	total_tokens: string;
	span_count: string;
};

/** Per-minute cost/tokens per model (llm spans), for a stacked cost-over-time chart. */
export function queryMetricsTimeseriesByModel(
	client: ClickHouseClient,
	params: { projectId: string; from: string; to: string },
): Promise<ModelTimeseriesRow[]> {
	return rows<ModelTimeseriesRow>(
		client,
		`SELECT
       bucket,
       model_id,
       sum(total_cost) AS total_cost,
       sum(total_tokens) AS total_tokens,
       sum(span_count) AS span_count
     FROM metrics_by_minute
     WHERE project_id = {projectId:String}
       AND span_type = 'llm'
       AND bucket >= {from:DateTime} AND bucket < {to:DateTime}
     GROUP BY bucket, model_id
     ORDER BY bucket ASC`,
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
       -- Qualify the column so it binds to the column, not the
       -- \`sum(span_count) AS span_count\` alias above (which would nest an
       -- aggregate inside sumIf → ILLEGAL_AGGREGATION). Qualifying is more
       -- surgical than \`prefer_column_name_to_alias\`, which would also break
       -- the \`ORDER BY total_cost\` alias reference below.
       sumIf(metrics_by_minute.span_count, span_type = 'llm') AS llm_span_count,
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
	params: {
		projectId: string;
		workflowRunId: string;
		limit?: number;
		offset?: number;
	},
): Promise<TraceListRow[]> {
	return rows<TraceListRow>(
		client,
		`SELECT
       trace_id,
       any(trace_name) AS trace_name,
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
     -- Qualify workflow_run_id so the filter binds to the column, not the
     -- \`any(workflow_run_id) AS workflow_run_id\` alias above (an aggregate,
     -- illegal in WHERE).
     WHERE project_id = {projectId:String} AND trace_summary.workflow_run_id = {workflowRunId:String}
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
	input_tokens: string;
	output_tokens: string;
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
       -- Qualify the column so it binds to the column, not the
       -- \`sum(span_count) AS span_count\` alias above (which would nest an
       -- aggregate inside sumIf → ILLEGAL_AGGREGATION).
       sumIf(metrics_by_minute.span_count, span_type = 'llm') AS llm_span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens,
       sum(input_tokens) AS input_tokens,
       sum(output_tokens) AS output_tokens,
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
			input_tokens: "0",
			output_tokens: "0",
			duration_quantiles: [0, 0, 0],
			ttft_quantiles: [0, 0, 0],
		}
	);
}

// --- Eval scores -----------------------------------------------------------

export type ScoreDetailRow = {
	score_id: string;
	eval_id: string;
	target_type: string;
	target_id: string;
	trace_id: string;
	scorer: string;
	label: string;
	score: number | null;
	passed: number | null;
	reason: string;
	model_id: string;
	cost: string | null;
	scored_at: string;
};

/** All scores for one trace (and its spans), deduped — for trace detail. */
export function getTraceScores(
	client: ClickHouseClient,
	params: { projectId: string; traceId: string },
): Promise<ScoreDetailRow[]> {
	return rows<ScoreDetailRow>(
		client,
		`SELECT
       score_id, eval_id, target_type, target_id, trace_id,
       scorer, label, score, passed, reason, model_id, cost, scored_at
     FROM scores FINAL
     WHERE project_id = {projectId:String} AND trace_id = {traceId:String}
     ORDER BY scored_at ASC`,
		{ projectId: params.projectId, traceId: params.traceId },
	);
}

/** Recent scored targets for one eval (the eval detail table). */
export function listEvalScores(
	client: ClickHouseClient,
	params: { projectId: string; evalId: string; limit?: number },
): Promise<ScoreDetailRow[]> {
	return rows<ScoreDetailRow>(
		client,
		`SELECT
       score_id, eval_id, target_type, target_id, trace_id,
       scorer, label, score, passed, reason, model_id, cost, scored_at
     FROM scores FINAL
     WHERE project_id = {projectId:String} AND eval_id = {evalId:String}
     ORDER BY scored_at DESC
     LIMIT {limit:UInt32}`,
		{
			projectId: params.projectId,
			evalId: params.evalId,
			limit: params.limit ?? 50,
		},
	);
}

/**
 * Total spans ingested for an org over a [from, to) day window — summed from
 * the daily usage rollup (cheap; pre-aggregated). Powers the monthly span quota
 * and the usage tab. `from`/`to` are 'YYYY-MM-DD' dates.
 */
export async function queryOrgSpanUsage(
	client: ClickHouseClient,
	params: { orgId: string; from: string; to: string },
): Promise<number> {
	const result = await rows<{ total: string }>(
		client,
		`SELECT sum(span_count) AS total
     FROM usage_by_org_day
     WHERE org_id = {orgId:String}
       AND day >= {from:Date} AND day < {to:Date}`,
		{ orgId: params.orgId, from: params.from, to: params.to },
	);
	return Number(result[0]?.total ?? 0);
}

/** Distinct org ids with any span usage since `from` (YYYY-MM-DD) — bounds the
 *  quota-warning sweep to orgs with recent traffic. */
export async function queryRecentlyActiveOrgs(
	client: ClickHouseClient,
	from: string,
): Promise<string[]> {
	const result = await rows<{ org_id: string }>(
		client,
		`SELECT DISTINCT org_id FROM usage_by_org_day
     WHERE day >= {from:Date} AND org_id != ''`,
		{ from },
	);
	return result.map((r) => r.org_id);
}

export type ScoreSummaryRow = { pass_count: string; fail_count: string };

/**
 * Project-wide pass/fail totals over a window, across all evals. Pass rate =
 * pass / (pass + fail) — numeric-only judge scores (no verdict) are excluded,
 * since they contribute to neither count.
 */
export async function queryProjectScoreSummary(
	client: ClickHouseClient,
	params: { projectId: string; from: string; to: string },
): Promise<ScoreSummaryRow> {
	const result = await rows<ScoreSummaryRow>(
		client,
		`SELECT sum(pass_count) AS pass_count, sum(fail_count) AS fail_count
     FROM score_metrics_by_minute
     WHERE project_id = {projectId:String}
       AND bucket >= {from:DateTime} AND bucket < {to:DateTime}`,
		{ projectId: params.projectId, from: params.from, to: params.to },
	);
	return result[0] ?? { pass_count: "0", fail_count: "0" };
}

export type ScoreBucketRow = {
	bucket: string;
	score_count: string;
	pass_count: string;
	fail_count: string;
	score_sum: string;
	cost: string;
	score_quantiles: number[];
};

/** Per-minute score rollup for one eval (the eval detail chart). */
export function queryScoreTimeseries(
	client: ClickHouseClient,
	params: { projectId: string; evalId: string; from: string; to: string },
): Promise<ScoreBucketRow[]> {
	return rows<ScoreBucketRow>(
		client,
		`SELECT
       bucket,
       sum(score_count) AS score_count,
       sum(pass_count) AS pass_count,
       sum(fail_count) AS fail_count,
       sum(score_sum) AS score_sum,
       sum(cost) AS cost,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(score_quantiles) AS score_quantiles
     FROM score_metrics_by_minute
     WHERE project_id = {projectId:String} AND eval_id = {evalId:String}
       AND bucket >= {from:DateTime} AND bucket < {to:DateTime}
     GROUP BY bucket
     ORDER BY bucket ASC`,
		{
			projectId: params.projectId,
			evalId: params.evalId,
			from: params.from,
			to: params.to,
		},
	);
}

export type EvalFilterParams = {
	agentName?: string;
	workflowName?: string;
	traceName?: string;
	modelId?: string;
	spanType?: string;
	status?: string;
	metadata?: Record<string, string>;
};

export type EvalCandidateRow = {
	target_id: string;
	trace_id: string;
	span_type: string;
	start_time_ms: number;
	input: string;
	output: string;
	metadata: Record<string, string>;
	ingested_at: string;
};

/**
 * Candidate trace/span targets for one eval: matching the filters, ingested in
 * (since, until], deterministically sampled by hashing the target id (so the
 * same target always gets the same keep/skip decision). Trace-level targets are
 * the root `agent` span (target_id = trace_id). Ordered by ingested_at so the
 * worker can advance its watermark monotonically.
 */
export function queryEvalCandidates(
	client: ClickHouseClient,
	params: {
		projectId: string;
		level: "trace" | "span";
		filters: EvalFilterParams;
		since: string; // DateTime64(3) string
		until: string;
		sampleThousandths: number; // sampleRate * 1000
		limit: number;
	},
): Promise<EvalCandidateRow[]> {
	const { level, filters } = params;
	const idCol = level === "trace" ? "trace_id" : "span_id";
	const where: string[] = [
		"project_id = {projectId:String}",
		"ingested_at > {since:DateTime64(3)}",
		"ingested_at <= {until:DateTime64(3)}",
		`(cityHash64(${idCol}) % 1000) < {sampleThousandths:UInt32}`,
	];
	const qp: Record<string, unknown> = {
		projectId: params.projectId,
		since: params.since,
		until: params.until,
		sampleThousandths: params.sampleThousandths,
		limit: params.limit,
	};
	if (level === "trace") {
		where.push("span_type = 'agent'");
	} else if (filters.spanType) {
		where.push("span_type = {spanType:String}");
		qp.spanType = filters.spanType;
	}
	if (filters.agentName) {
		where.push("agent_name = {agentName:String}");
		qp.agentName = filters.agentName;
	}
	if (filters.workflowName) {
		where.push("workflow_name = {workflowName:String}");
		qp.workflowName = filters.workflowName;
	}
	if (filters.traceName) {
		where.push("trace_name = {traceName:String}");
		qp.traceName = filters.traceName;
	}
	if (filters.status) {
		where.push("status = {status:String}");
		qp.status = filters.status;
	}
	if (level === "span" && filters.modelId) {
		where.push("model_id = {modelId:String}");
		qp.modelId = filters.modelId;
	}
	// Metadata equality filters with safely-parameterized keys + values.
	Object.entries(filters.metadata ?? {}).forEach(([k, v], i) => {
		where.push(`metadata[{mk${i}:String}] = {mv${i}:String}`);
		qp[`mk${i}`] = k;
		qp[`mv${i}`] = v;
	});

	return rows<EvalCandidateRow>(
		client,
		`SELECT
       ${idCol} AS target_id,
       trace_id,
       span_type,
       toUnixTimestamp64Milli(start_time) AS start_time_ms,
       input,
       output,
       metadata,
       ingested_at
     FROM spans
     WHERE ${where.join(" AND ")}
     ORDER BY ingested_at ASC, target_id ASC
     LIMIT {limit:UInt32}`,
		qp,
	);
}

export type EvalSiblingRow = {
	span_id: string;
	span_type: string;
	output: string;
	start_time_ms: number;
};

/** Sibling spans of a trace (for RAG context extraction), ordered by start. */
export function queryTraceSiblings(
	client: ClickHouseClient,
	params: { projectId: string; traceId: string },
): Promise<EvalSiblingRow[]> {
	return rows<EvalSiblingRow>(
		client,
		`SELECT
       span_id,
       span_type,
       output,
       toUnixTimestamp64Milli(start_time) AS start_time_ms
     FROM spans
     WHERE project_id = {projectId:String} AND trace_id = {traceId:String}
     ORDER BY start_time ASC`,
		{ projectId: params.projectId, traceId: params.traceId },
	);
}

export type ScoreAlertWindowRow = {
	score_count: string;
	pass_count: string;
	fail_count: string;
	score_sum: string;
	score_quantiles: number[];
};

/**
 * Single-row score rollup over an alert's window for one eval. The evaluator
 * derives avg score (score_sum/score_count) or pass rate (pass/count) from it.
 */
export async function queryScoreAlertWindow(
	client: ClickHouseClient,
	params: { projectId: string; evalId: string; from: string; to: string },
): Promise<ScoreAlertWindowRow> {
	const result = await rows<ScoreAlertWindowRow>(
		client,
		`SELECT
       sum(score_count) AS score_count,
       sum(pass_count) AS pass_count,
       sum(fail_count) AS fail_count,
       sum(score_sum) AS score_sum,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(score_quantiles) AS score_quantiles
     FROM score_metrics_by_minute
     WHERE project_id = {projectId:String} AND eval_id = {evalId:String}
       AND bucket >= {from:DateTime} AND bucket < {to:DateTime}`,
		{
			projectId: params.projectId,
			evalId: params.evalId,
			from: params.from,
			to: params.to,
		},
	);
	return (
		result[0] ?? {
			score_count: "0",
			pass_count: "0",
			fail_count: "0",
			score_sum: "0",
			score_quantiles: [0, 0, 0],
		}
	);
}
