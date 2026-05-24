import { sendAlertEmail, type AlertEmailKind } from "@watchtower/auth/email";
import { queryAlertWindow } from "@watchtower/clickhouse";
import {
  alertEvent,
  alertRule,
  alertState,
} from "@watchtower/db/schema/alert";
import { project } from "@watchtower/db/schema/project";
import { env } from "@watchtower/env/server";
import { eq } from "drizzle-orm";

import { num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db, Log } from "../types";

type Metric =
  | "cost"
  | "latency_p50"
  | "latency_p95"
  | "latency_p99"
  | "ttft_p95"
  | "error_rate"
  | "token_usage"
  | "request_count";

type Comparison = "gt" | "gte" | "lt" | "lte";

const METRIC_LABELS: Record<Metric, string> = {
  cost: "Cost",
  latency_p50: "Latency p50",
  latency_p95: "Latency p95",
  latency_p99: "Latency p99",
  ttft_p95: "TTFT p95",
  error_rate: "Error rate",
  token_usage: "Token usage",
  request_count: "Request count",
};

const COMPARISON_SYMBOLS: Record<Comparison, string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

/** Pull the rule's metric value out of the single-window CH rollup. */
function deriveValue(
  metric: Metric,
  row: Awaited<ReturnType<typeof queryAlertWindow>>,
): number {
  const spanCount = num(row.span_count);
  switch (metric) {
    case "cost":
      return num(row.total_cost);
    case "latency_p50":
      return num(row.duration_quantiles?.[0]);
    case "latency_p95":
      return num(row.duration_quantiles?.[1]);
    case "latency_p99":
      return num(row.duration_quantiles?.[2]);
    case "ttft_p95":
      return num(row.ttft_quantiles?.[1]);
    case "error_rate":
      return spanCount > 0 ? num(row.error_count) / spanCount : 0;
    case "token_usage":
      return num(row.total_tokens);
    case "request_count":
      return spanCount;
  }
}

function isBreached(
  value: number,
  comparison: Comparison,
  threshold: number,
): boolean {
  switch (comparison) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
  }
}

/** Human-readable value, in the same unit used for the threshold. */
function formatMetricValue(metric: Metric, n: number): string {
  switch (metric) {
    case "cost":
      return `$${n.toFixed(n !== 0 && Math.abs(n) < 1 ? 4 : 2)}`;
    case "latency_p50":
    case "latency_p95":
    case "latency_p99":
    case "ttft_p95":
      return `${Math.round(n)} ms`;
    case "error_rate":
      return `${(n * 100).toFixed(2)}%`;
    case "token_usage":
    case "request_count":
      return n.toLocaleString("en-US");
  }
}

function formatWindow(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/**
 * One sweep over every enabled alert rule. For each rule we roll up its window
 * in ClickHouse, derive the metric value, compare against the threshold, and
 * transition `alert_state` ok↔firing. Transitions append an `alert_event` and
 * dispatch a fired/resolved email; a still-firing rule re-notifies once the
 * `ALERT_RENOTIFY_MS` cooldown has elapsed. Runs as a system task (no per-user
 * access check) — it reads rules across all projects.
 */
export async function evaluateAlerts(db: Db, ch: Ch, log: Log): Promise<void> {
  const now = new Date();

  const rows = await db
    .select({ rule: alertRule, state: alertState, projectName: project.name })
    .from(alertRule)
    .innerJoin(project, eq(project.id, alertRule.projectId))
    .leftJoin(alertState, eq(alertState.ruleId, alertRule.id))
    .where(eq(alertRule.enabled, true));

  for (const { rule, state, projectName } of rows) {
    try {
      const from = new Date(now.getTime() - rule.windowSeconds * 1000);
      const window = await queryAlertWindow(ch, {
        projectId: rule.projectId,
        from: toClickHouseDateTime(from),
        to: toClickHouseDateTime(now),
        modelId: rule.filters?.modelId,
        agentName: rule.filters?.agentName,
      });

      const metric = rule.metric as Metric;
      const comparison = rule.comparison as Comparison;
      const threshold = Number(rule.threshold);
      const value = deriveValue(metric, window);
      const breached = isBreached(value, comparison, threshold);
      const newStatus = breached ? "firing" : "ok";
      const prevStatus = state?.status ?? "ok";
      const transitioned = prevStatus !== newStatus;

      // Decide whether to notify: every transition, plus a periodic re-notify
      // while still firing once the cooldown passes.
      let notifyKind: AlertEmailKind | null = null;
      if (transitioned) {
        notifyKind = newStatus === "firing" ? "fired" : "resolved";
      } else if (newStatus === "firing") {
        const last = state?.lastNotifiedAt;
        if (!last || now.getTime() - last.getTime() >= env.ALERT_RENOTIFY_MS) {
          notifyKind = "fired";
        }
      }

      // Persist the latest evaluation; upsert covers a missing state row.
      const stateValues = {
        status: newStatus,
        lastValue: String(value),
        lastEvaluatedAt: now,
        ...(newStatus === "firing" && prevStatus !== "firing"
          ? { lastFiredAt: now }
          : {}),
        ...(notifyKind ? { lastNotifiedAt: now } : {}),
      } as const;
      await db
        .insert(alertState)
        .values({ ruleId: rule.id, ...stateValues })
        .onConflictDoUpdate({ target: alertState.ruleId, set: stateValues });

      if (transitioned) {
        await db.insert(alertEvent).values({
          ruleId: rule.id,
          type: newStatus === "firing" ? "fired" : "resolved",
          value: String(value),
          threshold: rule.threshold,
        });
        log.info("alert.transition", {
          ruleId: rule.id,
          from: prevStatus,
          to: newStatus,
          value,
          threshold,
        });
      }

      if (notifyKind) {
        const conditionLabel = `${COMPARISON_SYMBOLS[comparison]} ${formatMetricValue(metric, threshold)}`;
        const baseUrl = env.CORS_ORIGIN.replace(/\/$/, "");
        for (const channel of rule.channels) {
          if (channel.type !== "email") continue;
          await sendAlertEmail({
            to: channel.to,
            kind: notifyKind,
            ruleName: rule.name,
            projectName,
            metricLabel: METRIC_LABELS[metric] ?? metric,
            conditionLabel,
            value: formatMetricValue(metric, value),
            windowLabel: formatWindow(rule.windowSeconds),
            url: `${baseUrl}/alerts`,
          });
        }
      }
    } catch (err) {
      // One bad rule (CH hiccup, email failure) must not abort the sweep.
      log.error("alert.evaluate_failed", {
        ruleId: rule.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
