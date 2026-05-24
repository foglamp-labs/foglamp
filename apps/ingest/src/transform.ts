import type { SpanRow } from "@watchtower/clickhouse";
import type { IngestPayload } from "@watchtower/contracts";
import {
  EMPTY_BREAKDOWN,
  type PricingTable,
  priceSpan,
} from "@watchtower/cost";

import { matchCustomPrice } from "./customPricing";

type Rule = { pattern: string; price: import("@watchtower/cost").CustomPrice };

// Only model-bearing spans are priced. The `agent` root span and `tool` spans
// carry no model cost; pricing them too would double-count against the llm
// steps they wrap (trace_summary sums total_cost across all of a trace's spans).
const PRICED_SPAN_TYPES = new Set(["llm", "embedding"]);

/**
 * Flatten a validated ingest payload into ClickHouse span rows for one project,
 * computing cost per llm span. Trace-level ids and metadata are denormalized
 * onto every row (the span store indexes them per-row); span metadata is merged
 * over trace metadata, span winning on key conflicts.
 */
export function buildSpanRows(args: {
  payload: IngestPayload;
  projectId: string;
  table: PricingTable;
  rules: Rule[];
  now: number;
}): SpanRow[] {
  const { payload, projectId, table, rules, now } = args;
  const rows: SpanRow[] = [];

  for (const trace of payload.traces) {
    const traceMeta = trace.metadata ?? {};

    for (const span of trace.spans) {
      const usage = span.usage;
      const isPriced = PRICED_SPAN_TYPES.has(span.spanType);
      const priced = isPriced
        ? priceSpan({
            table,
            provider: span.provider,
            modelId: span.modelId,
            usage,
            custom: matchCustomPrice(rules, span.provider, span.modelId),
          })
        : null;
      const costs = priced?.costs ?? EMPTY_BREAKDOWN;

      rows.push({
        project_id: projectId,
        trace_id: trace.traceId,
        span_id: span.spanId,
        parent_span_id: span.parentSpanId ?? "",
        span_type: span.spanType,
        name: span.name,
        start_time: span.startTime,
        end_time: span.endTime,
        duration_ms: Math.max(0, span.endTime - span.startTime),
        status: span.status,
        error_message: span.errorMessage ?? "",
        provider: span.provider ?? "",
        model_id: span.modelId ?? "",
        priced_model_id: priced?.resolvedId ?? "",
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
        total_tokens: usage?.totalTokens ?? 0,
        reasoning_tokens: usage?.reasoningTokens ?? 0,
        cached_input_tokens: usage?.cachedInputTokens ?? 0,
        cache_write_input_tokens: usage?.cacheWriteInputTokens ?? 0,
        image_count: usage?.imageCount ?? 0,
        web_search_count: usage?.webSearchCount ?? 0,
        // Default a priced llm span to one request so per-request pricing and
        // the stored count agree with computeCost's `requestCount ?? 1`.
        request_count: usage?.requestCount ?? (isPriced ? 1 : 0),
        ttft_ms: span.ttftMs == null ? null : Math.round(span.ttftMs),
        prompt_cost: costs.promptCost,
        completion_cost: costs.completionCost,
        request_cost: costs.requestCost,
        image_cost: costs.imageCost,
        web_search_cost: costs.webSearchCost,
        internal_reasoning_cost: costs.internalReasoningCost,
        cache_read_cost: costs.cacheReadCost,
        cache_write_cost: costs.cacheWriteCost,
        total_cost: costs.totalCost,
        pricing_source: priced?.source ?? "",
        // Only stamp a priced_at when a price actually resolved.
        priced_at: priced?.source ? now : null,
        agent_name: trace.agentName ?? "",
        workflow_name: trace.workflowName ?? "",
        workflow_run_id: trace.workflowRunId ?? "",
        session_id: trace.sessionId ?? "",
        metadata: { ...traceMeta, ...(span.metadata ?? {}) },
        input: span.input ?? "",
        output: span.output ?? "",
      });
    }
  }

  return rows;
}
