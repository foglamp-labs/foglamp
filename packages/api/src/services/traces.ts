import {
  getCustomerDisplays,
  getSessionTraceNeighbors,
  getTraceAggregate,
  getTraceRootInputs,
  getTraceSpans,
  listTraces,
  queryMetadataKeys,
  queryMetadataValues,
  queryTraceMetadataValues,
  type SortDir,
  traceComparison,
  traceListSummary,
  type TraceSortField,
} from "@foglamp/clickhouse";

import { userMessageSnippet } from "../lib/user-message";
import { decimalOrNull, finite, num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";
import { promptVersionForHash, promptVersionHashes } from "./promptVersions";

// Max chars of the extracted user message used as a trace's display title
// (list rows and the detail header) — one line of context, not a transcript.
const USER_MESSAGE_SNIPPET_CAP = 300;

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
    customerId?: string;
    modelId?: string;
    errorsOnly?: boolean;
    /** Filter to traces carrying metadata[key] = value; the key alone also
     * decorates each trace with its value (the pinned metadata column). */
    metadataKey?: string;
    metadataValue?: string;
    /** Keep only runs of this inferred prompt version. */
    promptVersionId?: string;
    sort?: { field: TraceSortField; dir: SortDir };
    limit?: number;
    offset?: number;
  },
) {
  await requireProjectAccess(db, userId, input.projectId);
  // A prompt version is a set of root-span prompt hashes; a version that no
  // longer exists matches nothing (empty list) rather than everything.
  const promptHashes = input.promptVersionId
    ? ((await promptVersionHashes(db, {
        projectId: input.projectId,
        versionId: input.promptVersionId,
      }))?.hashes ?? [])
    : undefined;
  const filters = {
    projectId: input.projectId,
    from: input.from ? toClickHouseDateTime(input.from) : undefined,
    to: input.to ? toClickHouseDateTime(input.to) : undefined,
    agentName: input.agentName,
    traceName: input.traceName,
    workflowName: input.workflowName,
    customerId: input.customerId,
    modelId: input.modelId,
    errorsOnly: input.errorsOnly,
    metadataKey: input.metadataKey,
    metadataValue: input.metadataValue,
    promptHashes,
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
  // Decorate the page's traces with customer display fields (name/avatar): the
  // rows carry only customer_id, so resolve the distinct ids against the
  // customers dimension in one lookup and map them back.
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
  // The pinned metadata column: resolve the chosen key's value for this page's
  // traces (bounded id-list lookup) alongside the customer display decoration
  // and each trace's root-span input (mined for a user-message title snippet).
  const [dims, metaRows, rootInputs] = await Promise.all([
    getCustomerDisplays(ch, { projectId: input.projectId, customerIds }),
    input.metadataKey
      ? queryTraceMetadataValues(ch, {
          projectId: input.projectId,
          key: input.metadataKey,
          traceIds: rows.map((r) => r.trace_id),
        })
      : Promise.resolve([]),
    getTraceRootInputs(ch, {
      projectId: input.projectId,
      traceIds: rows.map((r) => r.trace_id),
    }),
  ]);
  const customerById = new Map(dims.map((d) => [d.customer_id, d]));
  const metaByTrace = new Map(metaRows.map((m) => [m.trace_id, m.value]));
  const snippetByTrace = new Map(
    rootInputs.map((r) => [
      r.trace_id,
      userMessageSnippet(r.input, USER_MESSAGE_SNIPPET_CAP),
    ]),
  );
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
      userMessage: snippetByTrace.get(r.trace_id) ?? null,
      agentName: r.agent_name || null,
      workflowName: r.workflow_name || null,
      workflowRunId: r.workflow_run_id || null,
      sessionId: r.session_id || null,
      customerId: r.customer_id || null,
      customerName: customerById.get(r.customer_id)?.customer_name || null,
      customerImageUrl: customerById.get(r.customer_id)?.customer_image_url || null,
      startTime: r.trace_start,
      endTime: r.trace_end,
      durationMs: num(r.duration_ms),
      spanCount: num(r.span_count),
      llmSpanCount: num(r.llm_span_count),
      errorCount: num(r.error_count),
      abortedCount: num(r.aborted_count),
      totalCost: decimalOrNull(r.total_cost),
      pricedSpanCount: num(r.priced_span_count),
      totalTokens: num(r.total_tokens),
      models: r.models ?? [],
      metadataValue: input.metadataKey
        ? metaByTrace.get(r.trace_id) || null
        : null,
    })),
  };
}

/** Distinct metadata keys in the window (most-frequent first) — the pinned
 * column / metadata filter's key picker. */
export async function getMetadataKeys(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; from: Date; to: Date },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await queryMetadataKeys(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
  });
  return rows.map((r) => r.key);
}

const METADATA_VALUE_LIMIT = 50;

/** Top values for one metadata key (most-frequent first), capped — `truncated`
 * tells the UI to offer free-text entry beyond the listed values. */
export async function getMetadataValues(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; key: string; from: Date; to: Date },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await queryMetadataValues(ch, {
    projectId: input.projectId,
    key: input.key,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
    limit: METADATA_VALUE_LIMIT + 1,
  });
  return {
    values: rows.slice(0, METADATA_VALUE_LIMIT).map((r) => r.value),
    truncated: rows.length > METADATA_VALUE_LIMIT,
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
    reasoningDurationMs: s.reasoning_duration_ms === null ? null : num(s.reasoning_duration_ms),
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
    systemPrompt: s.system_prompt || null,
    promptHash: s.prompt_hash || null,
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
  const customerId = firstNonEmpty((r) => r.customer_id);
  const customerDim = customerId
    ? (await getCustomerDisplays(ch, { projectId: input.projectId, customerIds: [customerId] }))[0]
    : undefined;
  // Rows arrive ordered by start time, so the first agent row is the trace's
  // root turn — its input carries the user message the header titles with.
  const rootAgent = rows.find((r) => r.span_type === "agent");
  // Which inferred prompt version the run belongs to (null until the version
  // job has folded this run, or when no system prompt was recorded).
  const promptVersion =
    rootAgent?.prompt_hash && rootAgent.agent_name
      ? await promptVersionForHash(db, {
          projectId: input.projectId,
          agentName: rootAgent.agent_name,
          hash: rootAgent.prompt_hash,
        })
      : null;
  return {
    traceId: input.traceId,
    traceName: firstNonEmpty((r) => r.trace_name),
    userMessage: userMessageSnippet(rootAgent?.input, USER_MESSAGE_SNIPPET_CAP),
    agentName: firstNonEmpty((r) => r.agent_name),
    workflowName: firstNonEmpty((r) => r.workflow_name),
    workflowRunId: firstNonEmpty((r) => r.workflow_run_id),
    sessionId: firstNonEmpty((r) => r.session_id),
    customer: customerId
      ? {
          id: customerId,
          name: customerDim?.customer_name || null,
          imageUrl: customerDim?.customer_image_url || null,
        }
      : null,
    promptVersion,
    spans,
  };
}

/**
 * The traces on either side of this one within its session — "previous /
 * next turn" on the trace detail page. Traces outside a session never reach
 * here; the caller gates on `sessionId`.
 */
export async function getSessionNeighbors(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; traceId: string; sessionId: string },
) {
  await requireProjectAccess(db, userId, input.projectId);
  return getSessionTraceNeighbors(ch, input);
}

/** Traces older than this don't say anything useful about how the agent behaves
 * today — models, prompts and tool sets all move faster than that. */
const COMPARISON_WINDOW_DAYS = 7;
/** Below this, a percentile is noise wearing a precise-looking number — which is
 * worst in exactly the new-project case where someone is forming a first
 * impression. */
const COMPARISON_MIN_TRACES = 20;

/**
 * Where this trace sits among its agent's recent traces, as percentiles — the
 * "p91 · this agent" hint on the header stat cards.
 *
 * Returns null rather than a number whenever the comparison would be
 * misleading: no agent name (we will not rank a trace against unrelated
 * traces), or too small a population. Per-metric percentiles are null
 * independently, so an unpriced trace still gets its duration rank.
 */
export async function getTraceComparison(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; traceId: string },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const empty = {
    agentName: null,
    traceCount: 0,
    durationPercentile: null,
    costPercentile: null,
    tokenPercentile: null,
  };
  const self = (await getTraceAggregate(ch, input))[0];
  const agentName = self?.agent_name || null;
  if (!self || !agentName) return empty;
  const from = new Date(Date.now() - COMPARISON_WINDOW_DAYS * 86_400_000);
  const row = (
    await traceComparison(ch, {
      projectId: input.projectId,
      agentName,
      from: toClickHouseDateTime(from),
      durationMs: num(self.duration_ms),
      cost: self.total_cost,
      tokens: num(self.total_tokens),
    })
  )[0];
  const traceCount = num(row?.trace_count);
  if (traceCount < COMPARISON_MIN_TRACES) return { ...empty, agentName };
  // Percent of the population at or below this trace's value. Rounded to a whole
  // percentile — the extra digits would imply a precision this doesn't have.
  const pct = (rank: number, total: number) =>
    total > 0 ? Math.round((rank / total) * 100) : null;
  const pricedCount = num(row?.priced_count);
  return {
    agentName,
    traceCount,
    durationPercentile: pct(num(row?.duration_rank), traceCount),
    // Unpriced traces sit outside the cost population entirely, so a trace with
    // no cost gets no cost rank rather than a misleading "p1".
    costPercentile:
      Number(self.total_cost) > 0
        ? pct(num(row?.cost_rank), pricedCount)
        : null,
    tokenPercentile: pct(num(row?.token_rank), traceCount),
  };
}
