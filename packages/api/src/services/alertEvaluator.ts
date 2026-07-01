import { sendAlertEmail, type AlertEmailKind } from "@foglamp/auth/email";
import { queryAlertWindow, queryScoreAlertWindow } from "@foglamp/clickhouse";
import {
  alertEvent,
  alertRule,
  alertState,
} from "@foglamp/db/schema/alert";
import { project } from "@foglamp/db/schema/project";
import { env } from "@foglamp/env/server";
import { eq } from "drizzle-orm";

import { mapLimit, num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db, Log } from "../types";

// Bounded fan-out for the alert sweep — enough to hide per-rule ClickHouse
// latency without stampeding the cluster.
const ALERT_EVAL_CONCURRENCY = 8;

// Span-metrics read the metrics_by_minute rollup; eval-metrics read the
// score rollup for a specific eval (rule.evalId).
type SpanMetric =
  | "cost"
  | "latency_p50"
  | "latency_p95"
  | "latency_p99"
  | "ttft_p95"
  | "error_rate"
  | "token_usage"
  | "request_count";
type EvalMetric = "eval_avg_score" | "eval_pass_rate";
type Metric = SpanMetric | EvalMetric;

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
  eval_avg_score: "Avg eval score",
  eval_pass_rate: "Eval pass rate",
};

const COMPARISON_SYMBOLS: Record<Comparison, string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

/** Pull a span-metric value out of the single-window CH rollup. */
function deriveValue(
  metric: SpanMetric,
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
    case "eval_avg_score":
      return n.toFixed(2);
    case "eval_pass_rate":
      return `${(n * 100).toFixed(1)}%`;
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

  // Evaluate rules concurrently (bounded) — each does its own ClickHouse query,
  // so a serial sweep was O(rules × CH latency). The per-rule try/catch keeps
  // one failure from aborting the others.
  await mapLimit(rows, ALERT_EVAL_CONCURRENCY, async ({ rule, state, projectName }) => {
    try {
      const from = new Date(now.getTime() - rule.windowSeconds * 1000);
      const metric = rule.metric as Metric;
      const comparison = rule.comparison as Comparison;
      const threshold = Number(rule.threshold);

      let value: number;
      if (metric === "eval_avg_score" || metric === "eval_pass_rate") {
        // Eval-score alert: aggregate this eval's score rollup over the window.
        if (!rule.evalId) {
          log.error("alert.eval_metric_without_eval", { ruleId: rule.id });
          return;
        }
        const sw = await queryScoreAlertWindow(ch, {
          projectId: rule.projectId,
          evalId: rule.evalId,
          from: toClickHouseDateTime(from),
          to: toClickHouseDateTime(now),
        });
        const scored = num(sw.scored_count);
        // Pass rate over rows with a verdict only — score-only rows (numeric
        // judges) carry no pass/fail and must not deflate the rate.
        const verdicts = num(sw.verdict_count);
        value =
          metric === "eval_avg_score"
            ? scored === 0
              ? 0
              : num(sw.score_sum) / scored
            : verdicts === 0
              ? 0
              : num(sw.pass_count) / verdicts;
      } else {
        const window = await queryAlertWindow(ch, {
          projectId: rule.projectId,
          from: toClickHouseDateTime(from),
          to: toClickHouseDateTime(now),
          modelId: rule.filters?.modelId,
          agentName: rule.filters?.agentName,
        });
        value = deriveValue(metric, window);
      }
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
        await Promise.all(
          rule.channels
            .filter((channel) => channel.type === "email")
            .map((channel) =>
              sendAlertEmail({
                to: channel.to,
                kind: notifyKind,
                ruleName: rule.name,
                projectName,
                metricLabel: METRIC_LABELS[metric] ?? metric,
                conditionLabel,
                value: formatMetricValue(metric, value),
                windowLabel: formatWindow(rule.windowSeconds),
                url: `${baseUrl}/alerts`,
              }),
            ),
        );
      }
    } catch (err) {
      // One bad rule (CH hiccup, email failure) must not abort the sweep.
      log.error("alert.evaluate_failed", {
        ruleId: rule.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
