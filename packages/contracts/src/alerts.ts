export const ALERT_METRICS = [
  "cost",
  "latency_p50",
  "latency_p95",
  "latency_p99",
  "ttft_p95",
  "error_rate",
  "token_usage",
  "request_count",
  "eval_avg_score",
  "eval_pass_rate",
] as const;

export type AlertMetric = (typeof ALERT_METRICS)[number];

/** Metrics offered for newly-created rules. Legacy metrics remain readable and
 * evaluable so existing alerts do not break. */
export const CREATABLE_ALERT_METRICS = [
  "cost",
  "latency_p95",
  "error_rate",
  "eval_pass_rate",
] as const satisfies readonly AlertMetric[];

export type CreatableAlertMetric = (typeof CREATABLE_ALERT_METRICS)[number];

/** Evaluation windows the product has ever offered. Legacy windows remain
 * evaluable so existing alerts do not break. */
export const ALERT_WINDOW_SECONDS = [300, 900, 3600, 86_400] as const;

export type AlertWindowSeconds = (typeof ALERT_WINDOW_SECONDS)[number];

/** Windows offered for newly-created (or re-windowed) rules. 5m was dropped:
 * with a 60s sweep it is nearly all noise, and the anti-flap state machine
 * makes 15m the shortest useful detection window. */
export const CREATABLE_ALERT_WINDOW_SECONDS = [
  900, 3600, 86_400,
] as const satisfies readonly AlertWindowSeconds[];

export const ALERT_COMPARISONS = ["gt", "gte", "lt", "lte"] as const;
export type AlertComparison = (typeof ALERT_COMPARISONS)[number];

export const ALERT_METRIC_LABELS: Record<AlertMetric, string> = {
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

export const ALERT_COMPARISON_SYMBOLS: Record<AlertComparison, string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

export const ALERT_COMPARISON_LABELS: Record<AlertComparison, string> = {
  gt: "above",
  gte: "at least",
  lt: "below",
  lte: "at most",
};

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

function formatMilliseconds(value: number): string {
  if (Math.abs(value) < 1000) return `${number.format(value)}ms`;
  return `${number.format(value / 1000)}s`;
}

/** Format the storage-unit value of an alert metric for names and compact UI. */
export function formatAlertMetricValue(
  metric: AlertMetric,
  value: number | null | undefined,
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  switch (metric) {
    case "cost":
      return currency.format(value);
    case "latency_p50":
    case "latency_p95":
    case "latency_p99":
    case "ttft_p95":
      return formatMilliseconds(value);
    case "error_rate":
    case "eval_pass_rate":
      return `${number.format(value * 100)}%`;
    case "eval_avg_score":
      return number.format(value);
    case "token_usage":
    case "request_count":
      return number.format(value);
  }
}

export function generateAlertName(input: {
  metric: AlertMetric;
  comparison: AlertComparison;
  threshold: number;
}): string {
  return `${ALERT_METRIC_LABELS[input.metric]} ${ALERT_COMPARISON_LABELS[input.comparison]} ${formatAlertMetricValue(input.metric, input.threshold)}`;
}

export function formatAlertWindow(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
