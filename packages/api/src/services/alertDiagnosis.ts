import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getOrgPlan } from "@foglamp/billing";
import {
  listTraces,
  queryAgentBreakdown,
  queryModelBreakdown,
  type TraceSortField,
} from "@foglamp/clickhouse";
import {
  ALERT_METRIC_LABELS,
  formatAlertMetricValue,
  formatAlertWindow,
  type AlertMetric,
} from "@foglamp/contracts/alerts";
import {
  alertEvent,
  type AlertDiagnosis,
  type AlertFilters,
} from "@foglamp/db/schema/alert";
import { env } from "@foglamp/env/server";
import { generateText } from "ai";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { foglamp } from "foglamp";

import { num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db, Log } from "../types";
import { sanitizeSummary } from "./weeklyDigest";

// Hard ceiling on LLM diagnoses per rule per UTC day (platform key, so this is
// our cost exposure). Later notifications reuse the stored narrative or fall
// back to deterministic context only.
export const DIAGNOSIS_DAILY_CAP = 3;
// A renotify regenerates the narrative only when the metric moved this much
// (relative) since the last diagnosis was written.
export const DIAGNOSIS_REGEN_DELTA = 0.25;
const DIAGNOSIS_TIMEOUT_MS = 10_000;
const TOP_BREAKDOWN = 3;
const TOP_TRACES = 5;

// Same platform-key provider pattern as the weekly digest: absent key → the
// narrative layer is off everywhere (deterministic context still renders).
const google = env.GOOGLE_GENERATIVE_AI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })
  : null;
const fog = foglamp();

const SPAN_METRICS = new Set<AlertMetric>([
  "cost",
  "latency_p50",
  "latency_p95",
  "latency_p99",
  "ttft_p95",
  "error_rate",
  "token_usage",
  "request_count",
]);

type MetricFamily = "cost" | "latency" | "errors" | "volume" | "eval";

function familyOf(metric: AlertMetric): MetricFamily {
  switch (metric) {
    case "cost":
      return "cost";
    case "latency_p50":
    case "latency_p95":
    case "latency_p99":
    case "ttft_p95":
      return "latency";
    case "error_rate":
      return "errors";
    case "token_usage":
    case "request_count":
      return "volume";
    case "eval_avg_score":
    case "eval_pass_rate":
      return "eval";
  }
}

/** Relative change current vs previous, or null when there is no baseline. */
export function relativeDelta(
  current: number,
  previous: number | null,
): number | null {
  if (previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function formatDeltaPct(delta: number): string {
  const pct = Math.round(delta * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/**
 * Whether a notification should spend an LLM call on a fresh narrative, vs
 * reusing the stored one. Fresh fires always regenerate (within the cap);
 * renotifies only when the value moved materially since the last diagnosis.
 */
export function shouldRegenerateDiagnosis(input: {
  freshFire: boolean;
  value: number;
  lastDiagnosisValue: number | null;
  diagnosisCount: number;
}): boolean {
  if (input.diagnosisCount >= DIAGNOSIS_DAILY_CAP) return false;
  if (input.freshFire) return true;
  if (input.lastDiagnosisValue === null || input.lastDiagnosisValue === 0)
    return true;
  return (
    Math.abs(input.value - input.lastDiagnosisValue) >
    DIAGNOSIS_REGEN_DELTA * Math.abs(input.lastDiagnosisValue)
  );
}

/** Latest stored narrative for a rule (for renotify reuse). */
export async function latestStoredDiagnosis(
  db: Db,
  ruleId: string,
): Promise<AlertDiagnosis | null> {
  const [row] = await db
    .select({ diagnosis: alertEvent.diagnosis })
    .from(alertEvent)
    .where(
      and(
        eq(alertEvent.ruleId, ruleId),
        eq(alertEvent.type, "fired"),
        isNotNull(alertEvent.diagnosis),
      ),
    )
    .orderBy(desc(alertEvent.createdAt))
    .limit(1);
  return row?.diagnosis ?? null;
}

export type DiagnosisArgs = {
  ruleId: string;
  projectId: string;
  orgId: string;
  ruleName: string;
  projectName: string;
  metric: AlertMetric;
  conditionLabel: string;
  windowSeconds: number;
  filters?: AlertFilters | null;
  /** Metric value over the alerting window. */
  value: number;
  /** Same metric over the immediately-preceding window (null if unavailable). */
  prevValue: number | null;
  from: Date;
  to: Date;
  /** Spend an LLM call on a fresh narrative (evaluator has checked cap+plan-independent conditions). */
  wantLlm: boolean;
};

/**
 * Build the auto-diagnosis for a notified alert: deterministic context from
 * ClickHouse for every plan, plus an LLM narrative for paid tiers within the
 * daily cap. Never throws — degrades to whatever context it could gather. The
 * caller uses `usedLlm` to charge the per-rule daily LLM cap.
 */
export async function buildAlertDiagnosis(
  db: Db,
  ch: Ch,
  args: DiagnosisArgs,
  log: Log,
): Promise<{ diagnosis: AlertDiagnosis; usedLlm: boolean }> {
  const generatedAt = args.to.toISOString();
  const rows: [string, string][] = [];
  let traces: NonNullable<AlertDiagnosis["traces"]> = [];

  const delta = relativeDelta(args.value, args.prevValue);
  rows.push(["This window", formatAlertMetricValue(args.metric, args.value)]);
  rows.push([
    "Previous window",
    args.prevValue === null
      ? "no data"
      : formatAlertMetricValue(args.metric, args.prevValue),
  ]);
  if (delta !== null) rows.push(["Change", formatDeltaPct(delta)]);

  const family = familyOf(args.metric);

  // Deterministic breakdowns (span metrics only; eval alerts get the window
  // delta rows above and nothing trace-level in v1).
  if (SPAN_METRICS.has(args.metric)) {
    try {
      const from = toClickHouseDateTime(args.from);
      const to = toClickHouseDateTime(args.to);
      const traceSort: TraceSortField =
        family === "latency"
          ? "duration"
          : family === "volume"
            ? args.metric === "token_usage"
              ? "tokens"
              : "spans"
            : family === "errors"
              ? "when"
              : "cost";
      const [models, agents, topTraces] = await Promise.all([
        queryModelBreakdown(ch, { projectId: args.projectId, from, to }),
        queryAgentBreakdown(ch, { projectId: args.projectId, from, to }),
        listTraces(ch, {
          projectId: args.projectId,
          from,
          to,
          agentName: args.filters?.agentName,
          modelId: args.filters?.modelId,
          errorsOnly: family === "errors",
          sort: { field: traceSort, dir: "desc" },
          limit: TOP_TRACES,
        }),
      ]);

      const totalCost = models.reduce((s, m) => s + num(m.total_cost), 0);
      const describeModel = (m: (typeof models)[number]): string => {
        switch (family) {
          case "latency":
            return `p95 ${formatAlertMetricValue("latency_p95", num(m.duration_quantiles?.[1]))} over ${num(m.span_count).toLocaleString("en-US")} spans`;
          case "volume":
            return `${num(m.total_tokens).toLocaleString("en-US")} tokens over ${num(m.span_count).toLocaleString("en-US")} spans`;
          default: {
            const share =
              totalCost > 0
                ? ` (${Math.round((num(m.total_cost) / totalCost) * 100)}% of spend)`
                : "";
            return `${formatAlertMetricValue("cost", num(m.total_cost))}${share}`;
          }
        }
      };
      const rankedModels =
        family === "latency"
          ? [...models].sort(
              (a, b) =>
                num(b.duration_quantiles?.[1]) - num(a.duration_quantiles?.[1]),
            )
          : models; // already ORDER BY total_cost DESC
      for (const m of rankedModels.slice(0, TOP_BREAKDOWN)) {
        if (!m.model_id) continue;
        rows.push([`Model ${m.model_id}`, describeModel(m)]);
      }

      const describeAgent = (a: (typeof agents)[number]): string => {
        switch (family) {
          case "latency":
            return `p95 ${formatAlertMetricValue("latency_p95", num(a.duration_quantiles?.[1]))}`;
          case "errors":
            return `${num(a.error_count).toLocaleString("en-US")} errors over ${num(a.span_count).toLocaleString("en-US")} spans`;
          case "volume":
            return `${num(a.total_tokens).toLocaleString("en-US")} tokens`;
          default:
            return formatAlertMetricValue("cost", num(a.total_cost));
        }
      };
      const rankedAgents =
        family === "errors"
          ? [...agents].sort((a, b) => num(b.error_count) - num(a.error_count))
          : family === "latency"
            ? [...agents].sort(
                (a, b) =>
                  num(b.duration_quantiles?.[1]) -
                  num(a.duration_quantiles?.[1]),
              )
            : agents;
      for (const a of rankedAgents.slice(0, TOP_BREAKDOWN)) {
        rows.push([`Agent ${a.agent_name}`, describeAgent(a)]);
      }

      traces = topTraces.map((t) => {
        const detail = (() => {
          switch (family) {
            case "latency":
              return formatAlertMetricValue("latency_p95", t.duration_ms);
            case "errors":
              return `${num(t.error_count).toLocaleString("en-US")} errors`;
            case "volume":
              return `${num(t.total_tokens).toLocaleString("en-US")} tokens`;
            default:
              return formatAlertMetricValue("cost", num(t.total_cost));
          }
        })();
        return {
          traceId: t.trace_id,
          name: t.trace_name || t.trace_id.slice(0, 8),
          detail,
        };
      });
    } catch (err) {
      // Context is best-effort; the window-delta rows above still render.
      log.warn("alert.diagnosis_context_failed", {
        projectId: args.projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const diagnosis: AlertDiagnosis = { rows, traces, generatedAt };

  if (args.wantLlm) {
    const written = await writeDiagnosisSummary(args, rows, traces, log);
    if (written?.summary) {
      diagnosis.summary = written.summary;
      diagnosis.model = env.ALERT_DIAGNOSIS_MODEL;
    }
    return { diagnosis, usedLlm: written?.attempted ?? false };
  }

  // Reuse the stored narrative on renotifies that don't warrant a fresh call.
  const previous = await latestStoredDiagnosis(db, args.ruleId).catch(
    () => null,
  );
  if (previous?.summary) {
    diagnosis.summary = previous.summary;
    diagnosis.model = previous.model;
  }
  return { diagnosis, usedLlm: false };
}

const DIAGNOSIS_SYSTEM = `You diagnose a monitoring alert for Foglamp, an LLM agent observability product. You are given the alert condition and aggregated data for the alerting window.
Rules:
- Write 2 to 4 short sentences, at most 90 words. Plain text only. No markdown, no bullet points, no emoji.
- Never use em dashes or en dashes. Use commas or periods instead.
- Point at the biggest contributors (models, agents, traces) using only the data given, and copy numbers exactly as written.
- Say what most likely explains the alert based only on that data. If nothing stands out, say the change is broad based.
- Do not greet the reader, sign off, or mention these rules.`;

/** Prompt body for the diagnosis call (exported for tests). */
export function describeForDiagnosis(
  args: Pick<
    DiagnosisArgs,
    "ruleName" | "projectName" | "metric" | "conditionLabel" | "windowSeconds"
  >,
  rows: [string, string][],
  traces: NonNullable<AlertDiagnosis["traces"]>,
): string {
  const lines = [
    `Alert: ${args.ruleName} (project ${args.projectName})`,
    `Metric: ${ALERT_METRIC_LABELS[args.metric]}, condition ${args.conditionLabel}, window ${formatAlertWindow(args.windowSeconds)}`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
  ];
  if (traces.length > 0) {
    lines.push(
      `Top traces: ${traces.map((t) => `${t.name} (${t.detail})`).join("; ")}`,
    );
  }
  return lines.join("\n");
}

async function writeDiagnosisSummary(
  args: DiagnosisArgs,
  rows: [string, string][],
  traces: NonNullable<AlertDiagnosis["traces"]>,
  log: Log,
): Promise<{ summary?: string; attempted: boolean } | null> {
  if (!google) return null;
  // Paid tiers only. Self-hosts with billing off resolve to "unmetered" and are
  // allowed (the Google key is their own).
  const { plan } = await getOrgPlan(args.orgId).catch(() => ({
    plan: "free" as const,
  }));
  if (plan === "free") return null;
  try {
    const { text } = await generateText({
      model: google(env.ALERT_DIAGNOSIS_MODEL),
      system: DIAGNOSIS_SYSTEM,
      prompt: describeForDiagnosis(args, rows, traces),
      maxOutputTokens: 300,
      abortSignal: AbortSignal.timeout(DIAGNOSIS_TIMEOUT_MS),
      telemetry: {
        integrations: [
          fog.integration({
            agentName: "alert-diagnosis",
            customer: { id: args.orgId },
            metadata: { metric: args.metric },
          }),
        ],
      },
    });
    const clean = sanitizeSummary(text);
    // The call happened either way, so it counts against the daily cap.
    return { summary: clean.length > 20 ? clean : undefined, attempted: true };
  } catch (err) {
    log.warn("alert.diagnosis_llm_failed", {
      orgId: args.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { attempted: true };
  }
}
