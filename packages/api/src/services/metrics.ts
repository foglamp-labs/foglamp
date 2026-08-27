import {
  type ProjectSummaryRow,
  type ScoreSummaryRow,
  queryCostTimeseriesByCategory,
  queryMetricsTimeseries,
  queryMetricsTimeseriesByModel,
  queryModelBreakdown,
  queryProjectScoreSummary,
  queryProjectSummary,
  queryToolBreakdown,
} from "@foglamp/clickhouse";

import {
  decimalOrNull,
  num,
  pickBucketSec,
  quantiles,
  toClickHouseDateTime,
} from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";
import { evalPassThresholds } from "./evals";

export type MetricsFilter = {
  projectId: string;
  from: Date;
  to: Date;
  spanType?: string;
  modelId?: string;
  agentName?: string;
};

export async function getTimeseries(
  db: Db,
  ch: Ch,
  userId: string,
  input: MetricsFilter,
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await queryMetricsTimeseries(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
    bucketSec: pickBucketSec(input.to.getTime() - input.from.getTime()),
    spanType: input.spanType,
    modelId: input.modelId,
    agentName: input.agentName,
  });
  return rows.map((r) => ({
    bucket: r.bucket,
    spanCount: num(r.span_count),
    errorCount: num(r.error_count),
    totalCost: decimalOrNull(r.total_cost),
    pricedSpanCount: num(r.priced_span_count),
    totalTokens: num(r.total_tokens),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    latencyMs: quantiles(r.duration_quantiles),
    ttftMs: quantiles(r.ttft_quantiles),
  }));
}

export async function getModelBreakdown(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; from: Date; to: Date },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await queryModelBreakdown(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
  });
  return rows.map((r) => ({
    modelId: r.model_id || "(unknown)",
    spanCount: num(r.span_count),
    totalCost: decimalOrNull(r.total_cost),
    pricedSpanCount: num(r.priced_span_count),
    totalTokens: num(r.total_tokens),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    latencyMs: quantiles(r.duration_quantiles),
  }));
}

function mapSummary(s: ProjectSummaryRow, score?: ScoreSummaryRow) {
  const llmSpans = num(s.llm_span_count);
  const priced = num(s.priced_span_count);
  const passes = num(score?.pass_count);
  const checks = passes + num(score?.fail_count);
  return {
    // Pass rate over scored pass/fail checks (0..1); null when none were scored.
    // Covers the sampled subset only, not all traffic.
    passRate: checks > 0 ? passes / checks : null,
    checkCount: checks,
    spanCount: num(s.span_count),
    llmSpanCount: llmSpans,
    errorCount: num(s.error_count),
    totalCost: decimalOrNull(s.total_cost),
    pricedSpanCount: priced,
    totalTokens: num(s.total_tokens),
    inputTokens: num(s.input_tokens),
    outputTokens: num(s.output_tokens),
    // Fraction of llm spans that received a price (0..1); null when no llm spans.
    costCoverage: llmSpans > 0 ? priced / llmSpans : null,
    // Fraction of spans that errored (0..1); null when no spans.
    errorRate:
      num(s.span_count) > 0 ? num(s.error_count) / num(s.span_count) : null,
    latencyMs: quantiles(s.duration_quantiles),
    ttftMs: quantiles(s.ttft_quantiles),
  };
}

export type MetricsSummary = ReturnType<typeof mapSummary>;

/**
 * Window totals plus the equal-length window immediately before it, so the UI
 * can show period-over-period deltas.
 */
export async function getSummary(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; from: Date; to: Date },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const windowMs = input.to.getTime() - input.from.getTime();
  const prevFrom = new Date(input.from.getTime() - windowMs);
  // Pass/fail for scored judges is derived from each eval's threshold.
  const thresholds = await evalPassThresholds(db, input.projectId);
  const [current, previous, curScore, prevScore] = await Promise.all([
    queryProjectSummary(ch, {
      projectId: input.projectId,
      from: toClickHouseDateTime(input.from),
      to: toClickHouseDateTime(input.to),
    }),
    queryProjectSummary(ch, {
      projectId: input.projectId,
      from: toClickHouseDateTime(prevFrom),
      to: toClickHouseDateTime(input.from),
    }),
    queryProjectScoreSummary(ch, {
      projectId: input.projectId,
      from: toClickHouseDateTime(input.from),
      to: toClickHouseDateTime(input.to),
      thresholds,
    }),
    queryProjectScoreSummary(ch, {
      projectId: input.projectId,
      from: toClickHouseDateTime(prevFrom),
      to: toClickHouseDateTime(input.from),
      thresholds,
    }),
  ]);
  return {
    current: mapSummary(current, curScore),
    previous: mapSummary(previous, prevScore),
  };
}

export async function getCostTimeseriesByModel(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; from: Date; to: Date },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await queryMetricsTimeseriesByModel(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
    bucketSec: pickBucketSec(input.to.getTime() - input.from.getTime()),
  });
  return rows.map((r) => ({
    bucket: r.bucket,
    modelId: r.model_id || "(unknown)",
    totalCost: decimalOrNull(r.total_cost),
    totalTokens: num(r.total_tokens),
    spanCount: num(r.span_count),
  }));
}

/**
 * Per-tool rollup for the Tools breakdown card: call volume, error/abort
 * counts, and latency quantiles per tool name, most-called first, optionally
 * scoped to one agent or workflow (mirrors `getCostTimeseriesByCategory`).
 */
export async function getToolBreakdown(
  db: Db,
  ch: Ch,
  userId: string,
  input: {
    projectId: string;
    from: Date;
    to: Date;
    agentName?: string;
    workflowName?: string;
  },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await queryToolBreakdown(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
    agentName: input.agentName,
    workflowName: input.workflowName,
  });
  return rows.map((r) => ({
    toolName: r.name,
    callCount: num(r.call_count),
    errorCount: num(r.error_count),
    abortedCount: num(r.aborted_count),
    runCount: num(r.run_count),
    totalRunCount: num(r.total_run_count),
    latencyMs: quantiles(r.duration_quantiles),
  }));
}

export async function getCostTimeseriesByCategory(
  db: Db,
  ch: Ch,
  userId: string,
  input: {
    projectId: string;
    from: Date;
    to: Date;
    agentName?: string;
    workflowName?: string;
  },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await queryCostTimeseriesByCategory(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
    bucketSec: pickBucketSec(input.to.getTime() - input.from.getTime()),
    agentName: input.agentName,
    workflowName: input.workflowName,
  });
  return rows.map((r) => ({
    bucket: r.bucket,
    inputCost: decimalOrNull(r.prompt_cost) ?? 0,
    outputCost: decimalOrNull(r.completion_cost) ?? 0,
    cacheReadCost: decimalOrNull(r.cache_read_cost) ?? 0,
    cacheWriteCost: decimalOrNull(r.cache_write_cost) ?? 0,
    reasoningCost: decimalOrNull(r.internal_reasoning_cost) ?? 0,
    otherCost: decimalOrNull(r.other_cost) ?? 0,
  }));
}
