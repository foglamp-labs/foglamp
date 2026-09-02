import {
	type SortDir,
	type WorkflowRunSortField,
	type WorkflowSortField,
	getCustomerDisplays,
	getTraceRootInputs,
	getWorkflowRunHeadlines,
	listTracesByWorkflowRun,
	listWorkflowRuns,
	listWorkflows,
	queryWorkflowNames,
	workflowListSummary,
	workflowRunSummary,
	workflowRunTimeseries,
} from "@foglamp/clickhouse";

import {
	decimalOrNull,
	finite,
	num,
	pickBucketSec,
	quantiles,
	toClickHouseDateTime,
} from "../lib/util";
import type { Ch, Db } from "../types";
import { userMessageSnippet } from "../lib/user-message";
import { requireProjectAccess } from "./access";

// Same headline cap as the traces list (see services/traces.ts).
const USER_MESSAGE_SNIPPET_CAP = 300;

/**
 * Workflows grouped by name (the Workflows grid). `workflowName: null` is the
 * "Ungrouped" bucket (runs with no workflow name); the UI labels it. Returns a
 * page of rows plus a single-row summary over the whole filtered set (header
 * totals + cost quintile thresholds for the heatmap). Mirrors `getTraceList`.
 */
export async function getWorkflowList(
	db: Db,
	ch: Ch,
	userId: string,
	input: {
		projectId: string;
		from?: Date;
		to?: Date;
		workflowName?: string;
		errorsOnly?: boolean;
		sort?: { field: WorkflowSortField; dir: SortDir };
		limit?: number;
		offset?: number;
	},
) {
	await requireProjectAccess(db, userId, input.projectId);
	const filters = {
		projectId: input.projectId,
		from: input.from ? toClickHouseDateTime(input.from) : undefined,
		to: input.to ? toClickHouseDateTime(input.to) : undefined,
		workflowName: input.workflowName,
		errorsOnly: input.errorsOnly,
	};
	const [rows, summaryRows] = await Promise.all([
		listWorkflows(ch, {
			...filters,
			sort: input.sort,
			limit: input.limit,
			offset: input.offset,
		}),
		workflowListSummary(ch, filters),
	]);
	const s = summaryRows[0];
	return {
		// 20/40/60/80th percentile cost thresholds; finite values only.
		costQuantiles: finite(s?.cost_q),
		summary: {
			workflowCount: num(s?.workflow_count),
			runCount: num(s?.run_count),
			errorWorkflowCount: num(s?.error_workflow_count),
			totalCost: s ? Number(s.total_cost) : 0,
			totalTokens: num(s?.total_tokens),
		},
		workflows: rows.map((r) => ({
			workflowName: r.workflow_name || null,
			runCount: num(r.run_count),
			traceCount: num(r.trace_count),
			spanCount: num(r.span_count),
			errorCount: num(r.error_count),
			totalCost: decimalOrNull(r.total_cost),
			pricedSpanCount: num(r.priced_span_count),
			totalTokens: num(r.total_tokens),
			firstRun: r.first_run,
			lastRun: r.last_run,
		})),
	};
}

/**
 * Distinct workflow names with activity in a window — for the workflow-filter
 * dropdown on the traces table.
 */
export async function getWorkflowNames(
	db: Db,
	ch: Ch,
	userId: string,
	input: { projectId: string; from: Date; to: Date },
) {
	await requireProjectAccess(db, userId, input.projectId);
	const rows = await queryWorkflowNames(ch, {
		projectId: input.projectId,
		from: toClickHouseDateTime(input.from),
		to: toClickHouseDateTime(input.to),
	});
	return rows.map((r) => r.workflow_name);
}

export async function getWorkflowRunList(
	db: Db,
	ch: Ch,
	userId: string,
	input: {
		projectId: string;
		workflowRunId?: string;
		workflowName?: string;
		from?: Date;
		to?: Date;
		errorsOnly?: boolean;
		sort?: { field: WorkflowRunSortField; dir: SortDir };
		limit?: number;
		offset?: number;
	},
) {
	await requireProjectAccess(db, userId, input.projectId);
	const runs = await listWorkflowRuns(ch, {
		projectId: input.projectId,
		workflowRunId: input.workflowRunId,
		workflowName: input.workflowName,
		from: input.from ? toClickHouseDateTime(input.from) : undefined,
		to: input.to ? toClickHouseDateTime(input.to) : undefined,
		errorsOnly: input.errorsOnly,
		sort: input.sort,
		limit: input.limit,
		offset: input.offset,
	});

	// Decorate the page with a headline: the run's first trace (its user message
	// titles the row), last trace, and the agents in first-run order.
	const headlines = await getWorkflowRunHeadlines(ch, {
		projectId: input.projectId,
		runIds: runs.map((r) => r.workflow_run_id),
	});
	const headlineByRun = new Map(headlines.map((h) => [h.workflow_run_id, h]));
	const rootInputs = await getTraceRootInputs(ch, {
		projectId: input.projectId,
		traceIds: headlines.map((h) => h.first_trace_id).filter(Boolean),
	});
	const snippetByTrace = new Map(
		rootInputs.map((r) => [
			r.trace_id,
			userMessageSnippet(r.input, USER_MESSAGE_SNIPPET_CAP),
		]),
	);

	return runs.map((r) => {
		const h = headlineByRun.get(r.workflow_run_id);
		return {
			workflowRunId: r.workflow_run_id,
			workflowName: r.workflow_name || null,
			userMessage: h ? (snippetByTrace.get(h.first_trace_id) ?? null) : null,
			agentNames: h?.agent_names ?? [],
			firstTraceId: h?.first_trace_id || null,
			lastTraceId: h?.last_trace_id || null,
			startTime: r.run_start,
			endTime: r.run_end,
			durationMs: num(r.duration_ms),
			traceCount: num(r.trace_count),
			spanCount: num(r.span_count),
			errorCount: num(r.error_count),
			totalCost: decimalOrNull(r.total_cost),
			pricedSpanCount: num(r.priced_span_count),
			totalTokens: num(r.total_tokens),
		};
	});
}

/** Stat-strip rollup over one workflow's runs in the window: totals + run-count,
 * error rate, and run-duration percentiles. `runCount` is the filtered total
 * (across all pages), so the UI uses it to size pagination. */
export async function getWorkflowRunSummary(
	db: Db,
	ch: Ch,
	userId: string,
	input: {
		projectId: string;
		workflowName?: string;
		from?: Date;
		to?: Date;
		errorsOnly?: boolean;
	},
) {
	await requireProjectAccess(db, userId, input.projectId);
	const [s] = await workflowRunSummary(ch, {
		projectId: input.projectId,
		workflowName: input.workflowName,
		from: input.from ? toClickHouseDateTime(input.from) : undefined,
		to: input.to ? toClickHouseDateTime(input.to) : undefined,
		errorsOnly: input.errorsOnly,
	});
	const runCount = num(s?.run_count);
	const erroredRunCount = num(s?.errored_run_count);
	return {
		runCount,
		erroredRunCount,
		errorCount: num(s?.error_count),
		// Fraction of runs with ≥1 errored span (0..1); null when no runs.
		errorRate: runCount > 0 ? erroredRunCount / runCount : null,
		totalCost: decimalOrNull(s?.total_cost),
		totalTokens: num(s?.total_tokens),
		traceCount: num(s?.trace_count),
		durationMs: quantiles(s?.duration_quantiles),
		// 20/40/60/80th percentile thresholds for the runs-table heat cells.
		costQuantiles: finite(s?.cost_q),
		durationQuantiles: finite(s?.dur_q),
	};
}

/** Runs bucketed over time for the workflow detail trend chart. */
export async function getWorkflowRunTimeseries(
	db: Db,
	ch: Ch,
	userId: string,
	input: {
		projectId: string;
		workflowName?: string;
		from: Date;
		to: Date;
		errorsOnly?: boolean;
	},
) {
	await requireProjectAccess(db, userId, input.projectId);
	const bucketSec = pickBucketSec(input.to.getTime() - input.from.getTime());
	const rows = await workflowRunTimeseries(ch, {
		projectId: input.projectId,
		workflowName: input.workflowName,
		from: toClickHouseDateTime(input.from),
		to: toClickHouseDateTime(input.to),
		errorsOnly: input.errorsOnly,
		bucketSec,
	});
	return rows.map((r) => ({
		bucket: r.bucket,
		runCount: num(r.run_count),
		erroredRunCount: num(r.errored_run_count),
		totalCost: decimalOrNull(r.total_cost),
		durationMs: quantiles(r.duration_quantiles),
	}));
}

/** Traces inside one run (the run timeline). */
export async function getWorkflowRunDetail(
	db: Db,
	ch: Ch,
	userId: string,
	input: { projectId: string; workflowRunId: string },
) {
	await requireProjectAccess(db, userId, input.projectId);

	const traces = await listTracesByWorkflowRun(ch, input);
	// Decorate with customer display fields (name/avatar), like the traces list.
	const customerIds = [...new Set(traces.map((r) => r.customer_id).filter(Boolean))];
	const dims =
		customerIds.length > 0
			? await getCustomerDisplays(ch, { projectId: input.projectId, customerIds })
			: [];
	const customerById = new Map(dims.map((d) => [d.customer_id, d]));
	return {
		workflowRunId: input.workflowRunId,
		traces: traces.map((r) => ({
			sessionId: r.session_id || null,
			customerId: r.customer_id || null,
			customerName: customerById.get(r.customer_id)?.customer_name || null,
			customerImageUrl: customerById.get(r.customer_id)?.customer_image_url || null,
			models: r.models ?? [],
			traceId: r.trace_id,
			traceName: r.trace_name || null,
			agentName: r.agent_name || null,
			workflowName: r.workflow_name || null,
			startTime: r.trace_start,
			endTime: r.trace_end,
			durationMs: num(r.duration_ms),
			spanCount: num(r.span_count),
			errorCount: num(r.error_count),
			abortedCount: num(r.aborted_count),
			totalCost: decimalOrNull(r.total_cost),
			totalTokens: num(r.total_tokens),
		})),
	};
}
