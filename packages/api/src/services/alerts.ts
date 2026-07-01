import { TRPCError } from "@trpc/server";
import { getOrgPlan } from "@foglamp/billing";
import {
  alertEvent,
  alertRule,
  alertState,
  type AlertChannel,
  type AlertFilters,
} from "@foglamp/db/schema/alert";
import { project } from "@foglamp/db/schema/project";
import { count, desc, eq } from "drizzle-orm";

import { decimalOrNull } from "../lib/util";
import type { Db } from "../types";
import { requireProjectAccess } from "./access";
import { requireEvalAccess } from "./evals";

export type AlertMetric =
  | "cost"
  | "latency_p50"
  | "latency_p95"
  | "latency_p99"
  | "ttft_p95"
  | "error_rate"
  | "token_usage"
  | "request_count"
  | "eval_avg_score"
  | "eval_pass_rate";
export type AlertComparison = "gt" | "gte" | "lt" | "lte";

export type AlertRuleInput = {
  projectId: string;
  name: string;
  metric: AlertMetric;
  evalId?: string;
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
    evalId: rule.evalId ?? null,
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
  const proj = await requireProjectAccess(db, userId, input.projectId);
  // Eval-score alerts reference an eval — verify it's one the caller can access
  // AND that it lives in this alert's project. Otherwise the evaluator queries
  // ClickHouse with a mismatched (projectId, evalId) pair, finds no scores, and
  // the alert silently fires (or never fires) forever.
  if (input.evalId) {
    const ev = await requireEvalAccess(db, userId, input.evalId);
    if (ev.projectId !== input.projectId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Eval must belong to the same project as the alert",
      });
    }
  }

  // Plan limit: cap alerts per org, counted across all its projects.
  const { limits } = await getOrgPlan(proj.orgId);
  if (limits.alerts !== null) {
    const rows = await db
      .select({ n: count() })
      .from(alertRule)
      .innerJoin(project, eq(project.id, alertRule.projectId))
      .where(eq(project.orgId, proj.orgId));
    if ((rows[0]?.n ?? 0) >= limits.alerts) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Your plan allows ${limits.alerts} alert${limits.alerts === 1 ? "" : "s"}. Upgrade to add more.`,
      });
    }
  }

  // Rule + its 1:1 state row must land atomically — a crash between the two
  // inserts would leave a stateless rule the evaluator misreads as "ok" and can
  // emit a ghost "resolved" event for.
  const id = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(alertRule)
      .values({
        projectId: input.projectId,
        name: input.name,
        metric: input.metric,
        evalId: input.evalId,
        filters: input.filters,
        windowSeconds: input.windowSeconds,
        threshold: String(input.threshold),
        comparison: input.comparison,
        enabled: input.enabled ?? true,
        channels: input.channels,
      })
      .returning({ id: alertRule.id });
    const ruleId = rows[0]!.id;
    // 1:1 state row so the evaluator can transition ok↔firing without a race.
    await tx.insert(alertState).values({ ruleId, status: "ok" });
    return ruleId;
  });
  return { id };
}

export async function updateAlert(
  db: Db,
  userId: string,
  input: { ruleId: string } & Partial<Omit<AlertRuleInput, "projectId">>,
) {
  const rule = await requireRuleAccess(db, userId, input.ruleId);
  if (input.evalId) {
    const ev = await requireEvalAccess(db, userId, input.evalId);
    if (ev.projectId !== rule.projectId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Eval must belong to the same project as the alert",
      });
    }
  }
  await db
    .update(alertRule)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.metric !== undefined ? { metric: input.metric } : {}),
      ...(input.evalId !== undefined ? { evalId: input.evalId } : {}),
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
