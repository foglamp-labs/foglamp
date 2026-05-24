import { queryAgentBreakdown } from "@watchtower/clickhouse";

import { decimalOrNull, num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

function quantiles(q: number[] | undefined) {
  return {
    p50: num(q?.[0]),
    p95: num(q?.[1]),
    p99: num(q?.[2]),
  };
}

export async function getAgentList(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; from: Date; to: Date },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await queryAgentBreakdown(ch, {
    projectId: input.projectId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
  });
  return rows.map((r) => ({
    agentName: r.agent_name,
    spanCount: num(r.span_count),
    llmSpanCount: num(r.llm_span_count),
    errorCount: num(r.error_count),
    totalCost: decimalOrNull(r.total_cost),
    pricedSpanCount: num(r.priced_span_count),
    totalTokens: num(r.total_tokens),
    latencyMs: quantiles(r.duration_quantiles),
  }));
}
