import {
  queryMetricsTimeseries,
  queryModelBreakdown,
  queryProjectSummary,
} from "@watchtower/clickhouse";

import { decimalOrNull, num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

function quantiles(q: number[] | undefined) {
  return { p50: num(q?.[0]), p95: num(q?.[1]), p99: num(q?.[2]) };
}

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
  }));
}

export async function getSummary(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; from: Date; to: Date },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const s = await queryProjectSummary(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
  });
  const llmSpans = num(s.llm_span_count);
  const priced = num(s.priced_span_count);
  return {
    spanCount: num(s.span_count),
    llmSpanCount: llmSpans,
    errorCount: num(s.error_count),
    totalCost: decimalOrNull(s.total_cost),
    pricedSpanCount: priced,
    totalTokens: num(s.total_tokens),
    // Fraction of llm spans that received a price (0..1); null when no llm spans.
    costCoverage: llmSpans > 0 ? priced / llmSpans : null,
    latencyMs: quantiles(s.duration_quantiles),
    ttftMs: quantiles(s.ttft_quantiles),
  };
}
