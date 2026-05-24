import { TRPCError } from "@trpc/server";
import {
  alertEvent,
  alertRule,
  alertState,
  type AlertChannel,
  type AlertFilters,
} from "@watchtower/db/schema/alert";
import { desc, eq } from "drizzle-orm";

import { decimalOrNull } from "../lib/util";
import type { Db } from "../types";
import { requireProjectAccess } from "./access";

export type AlertMetric =
  | "cost"
  | "latency_p50"
  | "latency_p95"
  | "latency_p99"
  | "ttft_p95"
  | "error_rate"
  | "token_usage"
  | "request_count";
export type AlertComparison = "gt" | "gte" | "lt" | "lte";

export type AlertRuleInput = {
  projectId: string;
  name: string;
  metric: AlertMetric;
  filters?: AlertFilters;
  windowSeconds: number;
  threshold: number;
  comparison: AlertComparison;
  enabled?: boolean;
  channels: AlertChannel[];
};

async function requireRuleAccess(db: Db, userId: string, ruleId: string) {
  const rows = await db
    .select({ id: alertRule.id, projectId: alertRule.projectId })
    .from(alertRule)
    .where(eq(alertRule.id, ruleId))
    .limit(1);
  const rule = rows[0];
  if (!rule) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Alert rule not found" });
  }
  await requireProjectAccess(db, userId, rule.projectId);
  return rule;
}

export async function listAlerts(db: Db, userId: string, projectId: string) {
  await requireProjectAccess(db, userId, projectId);
  const rows = await db
    .select({
      rule: alertRule,
      state: alertState,
    })
    .from(alertRule)
    .leftJoin(alertState, eq(alertState.ruleId, alertRule.id))
    .where(eq(alertRule.projectId, projectId))
    .orderBy(desc(alertRule.createdAt));

  return rows.map(({ rule, state }) => ({
    id: rule.id,
    name: rule.name,
    metric: rule.metric,
    filters: rule.filters ?? null,
    windowSeconds: rule.windowSeconds,
    threshold: decimalOrNull(rule.threshold),
    comparison: rule.comparison,
    enabled: rule.enabled,
    channels: rule.channels,
    status: state?.status ?? "ok",
    lastValue: decimalOrNull(state?.lastValue),
    lastEvaluatedAt: state?.lastEvaluatedAt ?? null,
    lastFiredAt: state?.lastFiredAt ?? null,
    createdAt: rule.createdAt,
  }));
}

export async function createAlert(db: Db, userId: string, input: AlertRuleInput) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await db
    .insert(alertRule)
    .values({
      projectId: input.projectId,
      name: input.name,
      metric: input.metric,
      filters: input.filters,
      windowSeconds: input.windowSeconds,
      threshold: String(input.threshold),
      comparison: input.comparison,
      enabled: input.enabled ?? true,
      channels: input.channels,
    })
    .returning({ id: alertRule.id });
  const id = rows[0]!.id;
  // 1:1 state row so the evaluator can transition ok↔firing without a race.
  await db.insert(alertState).values({ ruleId: id, status: "ok" });
  return { id };
}

export async function updateAlert(
  db: Db,
  userId: string,
  input: { ruleId: string } & Partial<Omit<AlertRuleInput, "projectId">>,
) {
  await requireRuleAccess(db, userId, input.ruleId);
  await db
    .update(alertRule)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.metric !== undefined ? { metric: input.metric } : {}),
      ...(input.filters !== undefined ? { filters: input.filters } : {}),
      ...(input.windowSeconds !== undefined
        ? { windowSeconds: input.windowSeconds }
        : {}),
      ...(input.threshold !== undefined
        ? { threshold: String(input.threshold) }
        : {}),
      ...(input.comparison !== undefined
        ? { comparison: input.comparison }
        : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.channels !== undefined ? { channels: input.channels } : {}),
    })
    .where(eq(alertRule.id, input.ruleId));
  return { id: input.ruleId };
}

export async function deleteAlert(
  db: Db,
  userId: string,
  input: { ruleId: string },
) {
  await requireRuleAccess(db, userId, input.ruleId);
  await db.delete(alertRule).where(eq(alertRule.id, input.ruleId));
  return { id: input.ruleId };
}

export async function getAlertHistory(
  db: Db,
  userId: string,
  input: { ruleId: string; limit?: number },
) {
  await requireRuleAccess(db, userId, input.ruleId);
  const rows = await db
    .select()
    .from(alertEvent)
    .where(eq(alertEvent.ruleId, input.ruleId))
    .orderBy(desc(alertEvent.createdAt))
    .limit(input.limit ?? 50);
  return rows.map((e) => ({
    id: e.id,
    type: e.type,
    value: decimalOrNull(e.value),
    threshold: decimalOrNull(e.threshold),
    createdAt: e.createdAt,
  }));
}
