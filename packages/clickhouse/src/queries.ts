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
	customer_id: string;
	trace_start: string;
	trace_end: string;
	duration_ms: number;
	span_count: string;
	llm_span_count: string;
	error_count: string;
	/** Spans with the first-class `aborted` status (tracked apart from errors). */
	aborted_count: string;
	total_cost: string;
	priced_span_count: string;
	total_tokens: string;
	/** Distinct LLM model ids used across the trace's spans. */
	models: string[];
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
		/** Exact match on the workflow name. */
		workflowName?: string;
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
	if (params.workflowName !== undefined)
		conditions.push("workflow_name = {workflowName:String}");
	if (params.sessionId !== undefined)
		conditions.push("session_id = {sessionId:String}");
	if (params.from !== undefined)
		conditions.push("trace_start >= {from:DateTime64(3)}");
	if (params.to !== undefined)
		conditions.push("trace_start < {to:DateTime64(3)}");
	if (params.errorsOnly) conditions.push("error_count > 0");
	if (params.traceName !== undefined)
		conditions.push(
			"positionCaseInsensitive(trace_name, {traceName:String}) > 0",
		);
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
       any(customer_id) AS customer_id,
       min(trace_summary.trace_start) AS trace_start,
       max(trace_summary.trace_end) AS trace_end,
       dateDiff('millisecond', min(trace_summary.trace_start), max(trace_summary.trace_end)) AS duration_ms,
       sum(span_count) AS span_count,
       sum(llm_span_count) AS llm_span_count,
       sum(error_count) AS error_count,
       sum(aborted_count) AS aborted_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens,
       groupUniqArrayMerge(models) AS models
     FROM trace_summary
     WHERE project_id = {projectId:String}
     GROUP BY trace_id
     ${having}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
		{
			projectId: params.projectId,
			agentName: params.agentName,
			workflowName: params.workflowName,
			sessionId: params.sessionId,
			from: params.from,
			to: params.to,
			traceName: params.traceName,
			limit: params.limit ?? 50,
			offset: params.offset ?? 0,
		},
	);
}

export type TraceListSummaryRow = {
	/** Total traces in the filtered set (across all pages). */
	trace_count: string;
	/** Summed cost of priced traces. */
	total_cost: string;
	/** How many traces have at least one errored span. */
	error_trace_count: string;
	/** p95 trace duration (ms) across the filtered set. */
	duration_p95: number;
	/** 20/40/60/80th-percentile cost thresholds, priced traces only. */
	cost_q: number[];
	/** 20/40/60/80th-percentile duration thresholds (ms), all traces. */
	dur_q: number[];
};

/**
 * Single-row rollup over the filtered trace set (all pages): the header-strip
 * totals plus the quintile thresholds that drive the cost and duration heatmaps.
 * Cost quantiles use only priced traces (so unpriced rows don't skew the scale);
 * duration quantiles span every trace. Each shade then holds ~1/5 of traces
 * regardless of skew. Mirrors the filtering of `listTraces` (sans pagination).
 */
export function traceListSummary(
	client: ClickHouseClient,
	params: {
		projectId: string;
		agentName?: string;
		sessionId?: string;
		from?: string;
		to?: string;
		errorsOnly?: boolean;
		traceName?: string;
		workflowName?: string;
	},
): Promise<TraceListSummaryRow[]> {
	// Per-trace filters that narrow the visible set apply here too; the
	// cost-only `total_cost > 0` constraint is pushed into `quantilesIf` instead
	// so it doesn't drop traces from the duration scale or the counts.
	const having: string[] = [];
	if (params.agentName !== undefined)
		having.push("agent_name = {agentName:String}");
	if (params.workflowName !== undefined)
		having.push("workflow_name = {workflowName:String}");
	if (params.sessionId !== undefined)
		having.push("session_id = {sessionId:String}");
	if (params.from !== undefined)
		having.push("trace_start >= {from:DateTime64(3)}");
	if (params.to !== undefined) having.push("trace_start < {to:DateTime64(3)}");
	if (params.errorsOnly) having.push("error_count > 0");
	if (params.traceName !== undefined)
		having.push("positionCaseInsensitive(trace_name, {traceName:String}) > 0");
	const havingClause = having.length ? `HAVING ${having.join(" AND ")}` : "";
	return rows<TraceListSummaryRow>(
		client,
		// Qualify the per-trace columns with the subquery alias \`t\`: the outer
		// \`sum(t.total_cost) AS total_cost\` would otherwise shadow the column name,
		// so \`quantilesIf(total_cost, …)\` would bind to the aggregate alias and
		// nest aggregates → ILLEGAL_AGGREGATION.
		`SELECT
       count() AS trace_count,
       sum(t.total_cost) AS total_cost,
       countIf(t.error_count > 0) AS error_trace_count,
       quantile(0.95)(t.duration_ms) AS duration_p95,
       quantilesIf(0.2, 0.4, 0.6, 0.8)(t.total_cost, t.total_cost > 0) AS cost_q,
       quantiles(0.2, 0.4, 0.6, 0.8)(t.duration_ms) AS dur_q
     FROM (
       SELECT
         trace_id,
         any(agent_name) AS agent_name,
         any(workflow_name) AS workflow_name,
         any(session_id) AS session_id,
         any(trace_name) AS trace_name,
         min(trace_summary.trace_start) AS trace_start,
         sum(error_count) AS error_count,
         sum(total_cost) AS total_cost,
         dateDiff('millisecond', min(trace_summary.trace_start), max(trace_summary.trace_end)) AS duration_ms
       FROM trace_summary
       WHERE project_id = {projectId:String}
       GROUP BY trace_id
       ${havingClause}
     ) AS t`,
		{
			projectId: params.projectId,
			agentName: params.agentName,
			workflowName: params.workflowName,
			sessionId: params.sessionId,
			from: params.from,
			to: params.to,
			traceName: params.traceName,
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

export type SessionListSummaryRow = {
	/** Total sessions in the filtered set (across all pages). */
	session_count: string;
	/** Summed cost of priced sessions. */
	total_cost: string;
	/** How many sessions have at least one errored span. */
	error_session_count: string;
	/** Summed tokens across the filtered set. */
	total_tokens: string;
	/** 20/40/60/80th-percentile cost thresholds, priced sessions only. */
	cost_q: number[];
};

/**
 * Single-row rollup over the filtered session set (all pages): the header-strip
 * totals plus the quintile thresholds that drive the cost heatmap. Cost
 * quantiles use only priced sessions (so unpriced rows don't skew the scale);
 * each shade then holds ~1/5 of sessions regardless of skew. Mirrors the
 * filtering of `listSessions` (sans pagination).
 */
export function sessionListSummary(
	client: ClickHouseClient,
	params: {
		projectId: string;
		from?: string;
		to?: string;
		errorsOnly?: boolean;
		agentName?: string;
		sessionId?: string;
	},
): Promise<SessionListSummaryRow[]> {
	// Per-session filters that narrow the visible set apply here too; the
	// cost-only `total_cost > 0` constraint is pushed into `quantilesIf` instead
	// so it doesn't drop sessions from the counts.
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
	return rows<SessionListSummaryRow>(
		client,
		// Qualify the per-session columns with the subquery alias `t`: the outer
		// `sum(t.total_cost) AS total_cost` would otherwise shadow the column name,
		// so `quantilesIf(total_cost, …)` would bind to the aggregate alias and
		// nest aggregates → ILLEGAL_AGGREGATION.
		`SELECT
       count() AS session_count,
       sum(t.total_cost) AS total_cost,
       countIf(t.error_count > 0) AS error_session_count,
       sum(t.total_tokens) AS total_tokens,
       quantilesIf(0.2, 0.4, 0.6, 0.8)(t.total_cost, t.total_cost > 0) AS cost_q
     FROM (
       SELECT
         session_id,
         any(agent_name) AS agent_name,
         sum(error_count) AS error_count,
         sum(total_cost) AS total_cost,
         sum(total_tokens) AS total_tokens,
         min(trace_summary.trace_start) AS first_seen,
         max(trace_summary.trace_end) AS last_seen
       FROM trace_summary
       WHERE project_id = {projectId:String}
       GROUP BY session_id
       HAVING ${having.join(" AND ")}
     ) AS t`,
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			agentName: params.agentName,
			sessionSearch: params.sessionId,
		},
	);
}

export type CustomerListRow = {
	customer_id: string;
	customer_name: string;
	customer_image_url: string;
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
 * Per-customer cost rollup (the Overview "Customers" card). Rolls up
 * `trace_summary` grouped by `customer_id` — the same shape as `listSessions` —
 * and joins the small `customers` dimension table (FINAL, scoped to the project
 * so the merge is cheap) for the display name/image. Default sort is cost desc:
 * the card wants the top spenders. Time-windowed via HAVING on first/last-seen.
 * With `includeUnidentified`, the empty-`customer_id` bucket (untagged traces) is
 * kept too, so the caller can surface a "Not identified" row; by default it's
 * excluded (e.g. Foggy lists real customers only).
 */
export function listCustomers(
	client: ClickHouseClient,
	params: {
		projectId: string;
		from?: string;
		to?: string;
		/** Keep the empty-customer_id bucket (untagged traces). Default false. */
		includeUnidentified?: boolean;
		limit?: number;
		offset?: number;
	},
): Promise<CustomerListRow[]> {
	const having: string[] = [];
	if (!params.includeUnidentified) having.push("customer_id != ''");
	if (params.from !== undefined)
		having.push("last_seen >= {from:DateTime64(3)}");
	if (params.to !== undefined) having.push("first_seen < {to:DateTime64(3)}");
	return rows<CustomerListRow>(
		client,
		`SELECT
       r.customer_id AS customer_id,
       dim.customer_name AS customer_name,
       dim.customer_image_url AS customer_image_url,
       r.span_count AS span_count,
       r.llm_span_count AS llm_span_count,
       r.error_count AS error_count,
       r.total_cost AS total_cost,
       r.priced_span_count AS priced_span_count,
       r.total_tokens AS total_tokens,
       r.first_seen AS first_seen,
       r.last_seen AS last_seen
     FROM (
       SELECT
         customer_id,
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
       GROUP BY customer_id
       ${having.length ? `HAVING ${having.join(" AND ")}` : ""}
     ) AS r
     LEFT JOIN (
       SELECT customer_id, customer_name, customer_image_url
       FROM customers FINAL
       WHERE project_id = {projectId:String}
     ) AS dim ON dim.customer_id = r.customer_id
     ORDER BY r.total_cost DESC
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			limit: params.limit ?? 50,
			offset: params.offset ?? 0,
		},
	);
}

export type CustomerDisplayRow = {
	customer_id: string;
	customer_name: string;
	customer_image_url: string;
};

/**
 * Resolve display fields (name, image) for a set of customer ids from the
 * `customers` dimension (latest-write-wins via FINAL). Used to decorate trace
 * rows — which carry only `customer_id` — with a friendly name/avatar. Returns
 * [] for an empty id set.
 */
export function getCustomerDisplays(
	client: ClickHouseClient,
	params: { projectId: string; customerIds: string[] },
): Promise<CustomerDisplayRow[]> {
	if (params.customerIds.length === 0) return Promise.resolve([]);
	return rows<CustomerDisplayRow>(
		client,
		`SELECT customer_id, customer_name, customer_image_url
     FROM customers FINAL
     WHERE project_id = {projectId:String} AND customer_id IN {ids:Array(String)}`,
		{ projectId: params.projectId, ids: params.customerIds },
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
 *
 * `LIMIT 1 BY trace_id` collapses traces with several `agent` spans (an agent
 * spawning sub-agents) to their earliest-starting one — the root — so a trace
 * is one turn, never N duplicates.
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
     ORDER BY start_time ASC, span_id ASC
     LIMIT 1 BY trace_id`,
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
	reasoning_tokens: number;
	cached_input_tokens: number;
	cache_write_input_tokens: number;
	image_count: number;
	web_search_count: number;
	request_count: number;
	ttft_ms: number | null;
	chunk_offsets: number[];
	chunk_tokens: number[];
	reasoning_offsets: number[];
	reasoning_chunk_tokens: number[];
	reasoning_duration_ms: number | null;
	// Per-dimension cost breakdown (Nullable Decimals → strings); these sum to
	// total_cost. Surfaced on the span detail view, not in list rollups.
	prompt_cost: string | null;
	completion_cost: string | null;
	request_cost: string | null;
	image_cost: string | null;
	web_search_cost: string | null;
	internal_reasoning_cost: string | null;
	cache_read_cost: string | null;
	cache_write_cost: string | null;
	total_cost: string | null;
	priced_model_id: string;
	priced_at: string | null;
	pricing_source: string;
	metadata: Record<string, string>;
	input: string;
	output: string;
	tool_catalog: string;
	// Secondary provider signals (llm spans). model_call_ms splits pure model
	// time from tool execution; the rest are drift/safety/grounding/rate-limit.
	model_call_ms: number | null;
	system_fingerprint: string;
	safety_metadata: string;
	sources: string;
	rate_limit_requests_limit: number | null;
	rate_limit_requests_remaining: number | null;
	rate_limit_requests_reset_ms: number | null;
	rate_limit_tokens_limit: number | null;
	rate_limit_tokens_remaining: number | null;
	rate_limit_tokens_reset_ms: number | null;
	// Official AI SDK step `performance` stats (llm spans, v7 beta/canary). Null on
	// older v7, v4-v6 wrap, and non-llm spans.
	response_time_ms: number | null;
	effective_output_tps: number | null;
	effective_total_tps: number | null;
	output_tps: number | null;
	input_tps: number | null;
	chunk_jitter_min: number | null;
	chunk_jitter_p10: number | null;
	chunk_jitter_median: number | null;
	chunk_jitter_avg: number | null;
	chunk_jitter_p90: number | null;
	chunk_jitter_max: number | null;
	// Trace-level context (stable across a trace's spans), so the detail header
	// can link back to the owning session/workflow/agent.
	agent_name: string;
	workflow_name: string;
	workflow_run_id: string;
	session_id: string;
	customer_id: string;
};

// Hard cap on spans returned for one trace. Each row can carry ~MB-scale
// input/output payloads, and the waterfall renders every row it gets — an
// unbounded trace would stall both the transfer and the browser.
const TRACE_SPANS_LIMIT = 2000;

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
       input_tokens, output_tokens, total_tokens,
       reasoning_tokens, cached_input_tokens, cache_write_input_tokens,
       image_count, web_search_count, request_count, ttft_ms,
       chunk_offsets, chunk_tokens,
       reasoning_offsets, reasoning_chunk_tokens, reasoning_duration_ms,
       prompt_cost, completion_cost, request_cost, image_cost, web_search_cost,
       internal_reasoning_cost, cache_read_cost, cache_write_cost,
       total_cost, priced_model_id, priced_at, pricing_source,
       metadata, input, output, tool_catalog,
       model_call_ms, system_fingerprint, safety_metadata, sources,
       rate_limit_requests_limit, rate_limit_requests_remaining, rate_limit_requests_reset_ms,
       rate_limit_tokens_limit, rate_limit_tokens_remaining, rate_limit_tokens_reset_ms,
       response_time_ms, effective_output_tps, effective_total_tps, output_tps, input_tps,
       chunk_jitter_min, chunk_jitter_p10, chunk_jitter_median,
       chunk_jitter_avg, chunk_jitter_p90, chunk_jitter_max,
       agent_name, workflow_name, workflow_run_id, session_id, customer_id
     FROM spans FINAL
     WHERE project_id = {projectId:String} AND trace_id = {traceId:String}
     ORDER BY start_time ASC, span_id ASC
     LIMIT ${TRACE_SPANS_LIMIT}`,
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

export type WorkflowRunSortField =
	| "when"
	| "duration"
	| "traces"
	| "errors"
	| "cost";

// Whitelist of sortable run columns → SELECT alias (the ORDER BY can't be
// parameterized, so it must never be attacker-controlled).
const WORKFLOW_RUN_SORT_COLUMN: Record<WorkflowRunSortField, string> = {
	when: "run_start",
	duration: "duration_ms",
	traces: "trace_count",
	errors: "error_count",
	cost: "total_cost",
};

/** Per-run HAVING conditions shared by the run list, its summary, and the run
 * timeseries. All reference per-run aggregates (workflow_name/run window/error
 * count), so they belong in HAVING after `GROUP BY workflow_run_id`. An empty
 * workflow_name selects the "Ungrouped" bucket; from/to keep runs whose activity
 * overlaps the window (run_start/run_end are min/max aggregates). */
function workflowRunHaving(params: {
	workflowName?: string;
	from?: string;
	to?: string;
	errorsOnly?: boolean;
}): string {
	const having: string[] = [];
	if (params.workflowName !== undefined)
		having.push("workflow_name = {workflowName:String}");
	if (params.from !== undefined) having.push("run_end >= {from:DateTime64(3)}");
	if (params.to !== undefined) having.push("run_start < {to:DateTime64(3)}");
	if (params.errorsOnly) having.push("error_count > 0");
	return having.length ? `HAVING ${having.join(" AND ")}` : "";
}

export function listWorkflowRuns(
	client: ClickHouseClient,
	params: {
		projectId: string;
		workflowName?: string;
		from?: string;
		to?: string;
		errorsOnly?: boolean;
		sort?: { field: WorkflowRunSortField; dir: SortDir };
		limit?: number;
		offset?: number;
	},
): Promise<WorkflowRunRow[]> {
	const sortCol = params.sort
		? WORKFLOW_RUN_SORT_COLUMN[params.sort.field]
		: "run_start";
	const sortDir = params.sort?.dir === "asc" ? "ASC" : "DESC";
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
     ${workflowRunHaving(params)}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
		{
			projectId: params.projectId,
			workflowName: params.workflowName,
			from: params.from,
			to: params.to,
			limit: params.limit ?? 50,
			offset: params.offset ?? 0,
		},
	);
}

export type WorkflowRunSummaryRow = {
	/** Total runs in the filtered set (across all pages). */
	run_count: string;
	/** How many runs had at least one errored span. */
	errored_run_count: string;
	/** Summed errored spans across the filtered runs. */
	error_count: string;
	/** Summed cost of the filtered runs. */
	total_cost: string;
	/** Summed tokens across the filtered runs. */
	total_tokens: string;
	/** Distinct traces across the filtered runs. */
	trace_count: string;
	/** [p50, p95, p99] run duration in milliseconds. */
	duration_quantiles: number[];
};

/**
 * Single-row rollup over the filtered runs of one workflow (all pages): the
 * stat-strip totals plus run-duration percentiles. The inner query collapses
 * each run to one row (duration is exact per run), then the outer aggregates
 * across runs — mirrors the filtering of {@link listWorkflowRuns} sans paging.
 */
export function workflowRunSummary(
	client: ClickHouseClient,
	params: {
		projectId: string;
		workflowName?: string;
		from?: string;
		to?: string;
		errorsOnly?: boolean;
	},
): Promise<WorkflowRunSummaryRow[]> {
	return rows<WorkflowRunSummaryRow>(
		client,
		// Qualify the per-run columns with the subquery alias `t` so the outer
		// `sum(t.error_count)` binds to the column, not the inner `sum(error_count)`
		// alias (which would nest aggregates → ILLEGAL_AGGREGATION).
		`SELECT
       count() AS run_count,
       countIf(t.error_count > 0) AS errored_run_count,
       sum(t.error_count) AS error_count,
       sum(t.total_cost) AS total_cost,
       sum(t.total_tokens) AS total_tokens,
       sum(t.trace_count) AS trace_count,
       quantiles(0.5, 0.95, 0.99)(t.duration_ms) AS duration_quantiles
     FROM (
       SELECT
         any(workflow_name) AS workflow_name,
         min(workflow_run_summary.run_start) AS run_start,
         max(workflow_run_summary.run_end) AS run_end,
         dateDiff('millisecond', min(workflow_run_summary.run_start), max(workflow_run_summary.run_end)) AS duration_ms,
         uniqMerge(trace_count) AS trace_count,
         sum(error_count) AS error_count,
         sum(total_cost) AS total_cost,
         sum(total_tokens) AS total_tokens
       FROM workflow_run_summary
       WHERE project_id = {projectId:String}
       GROUP BY workflow_run_id
       ${workflowRunHaving(params)}
     ) AS t`,
		{
			projectId: params.projectId,
			workflowName: params.workflowName,
			from: params.from,
			to: params.to,
		},
	);
}

export type WorkflowRunBucketRow = {
	bucket: string;
	run_count: string;
	errored_run_count: string;
	total_cost: string;
	/** [p50, p95, p99] run duration in milliseconds. */
	duration_quantiles: number[];
};

/** Runs bucketed by start time (the workflow detail trend chart). `bucketSec`
 * is the bucket width in seconds, chosen by the caller to fit the window. */
export function workflowRunTimeseries(
	client: ClickHouseClient,
	params: {
		projectId: string;
		workflowName?: string;
		from?: string;
		to?: string;
		errorsOnly?: boolean;
		bucketSec: number;
	},
): Promise<WorkflowRunBucketRow[]> {
	return rows<WorkflowRunBucketRow>(
		client,
		// Qualify per-run columns with the subquery alias `t` so the outer
		// `sum(t.total_cost)` binds to the column, not the inner aggregate alias
		// (which would nest aggregates → ILLEGAL_AGGREGATION).
		`SELECT
       toStartOfInterval(t.run_start, toIntervalSecond({bucketSec:UInt32})) AS bucket,
       count() AS run_count,
       countIf(t.error_count > 0) AS errored_run_count,
       sum(t.total_cost) AS total_cost,
       quantiles(0.5, 0.95, 0.99)(t.duration_ms) AS duration_quantiles
     FROM (
       SELECT
         any(workflow_name) AS workflow_name,
         min(workflow_run_summary.run_start) AS run_start,
         max(workflow_run_summary.run_end) AS run_end,
         dateDiff('millisecond', min(workflow_run_summary.run_start), max(workflow_run_summary.run_end)) AS duration_ms,
         sum(error_count) AS error_count,
         sum(total_cost) AS total_cost
       FROM workflow_run_summary
       WHERE project_id = {projectId:String}
       GROUP BY workflow_run_id
       ${workflowRunHaving(params)}
     ) AS t
     GROUP BY bucket
     ORDER BY bucket ASC`,
		{
			projectId: params.projectId,
			workflowName: params.workflowName,
			from: params.from,
			to: params.to,
			bucketSec: Math.max(1, Math.floor(params.bucketSec)),
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

export type WorkflowSortField =
	| "name"
	| "runs"
	| "traces"
	| "tokens"
	| "errors"
	| "cost"
	| "lastRun";

// Whitelist of sortable workflow columns → SQL expression (aliases from the
// SELECT, so the ORDER BY — which can't be parameterized — is never
// attacker-controlled).
const WORKFLOW_SORT_COLUMN: Record<WorkflowSortField, string> = {
	name: "workflow_name",
	runs: "run_count",
	traces: "trace_count",
	tokens: "total_tokens",
	errors: "error_count",
	cost: "total_cost",
	lastRun: "last_run",
};

/** Per-workflow HAVING conditions shared by the list + its summary rollup
 * (window overlap, name search, errors-only). All reference grouped aggregates,
 * so they belong in HAVING. */
function workflowHaving(params: {
	from?: string;
	to?: string;
	workflowName?: string;
	errorsOnly?: boolean;
}): string {
	const conditions: string[] = [];
	// Keep workflows whose activity overlaps the window (first/last run are
	// min/max aggregates).
	if (params.from !== undefined)
		conditions.push("last_run >= {from:DateTime64(3)}");
	if (params.to !== undefined)
		conditions.push("first_run < {to:DateTime64(3)}");
	if (params.workflowName !== undefined)
		conditions.push(
			"positionCaseInsensitive(workflow_name, {search:String}) > 0",
		);
	if (params.errorsOnly) conditions.push("error_count > 0");
	return conditions.length ? `HAVING ${conditions.join(" AND ")}` : "";
}

/**
 * Workflows grouped by name (the Workflows grid). `workflow_name = ''` is the
 * "Ungrouped" bucket for runs the SDK emitted without a workflow name; the
 * service layer labels it. Server-side sort/filter/pagination mirror `listTraces`.
 */
export function listWorkflows(
	client: ClickHouseClient,
	params: {
		projectId: string;
		from?: string;
		to?: string;
		/** Case-insensitive substring match on the workflow name. */
		workflowName?: string;
		/** Keep only workflows with at least one errored span. */
		errorsOnly?: boolean;
		sort?: { field: WorkflowSortField; dir: SortDir };
		limit?: number;
		offset?: number;
	},
): Promise<WorkflowRow[]> {
	const sortCol = params.sort
		? WORKFLOW_SORT_COLUMN[params.sort.field]
		: "last_run";
	const sortDir = params.sort?.dir === "asc" ? "ASC" : "DESC";
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
     ${workflowHaving(params)}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			search: params.workflowName,
			limit: params.limit ?? 100,
			offset: params.offset ?? 0,
		},
	);
}

export type WorkflowListSummaryRow = {
	/** Total workflows in the filtered set (across all pages). */
	workflow_count: string;
	/** Summed runs across the filtered set. */
	run_count: string;
	/** How many workflows have at least one errored span. */
	error_workflow_count: string;
	/** Summed cost of priced workflows. */
	total_cost: string;
	/** Summed tokens across the filtered set. */
	total_tokens: string;
	/** 20/40/60/80th-percentile cost thresholds, priced workflows only. */
	cost_q: number[];
};

/**
 * Single-row rollup over the filtered workflow set (all pages): the header-strip
 * totals plus the quintile thresholds that drive the cost heatmap. Mirrors the
 * filtering of `listWorkflows` (sans pagination).
 */
export function workflowListSummary(
	client: ClickHouseClient,
	params: {
		projectId: string;
		from?: string;
		to?: string;
		workflowName?: string;
		errorsOnly?: boolean;
	},
): Promise<WorkflowListSummaryRow[]> {
	return rows<WorkflowListSummaryRow>(
		client,
		// Qualify the per-workflow columns with the subquery alias `t` so
		// `quantilesIf(total_cost, …)` binds to the column, not the outer
		// `sum(t.total_cost)` alias (which would nest aggregates → ILLEGAL_AGGREGATION).
		`SELECT
       count() AS workflow_count,
       sum(t.run_count) AS run_count,
       countIf(t.error_count > 0) AS error_workflow_count,
       sum(t.total_cost) AS total_cost,
       sum(t.total_tokens) AS total_tokens,
       quantilesIf(0.2, 0.4, 0.6, 0.8)(t.total_cost, t.total_cost > 0) AS cost_q
     FROM (
       SELECT
         workflow_name,
         uniqExact(workflow_run_id) AS run_count,
         sum(error_count) AS error_count,
         sum(total_cost) AS total_cost,
         sum(total_tokens) AS total_tokens,
         min(workflow_run_summary.run_start) AS first_run,
         max(workflow_run_summary.run_end) AS last_run
       FROM workflow_run_summary
       WHERE project_id = {projectId:String}
       GROUP BY workflow_name
       ${workflowHaving(params)}
     ) AS t`,
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			search: params.workflowName,
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
	/** Official AI SDK step `performance` rollups (v7 beta/canary). [p50, p95, p99].
	 * response_time in ms; the *_tps are tokens/sec; chunk_jitter_median in ms.
	 * Zero-valued for windows with no performance-bearing spans. */
	response_time_quantiles: number[];
	effective_output_tps_quantiles: number[];
	effective_total_tps_quantiles: number[];
	chunk_jitter_median_quantiles: number[];
};

/**
 * Time series rolled up into `bucketSec`-wide buckets (chosen by the caller to
 * fit the window), optionally sliced by span_type / model / agent. The minute
 * buckets are re-grouped with `toStartOfInterval` so a multi-day window yields
 * ~daily points instead of one noisy point per minute; the TDigest states still
 * merge correctly across the wider bucket.
 */
export function queryMetricsTimeseries(
	client: ClickHouseClient,
	params: {
		projectId: string;
		from: string; // 'YYYY-MM-DD HH:MM:SS'
		to: string;
		/** Bucket width in seconds. Defaults to 60 (the raw minute grain). */
		bucketSec?: number;
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
       toStartOfInterval(bucket, toIntervalSecond({bucketSec:UInt32})) AS bucket,
       sum(span_count) AS span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens,
       sum(input_tokens) AS input_tokens,
       sum(output_tokens) AS output_tokens,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(duration_quantiles) AS duration_quantiles,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(ttft_quantiles) AS ttft_quantiles,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(response_time_quantiles) AS response_time_quantiles,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(effective_output_tps_quantiles) AS effective_output_tps_quantiles,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(effective_total_tps_quantiles) AS effective_total_tps_quantiles,
       quantilesTDigestMerge(0.5, 0.95, 0.99)(chunk_jitter_median_quantiles) AS chunk_jitter_median_quantiles
     FROM metrics_by_minute
     WHERE ${filters.join(" AND ")}
     GROUP BY bucket
     ORDER BY bucket ASC`,
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			bucketSec: Math.max(60, Math.floor(params.bucketSec ?? 60)),
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

/** Cost/tokens per model (llm spans) in `bucketSec`-wide buckets, for a stacked
 * cost-over-time chart. Re-groups the minute buckets so the window stays
 * readable (see `queryMetricsTimeseries`). */
export function queryMetricsTimeseriesByModel(
	client: ClickHouseClient,
	params: { projectId: string; from: string; to: string; bucketSec?: number },
): Promise<ModelTimeseriesRow[]> {
	return rows<ModelTimeseriesRow>(
		client,
		`SELECT
       toStartOfInterval(bucket, toIntervalSecond({bucketSec:UInt32})) AS bucket,
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
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			bucketSec: Math.max(60, Math.floor(params.bucketSec ?? 60)),
		},
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

/** Per-agent rollup over a window (for the per-agent detail stats). */
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

export type AgentSortField =
	| "name"
	| "spans"
	| "llm"
	| "tokens"
	| "latency"
	| "errors"
	| "cost";

// Whitelist of sortable agent columns → SQL expression (aliases from the SELECT,
// so the ORDER BY — which can't be parameterized — is never attacker-controlled).
// `latency` sorts by the p95 element of the merged llm-latency quantiles array.
const AGENT_SORT_COLUMN: Record<AgentSortField, string> = {
	name: "agent_name",
	spans: "span_count",
	llm: "llm_span_count",
	tokens: "total_tokens",
	latency: "duration_quantiles[2]",
	errors: "error_count",
	cost: "total_cost",
};

/**
 * Paginated/sorted/filtered per-agent rollup (the Agents grid). Same shape as
 * `queryAgentBreakdown`, plus a case-insensitive name search, an errors-only
 * filter, server-side sort, and a page window — mirroring `listTraces`.
 */
export function listAgents(
	client: ClickHouseClient,
	params: {
		projectId: string;
		from: string;
		to: string;
		/** Case-insensitive substring match on the agent name. */
		agentName?: string;
		/** Keep only agents with at least one errored span. */
		errorsOnly?: boolean;
		sort?: { field: AgentSortField; dir: SortDir };
		limit?: number;
		offset?: number;
	},
): Promise<AgentBreakdownRow[]> {
	const where = [
		"project_id = {projectId:String}",
		"bucket >= {from:DateTime}",
		"bucket < {to:DateTime}",
		"agent_name != ''",
	];
	if (params.agentName !== undefined)
		where.push("positionCaseInsensitive(agent_name, {search:String}) > 0");
	// error_count is an aggregate, so the errors-only filter lives in HAVING.
	const having = params.errorsOnly ? "HAVING error_count > 0" : "";
	const sortCol = params.sort
		? AGENT_SORT_COLUMN[params.sort.field]
		: "total_cost";
	const sortDir = params.sort?.dir === "asc" ? "ASC" : "DESC";
	return rows<AgentBreakdownRow>(
		client,
		`SELECT
       agent_name,
       sum(span_count) AS span_count,
       sumIf(metrics_by_minute.span_count, span_type = 'llm') AS llm_span_count,
       sum(error_count) AS error_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens,
       quantilesTDigestMergeIf(0.5, 0.95, 0.99)(duration_quantiles, span_type = 'llm') AS duration_quantiles
     FROM metrics_by_minute
     WHERE ${where.join(" AND ")}
     GROUP BY agent_name
     ${having}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			search: params.agentName,
			limit: params.limit ?? 50,
			offset: params.offset ?? 0,
		},
	);
}

export type AgentListSummaryRow = {
	/** Total agents in the filtered set (across all pages). */
	agent_count: string;
	/** Summed cost of priced agents. */
	total_cost: string;
	/** How many agents have at least one errored span. */
	error_agent_count: string;
	/** Summed tokens across the filtered set. */
	total_tokens: string;
	/** 20/40/60/80th-percentile cost thresholds, priced agents only. */
	cost_q: number[];
};

/**
 * Single-row rollup over the filtered agent set (all pages): the header-strip
 * totals plus the quintile thresholds that drive the cost heatmap. Cost
 * quantiles use only priced agents (so unpriced rows don't skew the scale).
 * Mirrors the filtering of `listAgents` (sans pagination).
 */
export function agentListSummary(
	client: ClickHouseClient,
	params: {
		projectId: string;
		from: string;
		to: string;
		agentName?: string;
		errorsOnly?: boolean;
	},
): Promise<AgentListSummaryRow[]> {
	const where = [
		"project_id = {projectId:String}",
		"bucket >= {from:DateTime}",
		"bucket < {to:DateTime}",
		"agent_name != ''",
	];
	if (params.agentName !== undefined)
		where.push("positionCaseInsensitive(agent_name, {search:String}) > 0");
	const having = params.errorsOnly ? "HAVING error_count > 0" : "";
	return rows<AgentListSummaryRow>(
		client,
		// Qualify the per-agent columns with the subquery alias `t` so
		// `quantilesIf(total_cost, …)` binds to the column, not the outer
		// `sum(t.total_cost)` alias (which would nest aggregates → ILLEGAL_AGGREGATION).
		`SELECT
       count() AS agent_count,
       sum(t.total_cost) AS total_cost,
       countIf(t.error_count > 0) AS error_agent_count,
       sum(t.total_tokens) AS total_tokens,
       quantilesIf(0.2, 0.4, 0.6, 0.8)(t.total_cost, t.total_cost > 0) AS cost_q
     FROM (
       SELECT
         agent_name,
         sum(error_count) AS error_count,
         sum(total_cost) AS total_cost,
         sum(total_tokens) AS total_tokens
       FROM metrics_by_minute
       WHERE ${where.join(" AND ")}
       GROUP BY agent_name
       ${having}
     ) AS t`,
		{
			projectId: params.projectId,
			from: params.from,
			to: params.to,
			search: params.agentName,
		},
	);
}

/** Distinct agent names active in a window — feeds the agent-filter dropdowns. */
export function queryAgentNames(
	client: ClickHouseClient,
	params: { projectId: string; from: string; to: string },
): Promise<{ agent_name: string }[]> {
	return rows<{ agent_name: string }>(
		client,
		`SELECT DISTINCT agent_name
     FROM metrics_by_minute
     WHERE project_id = {projectId:String}
       AND bucket >= {from:DateTime} AND bucket < {to:DateTime}
       AND agent_name != ''
     ORDER BY agent_name`,
		{ projectId: params.projectId, from: params.from, to: params.to },
	);
}

/**
 * Distinct workflow names with activity in a window — for the workflow-filter
 * dropdown on the traces table. Reads `trace_summary` (which carries
 * `workflow_name`, unlike `metrics_by_minute`); empties are excluded.
 */
export function queryWorkflowNames(
	client: ClickHouseClient,
	params: { projectId: string; from: string; to: string },
): Promise<{ workflow_name: string }[]> {
	return rows<{ workflow_name: string }>(
		client,
		`SELECT DISTINCT workflow_name
     FROM trace_summary
     WHERE project_id = {projectId:String}
       AND trace_start >= {from:DateTime64(3)} AND trace_start < {to:DateTime64(3)}
       AND workflow_name != ''
     ORDER BY workflow_name`,
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
       any(customer_id) AS customer_id,
       min(trace_summary.trace_start) AS trace_start,
       max(trace_summary.trace_end) AS trace_end,
       dateDiff('millisecond', min(trace_summary.trace_start), max(trace_summary.trace_end)) AS duration_ms,
       sum(span_count) AS span_count,
       sum(llm_span_count) AS llm_span_count,
       sum(error_count) AS error_count,
       sum(aborted_count) AS aborted_count,
       sum(total_cost) AS total_cost,
       sum(priced_span_count) AS priced_span_count,
       sum(total_tokens) AS total_tokens,
       groupUniqArrayMerge(models) AS models
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

/** A single score by its id, scoped to its eval — for deep-linking to one run
 * on the eval detail page regardless of the active range or page. */
export async function getEvalScore(
	client: ClickHouseClient,
	params: { projectId: string; evalId: string; scoreId: string },
): Promise<ScoreDetailRow | null> {
	const result = await rows<ScoreDetailRow>(
		client,
		`SELECT
       score_id, eval_id, target_type, target_id, trace_id,
       scorer, label, score, passed, reason, model_id, cost, scored_at
     FROM scores FINAL
     WHERE project_id = {projectId:String}
       AND eval_id = {evalId:String}
       AND score_id = {scoreId:String}
     LIMIT 1`,
		{
			projectId: params.projectId,
			evalId: params.evalId,
			scoreId: params.scoreId,
		},
	);
	return result[0] ?? null;
}

/** Recent scored targets for one eval (the eval detail table). */
export function listEvalScores(
	client: ClickHouseClient,
	params: {
		projectId: string;
		evalId: string;
		limit?: number;
		offset?: number;
		from?: string;
		to?: string;
		sort?: { field: "score"; dir: "asc" | "desc" };
	},
): Promise<ScoreDetailRow[]> {
	// Optional [from, to) window — passed by the single-eval page so the recent
	// scores table tracks the same range picker that drives its summary cards.
	const window =
		params.from && params.to
			? "AND scored_at >= {from:DateTime} AND scored_at < {to:DateTime}"
			: "";
	// Sort by the unified "score" — numeric score when present, else the pass/fail
	// flag as 1/0 — so pass/fail and graded evals order on one scale. Rows with
	// neither (the "—" cells) sink to the bottom. Recency is the default and the
	// stable tiebreak. `dir` is a fixed enum, so interpolating it is safe.
	const orderBy = params.sort
		? `coalesce(score, toFloat64(passed)) ${
				params.sort.dir === "asc" ? "ASC" : "DESC"
			} NULLS LAST, scored_at DESC`
		: "scored_at DESC";
	return rows<ScoreDetailRow>(
		client,
		`SELECT
       score_id, eval_id, target_type, target_id, trace_id,
       scorer, label, score, passed, reason, model_id, cost, scored_at
     FROM scores FINAL
     WHERE project_id = {projectId:String} AND eval_id = {evalId:String}
       ${window}
     ORDER BY ${orderBy}
     LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
		{
			projectId: params.projectId,
			evalId: params.evalId,
			limit: params.limit ?? 50,
			offset: params.offset ?? 0,
			...(params.from && params.to ? { from: params.from, to: params.to } : {}),
		},
	);
}

/** Total scores for an eval over the optional [from, to) window — the filtered
 * count across all pages, so the recent-scores table can render numbered pages.
 * Mirrors the filtering of `listEvalScores` (sans pagination). */
export async function countEvalScores(
	client: ClickHouseClient,
	params: {
		projectId: string;
		evalId: string;
		from?: string;
		to?: string;
	},
): Promise<number> {
	const window =
		params.from && params.to
			? "AND scored_at >= {from:DateTime} AND scored_at < {to:DateTime}"
			: "";
	const result = await rows<{ total: string }>(
		client,
		`SELECT count() AS total
     FROM scores FINAL
     WHERE project_id = {projectId:String} AND eval_id = {evalId:String}
       ${window}`,
		{
			projectId: params.projectId,
			evalId: params.evalId,
			...(params.from && params.to ? { from: params.from, to: params.to } : {}),
		},
	);
	return Number(result[0]?.total ?? 0);
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
 *
 * Counts deduplicated `scores FINAL`, not the per-minute MV: the MV fires per
 * insert, *before* ReplacingMergeTree collapses re-scores of the same target,
 * so it overcounts whenever a job retries (see `evalListSummary`).
 */
export async function queryProjectScoreSummary(
	client: ClickHouseClient,
	params: { projectId: string; from: string; to: string },
): Promise<ScoreSummaryRow> {
	const result = await rows<ScoreSummaryRow>(
		client,
		`SELECT
       countIf(passed = 1) AS pass_count,
       countIf(passed = 0) AS fail_count
     FROM scores FINAL
     WHERE project_id = {projectId:String}
       AND scored_at >= {from:DateTime} AND scored_at < {to:DateTime}`,
		{ projectId: params.projectId, from: params.from, to: params.to },
	);
	return result[0] ?? { pass_count: "0", fail_count: "0" };
}

export type ScoreBucketRow = {
	bucket: string;
	score_count: string;
	// Rows whose score is non-null — the correct avg denominator (a null score
	// must not drag the average toward 0).
	scored_count: string;
	// Rows whose passed verdict is non-null — the correct pass-rate denominator
	// (numeric-only judges emit score-only rows with no verdict).
	verdict_count: string;
	pass_count: string;
	fail_count: string;
	score_sum: string;
	cost: string;
	score_quantiles: number[];
};

/** Per-minute score rollup for one eval (the eval detail chart + stat cards).
 * Counts deduplicated `scores FINAL` (not the per-minute MV) so re-scored
 * targets aren't double-counted — see `evalListSummary` for the full rationale.
 * The chart's totals (scored/spend) are derived from these buckets, so they
 * must dedup the same way the list column does. */
export function queryScoreTimeseries(
	client: ClickHouseClient,
	params: { projectId: string; evalId: string; from: string; to: string },
): Promise<ScoreBucketRow[]> {
	return rows<ScoreBucketRow>(
		client,
		`SELECT
       toStartOfMinute(scored_at) AS bucket,
       count() AS score_count,
       countIf(isNotNull(score)) AS scored_count,
       countIf(isNotNull(passed)) AS verdict_count,
       countIf(passed = 1) AS pass_count,
       countIf(passed = 0) AS fail_count,
       sum(ifNull(score, 0)) AS score_sum,
       sum(cost) AS cost,
       quantilesTDigestIf(0.5, 0.95, 0.99)(toFloat32(ifNull(score, 0)), isNotNull(score)) AS score_quantiles
     FROM scores FINAL
     WHERE project_id = {projectId:String} AND eval_id = {evalId:String}
       AND scored_at >= {from:DateTime} AND scored_at < {to:DateTime}
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

export type EvalListSummaryRow = {
	eval_id: string;
	score_count: string;
	scored_count: string;
	verdict_count: string;
	pass_count: string;
	fail_count: string;
	score_sum: string;
	cost: string;
};

/**
 * Per-eval score rollup over [from, to) for the eval list table — one row per
 * eval that scored in the window, surfacing scored/pass-rate/avg-score/spend
 * the same way the single eval page does, but date-windowed.
 *
 * Counts deduplicated `scores FINAL` rather than the per-minute MV: the MV's
 * `count()` fires per insert, *before* ReplacingMergeTree collapses re-scores
 * of the same target (score_id = eval_id:target_id), so it overcounts whenever
 * a target is scored more than once. FINAL gives one row per unique target —
 * the same source the eval detail table (`listEvalScores`) counts, so the list
 * "Scored" column and the detail page agree. Windowed on `scored_at` to match.
 */
export function evalListSummary(
	client: ClickHouseClient,
	params: { projectId: string; from: string; to: string },
): Promise<EvalListSummaryRow[]> {
	return rows<EvalListSummaryRow>(
		client,
		`SELECT
       eval_id,
       count() AS score_count,
       countIf(isNotNull(score)) AS scored_count,
       countIf(isNotNull(passed)) AS verdict_count,
       countIf(passed = 1) AS pass_count,
       countIf(passed = 0) AS fail_count,
       sum(ifNull(score, 0)) AS score_sum,
       sum(cost) AS cost
     FROM scores FINAL
     WHERE project_id = {projectId:String}
       AND scored_at >= {from:DateTime} AND scored_at < {to:DateTime}
     GROUP BY eval_id`,
		{ projectId: params.projectId, from: params.from, to: params.to },
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

	// Collapse to one row per target before scoring. Two sources of duplicate
	// target_ids: trace-level evals key on trace_id but iterate the trace's
	// `agent` spans (a trace can have several), and `spans` is a
	// ReplacingMergeTree read without FINAL (un-merged re-ingests of the same
	// span linger). Without this, the worker would score — and bill the judge
	// for — the same target N times in one sweep; all N inserts share a
	// score_id and collapse in `scores FINAL`, but the spend is already gone.
	// `LIMIT 1 BY target_id` keeps the earliest-ingested row per target.
	return rows<EvalCandidateRow>(
		client,
		`SELECT
       target_id,
       trace_id,
       span_type,
       start_time_ms,
       input,
       output,
       metadata,
       ingested_at
     FROM (
       SELECT
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
       LIMIT 1 BY target_id
     )
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
	tool_catalog: string;
};

/** Sibling spans of a trace (for RAG context + tool-catalog extraction). */
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
       toUnixTimestamp64Milli(start_time) AS start_time_ms,
       tool_catalog
     FROM spans
     WHERE project_id = {projectId:String} AND trace_id = {traceId:String}
     ORDER BY start_time ASC`,
		{ projectId: params.projectId, traceId: params.traceId },
	);
}

export type ScoreAlertWindowRow = {
	score_count: string;
	scored_count: string;
	verdict_count: string;
	pass_count: string;
	fail_count: string;
	score_sum: string;
	score_quantiles: number[];
};

/**
 * Single-row score rollup over an alert's window for one eval. The evaluator
 * derives avg score (score_sum/scored_count) or pass rate
 * (pass_count/verdict_count) from it.
 */
export async function queryScoreAlertWindow(
	client: ClickHouseClient,
	params: { projectId: string; evalId: string; from: string; to: string },
): Promise<ScoreAlertWindowRow> {
	const result = await rows<ScoreAlertWindowRow>(
		client,
		`SELECT
       count() AS score_count,
       countIf(isNotNull(score)) AS scored_count,
       countIf(isNotNull(passed)) AS verdict_count,
       countIf(passed = 1) AS pass_count,
       countIf(passed = 0) AS fail_count,
       sum(ifNull(score, 0)) AS score_sum,
       quantilesTDigestIf(0.5, 0.95, 0.99)(toFloat32(ifNull(score, 0)), isNotNull(score)) AS score_quantiles
     FROM scores FINAL
     WHERE project_id = {projectId:String} AND eval_id = {evalId:String}
       AND scored_at >= {from:DateTime} AND scored_at < {to:DateTime}`,
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
			scored_count: "0",
			verdict_count: "0",
			pass_count: "0",
			fail_count: "0",
			score_sum: "0",
			score_quantiles: [0, 0, 0],
		}
	);
}

// ---------------------------------------------------------------------------
// Platform admin (hosted-operator view; not org-scoped)
// ---------------------------------------------------------------------------

export type PlatformUsageDayRow = {
	day: string;
	span_count: string;
	active_orgs: string;
};

/** Platform-wide spans/day + distinct active orgs from the daily usage rollup. */
export async function queryPlatformUsageByDay(
	client: ClickHouseClient,
	from: string,
): Promise<PlatformUsageDayRow[]> {
	return rows<PlatformUsageDayRow>(
		client,
		// No toString(day) alias here: aliasing over the real column would get
		// substituted into WHERE (alias wins), turning `day >= {from:Date}` into
		// a String/Date comparison. JSON output serializes Date as YYYY-MM-DD.
		`SELECT
       day,
       sum(span_count) AS span_count,
       uniqExact(org_id) AS active_orgs
     FROM usage_by_org_day
     WHERE day >= {from:Date}
     GROUP BY day
     ORDER BY day`,
		{ from },
	);
}

export type PlatformTopOrgRow = { org_id: string; span_count: string };

/** Highest-volume orgs by span count since `from` (YYYY-MM-DD). */
export async function queryPlatformTopOrgs(
	client: ClickHouseClient,
	from: string,
	limit = 10,
): Promise<PlatformTopOrgRow[]> {
	return rows<PlatformTopOrgRow>(
		client,
		`SELECT org_id, sum(span_count) AS span_count
     FROM usage_by_org_day
     WHERE day >= {from:Date} AND org_id != ''
     GROUP BY org_id
     ORDER BY span_count DESC
     LIMIT {limit:UInt32}`,
		{ from, limit },
	);
}

export type ClickHouseTableStatRow = {
	table: string;
	row_count: string;
	bytes_on_disk: string;
};

/** Per-table storage footprint of the active database (system.parts). */
export async function queryClickHouseTableStats(
	client: ClickHouseClient,
): Promise<ClickHouseTableStatRow[]> {
	return rows<ClickHouseTableStatRow>(
		client,
		`SELECT
       table,
       sum(rows) AS row_count,
       sum(bytes_on_disk) AS bytes_on_disk
     FROM system.parts
     WHERE active AND database = currentDatabase()
     GROUP BY table
     ORDER BY bytes_on_disk DESC`,
		{},
	);
}

export type ClickHouseDiskRow = {
	name: string;
	free_space: string;
	total_space: string;
};

/** Free/total bytes per ClickHouse disk (system.disks) — VM-fill o11y. */
export async function queryClickHouseDisks(
	client: ClickHouseClient,
): Promise<ClickHouseDiskRow[]> {
	return rows<ClickHouseDiskRow>(
		client,
		`SELECT name, free_space, total_space FROM system.disks`,
		{},
	);
}

export type PlatformErrorDayRow = {
	day: string;
	span_count: string;
	error_count: string;
};

/** Platform-wide span error counts per day (status = 'error'), from raw spans. */
export async function queryPlatformErrorsByDay(
	client: ClickHouseClient,
	from: string,
): Promise<PlatformErrorDayRow[]> {
	return rows<PlatformErrorDayRow>(
		client,
		`SELECT
       toString(toDate(start_time)) AS day,
       count() AS span_count,
       countIf(status = 'error') AS error_count
     FROM spans
     WHERE start_time >= {from:Date}
     GROUP BY day
     ORDER BY day`,
		{ from },
	);
}
