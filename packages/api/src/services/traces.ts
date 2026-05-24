import { getTraceSpans, listTraces } from "@watchtower/clickhouse";

import { decimalOrNull, num } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

export async function getTraceList(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; limit?: number; offset?: number },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await listTraces(ch, input);
  return rows.map((r) => ({
    traceId: r.trace_id,
    agentName: r.agent_name || null,
    workflowName: r.workflow_name || null,
    workflowRunId: r.workflow_run_id || null,
    sessionId: r.session_id || null,
    startTime: r.trace_start,
    endTime: r.trace_end,
    durationMs: num(r.duration_ms),
    spanCount: num(r.span_count),
    llmSpanCount: num(r.llm_span_count),
    errorCount: num(r.error_count),
    totalCost: decimalOrNull(r.total_cost),
    pricedSpanCount: num(r.priced_span_count),
    totalTokens: num(r.total_tokens),
  }));
}

export async function getTraceDetail(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; traceId: string },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await getTraceSpans(ch, input);
  const spans = rows.map((s) => ({
    spanId: s.span_id,
    parentSpanId: s.parent_span_id || null,
    spanType: s.span_type,
    name: s.name,
    startTime: s.start_time,
    endTime: s.end_time,
    durationMs: num(s.duration_ms),
    status: s.status,
    errorMessage: s.error_message || null,
    provider: s.provider || null,
    modelId: s.model_id || null,
    inputTokens: num(s.input_tokens),
    outputTokens: num(s.output_tokens),
    totalTokens: num(s.total_tokens),
    ttftMs: s.ttft_ms === null ? null : num(s.ttft_ms),
    totalCost: decimalOrNull(s.total_cost),
    pricingSource: s.pricing_source || null,
    metadata: s.metadata ?? {},
    input: s.input || null,
    output: s.output || null,
  }));
  return { traceId: input.traceId, spans };
}
