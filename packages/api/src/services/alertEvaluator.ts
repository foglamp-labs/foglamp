import { sendAlertEmail } from "@foglamp/auth/email";
import { queryAlertWindow, queryScoreAlertWindow } from "@foglamp/clickhouse";
import {
  alertEvent,
  alertRule,
  alertState,
  type AlertDiagnosis,
} from "@foglamp/db/schema/alert";
import { evalDefinition } from "@foglamp/db/schema/eval";
import { project } from "@foglamp/db/schema/project";
import { env } from "@foglamp/env/server";
import { and, desc, eq } from "drizzle-orm";

import { mapLimit, num, toClickHouseDateTime, ymd } from "../lib/util";
import type { Ch, Db, Log } from "../types";
import {
  buildAlertDiagnosis,
  shouldRegenerateDiagnosis,
} from "./alertDiagnosis";

// Bounded fan-out for the alert sweep — enough to hide per-rule ClickHouse
// latency without stampeding the cluster.
const ALERT_EVAL_CONCURRENCY = 8;

// --- Anti-flap state machine constants ------------------------------------
// A breach must hold this many consecutive sweeps (~3 min at the 60s cadence)
// before the rule fires.
export const FIRE_STREAK = 3;
// A firing rule resolves only after this many consecutive sweeps clear of the
// threshold by RESOLVE_MARGIN — hysteresis so a value oscillating around the
// threshold produces one fire, not a fired/resolved email storm.
export const RESOLVE_STREAK = 3;
export const RESOLVE_MARGIN = 0.1;
// Percentile/rate metrics are meaningless on a handful of spans; below this
// window sample count the sweep skips evaluation and holds state.
export const MIN_SAMPLE_COUNT = 10;
// Hard ceiling on notification emails per rule per UTC day.
export const NOTIFY_DAILY_CAP = 5;

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

// Metrics whose value is a percentile or rate — subject to the sample floor.
// Volume metrics (cost, tokens, request count) always evaluate: zero traffic
// producing zero cost is a real reading, not noise.
const SAMPLED_METRICS = new Set<Metric>([
  "latency_p50",
  "latency_p95",
  "latency_p99",
  "ttft_p95",
  "error_rate",
  "eval_avg_score",
  "eval_pass_rate",
]);

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


export type AlertTransitionInput = {
  prev: { status: "ok" | "firing"; breachStreak: number; okStreak: number };
  value: number;
  threshold: number;
  comparison: Comparison;
  metric: Metric;
  sampleCount: number;
};

export type AlertTransition = {
  status: "ok" | "firing";
  breachStreak: number;
  okStreak: number;
  /** ok↔firing changed this sweep. */
  transitioned: boolean;
  /** Sample floor hit — state held, only lastEvaluatedAt should be persisted. */
  skipped: boolean;
};

/**
 * Pure anti-flap transition. Fire debounce: a breach must hold FIRE_STREAK
 * consecutive sweeps before ok→firing. Resolve hysteresis: firing→ok only
 * after RESOLVE_STREAK consecutive sweeps clear of the threshold by
 * RESOLVE_MARGIN (a value back under the threshold but inside the margin
 * resets nothing toward resolve — it holds firing). Percentile/rate metrics
 * with fewer than MIN_SAMPLE_COUNT samples skip evaluation entirely.
 */
export function computeAlertTransition(
  input: AlertTransitionInput,
): AlertTransition {
  const { prev, value, threshold, comparison, metric, sampleCount } = input;

  if (SAMPLED_METRICS.has(metric) && sampleCount < MIN_SAMPLE_COUNT) {
    return { ...prev, transitioned: false, skipped: true };
  }

  if (isBreached(value, comparison, threshold)) {
    const breachStreak = prev.breachStreak + 1;
    const status =
      prev.status === "firing" || breachStreak >= FIRE_STREAK
        ? "firing"
        : "ok";
    return {
      status,
      breachStreak,
      okStreak: 0,
      transitioned: status !== prev.status,
      skipped: false,
    };
  }

  if (prev.status === "ok") {
    return {
      status: "ok",
      breachStreak: 0,
      okStreak: 0,
      transitioned: false,
      skipped: false,
    };
  }

  // Firing and no longer breached: count only margin-clear sweeps toward
  // resolving.
  const margin = RESOLVE_MARGIN * Math.abs(threshold);
  const cleared =
    comparison === "gt" || comparison === "gte"
      ? value <= threshold - margin
      : value >= threshold + margin;
  const okStreak = cleared ? prev.okStreak + 1 : 0;
  if (okStreak >= RESOLVE_STREAK) {
    return {
      status: "ok",
      breachStreak: 0,
      okStreak,
      transitioned: true,
      skipped: false,
    };
  }
  return {
    status: "firing",
    breachStreak: 0,
    okStreak,
    transitioned: false,
    skipped: false,
  };
}

/**
 * One sweep over every enabled alert rule. For each rule we roll up its window
 * in ClickHouse, derive the metric value, and run the anti-flap transition
 * (fire debounce, resolve hysteresis, sample floor) over `alert_state`.
 * Transitions append an `alert_event`; only `fired` transitions and cooldown
 * renotifies email (resolved is silent), capped per rule per UTC day. Notified
 * fires carry an auto-diagnosis: deterministic ClickHouse context for every
 * plan plus a capped LLM narrative for paid tiers (see alertDiagnosis). Runs
 * as a system task (no per-user access check) — it reads rules across all
 * projects.
 */
export async function evaluateAlerts(db: Db, ch: Ch, log: Log): Promise<void> {
  const now = new Date();

  const rows = await db
    .select({
      rule: alertRule,
      state: alertState,
      projectName: project.name,
      projectSiteUrl: project.url,
      orgId: project.orgId,
    })
    .from(alertRule)
    .innerJoin(project, eq(project.id, alertRule.projectId))
    .leftJoin(alertState, eq(alertState.ruleId, alertRule.id))
    .where(eq(alertRule.enabled, true));

  // Evaluate rules concurrently (bounded) — each does its own ClickHouse query,
  // so a serial sweep was O(rules × CH latency). The per-rule try/catch keeps
  // one failure from aborting the others.
  await mapLimit(
    rows,
    ALERT_EVAL_CONCURRENCY,
    async ({ rule, state, projectName, projectSiteUrl, orgId }) => {
      try {
        const metric = rule.metric as Metric;
        const comparison = rule.comparison as Comparison;
        const threshold = Number(rule.threshold);
        const windowMs = rule.windowSeconds * 1000;

        // Window rollup for [from, to) — reused for the previous-window delta
        // when a notification builds its diagnosis.
        let computeValue: (
          from: Date,
          to: Date,
        ) => Promise<{ value: number; sampleCount: number }>;
        if (metric === "eval_avg_score" || metric === "eval_pass_rate") {
          // Eval-score alert: aggregate this eval's score rollup over the window.
          if (!rule.evalId) {
            log.error("alert.eval_metric_without_eval", { ruleId: rule.id });
            return;
          }
          // The eval's threshold turns judge scores into pass/fail.
          const [ev] = await db
            .select({ passThreshold: evalDefinition.passThreshold })
            .from(evalDefinition)
            .where(eq(evalDefinition.id, rule.evalId))
            .limit(1);
          if (!ev) {
            log.error("alert.eval_metric_missing_eval", { ruleId: rule.id });
            return;
          }
          const evalId = rule.evalId;
          const passThreshold = Number(ev.passThreshold);
          computeValue = async (from, to) => {
            const sw = await queryScoreAlertWindow(ch, {
              projectId: rule.projectId,
              evalId,
              from: toClickHouseDateTime(from),
              to: toClickHouseDateTime(to),
              threshold: passThreshold,
            });
            const scored = num(sw.scored_count);
            // Pass rate over rows with a verdict only (stored or derived);
            // skipped rows carry neither and must not deflate the rate.
            const verdicts = num(sw.verdict_count);
            const value =
              metric === "eval_avg_score"
                ? scored === 0
                  ? 0
                  : num(sw.score_sum) / scored
                : verdicts === 0
                  ? 0
                  : num(sw.pass_count) / verdicts;
            return {
              value,
              sampleCount: metric === "eval_avg_score" ? scored : verdicts,
            };
          };
        } else {
          computeValue = async (from, to) => {
            const window = await queryAlertWindow(ch, {
              projectId: rule.projectId,
              from: toClickHouseDateTime(from),
              to: toClickHouseDateTime(to),
              modelId: rule.filters?.modelId,
              agentName: rule.filters?.agentName,
            });
            return {
              value: deriveValue(metric, window),
              sampleCount: num(window.span_count),
            };
          };
        }

        const { value, sampleCount } = await computeValue(
          new Date(now.getTime() - windowMs),
          now,
        );

        const prev = {
          status: state?.status ?? "ok",
          breachStreak: state?.breachStreak ?? 0,
          okStreak: state?.okStreak ?? 0,
        } as const;
        const t = computeAlertTransition({
          prev,
          value,
          threshold,
          comparison,
          metric,
          sampleCount,
        });

        if (t.skipped) {
          // Too few samples to judge a percentile/rate — hold state.
          await db
            .insert(alertState)
            .values({ ruleId: rule.id, lastEvaluatedAt: now })
            .onConflictDoUpdate({
              target: alertState.ruleId,
              set: { lastEvaluatedAt: now },
            });
          return;
        }

        // Notification policy: fired transitions and cooldown renotifies only —
        // resolved transitions are recorded but never emailed.
        const day = ymd(now);
        const notifyCount = state?.notifyDay === day ? state.notifyCount : 0;
        let notify = false;
        if (t.status === "firing") {
          if (t.transitioned) {
            notify = true;
          } else {
            const last = state?.lastNotifiedAt;
            notify =
              !last || now.getTime() - last.getTime() >= env.ALERT_RENOTIFY_MS;
          }
        }
        if (notify && notifyCount >= NOTIFY_DAILY_CAP) {
          notify = false;
          log.info("alert.notify_capped", {
            ruleId: rule.id,
            notifyCount,
            day,
          });
        }

        // Auto-diagnosis for notified fires — strictly best-effort: any
        // failure here still sends the plain alert email.
        let diagnosis: AlertDiagnosis | null = null;
        let usedLlm = false;
        const diagnosisCount =
          state?.diagnosisDay === day ? state.diagnosisCount : 0;
        const conditionLabel = `${COMPARISON_SYMBOLS[comparison]} ${formatMetricValue(metric, threshold)}`;
        if (notify) {
          try {
            const prevWindow = await computeValue(
              new Date(now.getTime() - 2 * windowMs),
              new Date(now.getTime() - windowMs),
            );
            const wantLlm = shouldRegenerateDiagnosis({
              freshFire: t.transitioned,
              value,
              lastDiagnosisValue:
                state?.lastDiagnosisValue != null
                  ? Number(state.lastDiagnosisValue)
                  : null,
              diagnosisCount,
            });
            const built = await buildAlertDiagnosis(
              db,
              ch,
              {
                ruleId: rule.id,
                projectId: rule.projectId,
                orgId,
                ruleName: rule.name,
                projectName,
                metric,
                conditionLabel,
                windowSeconds: rule.windowSeconds,
                filters: rule.filters,
                value,
                prevValue: prevWindow.value,
                from: new Date(now.getTime() - windowMs),
                to: now,
                wantLlm,
              },
              log,
            );
            diagnosis = built.diagnosis;
            usedLlm = built.usedLlm;
          } catch (err) {
            log.warn("alert.diagnosis_failed", {
              ruleId: rule.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Persist the latest evaluation; upsert covers a missing state row.
        const stateValues = {
          status: t.status,
          lastValue: String(value),
          lastEvaluatedAt: now,
          breachStreak: t.breachStreak,
          okStreak: t.okStreak,
          ...(t.status === "firing" && prev.status !== "firing"
            ? { lastFiredAt: now }
            : {}),
          ...(notify
            ? { lastNotifiedAt: now, notifyDay: day, notifyCount: notifyCount + 1 }
            : {}),
          ...(usedLlm
            ? {
                diagnosisDay: day,
                diagnosisCount: diagnosisCount + 1,
                lastDiagnosisValue: String(value),
              }
            : {}),
        } as const;
        await db
          .insert(alertState)
          .values({ ruleId: rule.id, ...stateValues })
          .onConflictDoUpdate({ target: alertState.ruleId, set: stateValues });

        if (t.transitioned) {
          await db.insert(alertEvent).values({
            ruleId: rule.id,
            type: t.status === "firing" ? "fired" : "resolved",
            value: String(value),
            threshold: rule.threshold,
            // Diagnosis only ever accompanies fired events.
            ...(t.status === "firing" && diagnosis ? { diagnosis } : {}),
          });
          log.info("alert.transition", {
            ruleId: rule.id,
            from: prev.status,
            to: t.status,
            value,
            threshold,
          });
        } else if (notify && usedLlm && diagnosis) {
          // Renotify with a regenerated narrative: refresh the latest fired
          // event so the /alerts history shows the current diagnosis.
          const [latest] = await db
            .select({ id: alertEvent.id })
            .from(alertEvent)
            .where(
              and(
                eq(alertEvent.ruleId, rule.id),
                eq(alertEvent.type, "fired"),
              ),
            )
            .orderBy(desc(alertEvent.createdAt))
            .limit(1);
          if (latest) {
            await db
              .update(alertEvent)
              .set({ diagnosis })
              .where(eq(alertEvent.id, latest.id));
          }
        }

        if (notify) {
          const baseUrl = env.CORS_ORIGIN.replace(/\/$/, "");
          const emailDiagnosis = diagnosis
            ? {
                summary: diagnosis.summary,
                rows: diagnosis.rows,
                traces: diagnosis.traces?.map((tr) => ({
                  name: tr.name,
                  detail: tr.detail,
                  url: `${baseUrl}/traces/${encodeURIComponent(tr.traceId)}`,
                })),
              }
            : undefined;
          await Promise.all(
            rule.channels
              .filter((channel) => channel.type === "email")
              .map((channel) =>
                sendAlertEmail({
                  to: channel.to,
                  ruleName: rule.name,
                  projectName,
                  projectSiteUrl,
                  metricLabel: METRIC_LABELS[metric] ?? metric,
                  conditionLabel,
                  value: formatMetricValue(metric, value),
                  url: `${baseUrl}/alerts`,
                  diagnosis: emailDiagnosis,
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
    },
  );
}
