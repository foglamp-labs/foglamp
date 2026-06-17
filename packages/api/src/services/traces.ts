import {
  getTraceSpans,
  listTraces,
  type SortDir,
  traceListSummary,
  type TraceSortField,
} from "@foglamp/clickhouse";

import { decimalOrNull, finite, num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

// Generation tokens/sec. Prefer the AI SDK's own measured rate
// (`effective_output_tps`, present on v7 beta/canary spans) over our derivation:
// output tokens over the active streaming window (duration minus
// time-to-first-token). Returns null when neither is available (non-streaming,
// zero-duration, or no output).
function generationTps(
  effectiveOutputTps: number | null,
  outputTokens: number,
  durationMs: number,
  ttftMs: number | null,
): number | null {
  if (effectiveOutputTps !== null && effectiveOutputTps > 0) return effectiveOutputTps;
  if (outputTokens <= 0) return null;
  const windowMs = durationMs - (ttftMs ?? 0);
  if (windowMs <= 0) return null;
  return outputTokens / (windowMs / 1000);
}

export async function getTraceList(
  db: Db,
  ch: Ch,
  userId: string,
  input: {
    projectId: string;
    from?: Date;
    to?: Date;
    agentName?: string;
    traceName?: string;
    workflowName?: string;
    errorsOnly?: boolean;
    sort?: { field: TraceSortField; dir: SortDir };
    limit?: number;
    offset?: number;
  },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const filters = {
    projectId: input.projectId,
    from: input.from ? toClickHouseDateTime(input.from) : undefined,
    to: input.to ? toClickHouseDateTime(input.to) : undefined,
    agentName: input.agentName,
    traceName: input.traceName,
    workflowName: input.workflowName,
    errorsOnly: input.errorsOnly,
  };
  // Fetch the page and, in parallel, a single-row rollup over the whole filtered
  // set — the cost/duration quintile thresholds drive the heatmaps (percentile-
  // based, so they reflect all traces, not just this page) and the totals feed
  // the header strip + the "N traces" toolbar count.
  const [rows, summaryRows] = await Promise.all([
    listTraces(ch, {
      ...filters,
      sort: input.sort,
      limit: input.limit,
      offset: input.offset,
    }),
    traceListSummary(ch, filters),
  ]);
  const s = summaryRows[0];
  return {
    // 20/40/60/80th percentile thresholds; finite values only.
    costQuantiles: finite(s?.cost_q),
    durationQuantiles: finite(s?.dur_q),
    summary: {
      traceCount: num(s?.trace_count),
      totalCost: s ? Number(s.total_cost) : 0,
      errorTraceCount: num(s?.error_trace_count),
      durationP95: s ? num(s.duration_p95) : 0,
    },
    traces: rows.map((r) => ({
      traceId: r.trace_id,
      traceName: r.trace_name || null,
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
      models: r.models ?? [],
    })),
  };
}

export async function getTraceDetail(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; traceId: string },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await getTraceSpans(ch, input);
  // Trace-level context is stable across a trace's spans; pick the first
  // non-empty value so the detail header can link back to its session/workflow.
  const firstNonEmpty = (pick: (r: (typeof rows)[number]) => string) => {
    for (const r of rows) {
      const v = pick(r);
      if (v) return v;
    }
    return null;
  };
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
    reasoningTokens: num(s.reasoning_tokens),
    cachedInputTokens: num(s.cached_input_tokens),
    cacheWriteInputTokens: num(s.cache_write_input_tokens),
    imageCount: num(s.image_count),
    webSearchCount: num(s.web_search_count),
    requestCount: num(s.request_count),
    ttftMs: s.ttft_ms === null ? null : num(s.ttft_ms),
    chunkOffsets: (s.chunk_offsets ?? []).map(num),
    chunkTokens: (s.chunk_tokens ?? []).map(num),
    reasoningOffsets: (s.reasoning_offsets ?? []).map(num),
    reasoningChunkTokens: (s.reasoning_chunk_tokens ?? []).map(num),
    reasoningDurationMs: s.reasoning_duration_ms === null ? null : num(s.reasoning_duration_ms),
    // Generation throughput: the SDK's measured rate when present, else output
    // tokens over the streaming window (excluding the TTFT wait). Null when
    // there's no measurable window.
    tps: generationTps(s.effective_output_tps, num(s.output_tokens), num(s.duration_ms), s.ttft_ms),
    totalCost: decimalOrNull(s.total_cost),
    // Per-dimension cost breakdown (null when unpriced/zero); these sum to
    // totalCost and drive the span-detail breakdown panel.
    promptCost: decimalOrNull(s.prompt_cost),
    completionCost: decimalOrNull(s.completion_cost),
    requestCost: decimalOrNull(s.request_cost),
    imageCost: decimalOrNull(s.image_cost),
    webSearchCost: decimalOrNull(s.web_search_cost),
    reasoningCost: decimalOrNull(s.internal_reasoning_cost),
    cacheReadCost: decimalOrNull(s.cache_read_cost),
    cacheWriteCost: decimalOrNull(s.cache_write_cost),
    pricingSource: s.pricing_source || null,
    pricedModelId: s.priced_model_id || null,
    pricedAt: s.priced_at || null,
    metadata: s.metadata ?? {},
    input: s.input || null,
    output: s.output || null,
    toolCatalog: s.tool_catalog || null,
    // Pure model-call time; tool time is the remainder of the span window.
    modelCallMs: s.model_call_ms === null ? null : num(s.model_call_ms),
    // Official AI SDK step `performance` stats (v7 beta/canary; null on older v7,
    // the v4-v6 wrap path, and — for the streaming-only fields — non-streamed
    // steps). Captured for storage/API now; not yet surfaced in the UI.
    responseTimeMs: s.response_time_ms === null ? null : num(s.response_time_ms),
    effectiveOutputTps: s.effective_output_tps,
    effectiveTotalTps: s.effective_total_tps,
    outputTps: s.output_tps,
    inputTps: s.input_tps,
    chunkJitter:
      s.chunk_jitter_min === null &&
      s.chunk_jitter_median === null &&
      s.chunk_jitter_max === null
        ? null
        : {
            min: s.chunk_jitter_min === null ? null : num(s.chunk_jitter_min),
            p10: s.chunk_jitter_p10 === null ? null : num(s.chunk_jitter_p10),
            median: s.chunk_jitter_median === null ? null : num(s.chunk_jitter_median),
            avg: s.chunk_jitter_avg,
            p90: s.chunk_jitter_p90 === null ? null : num(s.chunk_jitter_p90),
            max: s.chunk_jitter_max === null ? null : num(s.chunk_jitter_max),
          },
    systemFingerprint: s.system_fingerprint || null,
    safetyMetadata: s.safety_metadata || null,
    sources: s.sources || null,
    // Normalized rate-limit headroom (null when the provider didn't report it).
    rateLimit:
      s.rate_limit_requests_limit === null &&
      s.rate_limit_requests_remaining === null &&
      s.rate_limit_tokens_limit === null &&
      s.rate_limit_tokens_remaining === null
        ? null
        : {
            requestsLimit:
              s.rate_limit_requests_limit === null ? null : num(s.rate_limit_requests_limit),
            requestsRemaining:
              s.rate_limit_requests_remaining === null
                ? null
                : num(s.rate_limit_requests_remaining),
            requestsResetMs:
              s.rate_limit_requests_reset_ms === null
                ? null
                : num(s.rate_limit_requests_reset_ms),
            tokensLimit:
              s.rate_limit_tokens_limit === null ? null : num(s.rate_limit_tokens_limit),
            tokensRemaining:
              s.rate_limit_tokens_remaining === null
                ? null
                : num(s.rate_limit_tokens_remaining),
            tokensResetMs:
              s.rate_limit_tokens_reset_ms === null ? null : num(s.rate_limit_tokens_reset_ms),
          },
  }));
  return {
    traceId: input.traceId,
    agentName: firstNonEmpty((r) => r.agent_name),
    workflowName: firstNonEmpty((r) => r.workflow_name),
    workflowRunId: firstNonEmpty((r) => r.workflow_run_id),
    sessionId: firstNonEmpty((r) => r.session_id),
    spans,
  };
}
