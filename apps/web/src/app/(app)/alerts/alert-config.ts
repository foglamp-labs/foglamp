import {
  ALERT_METRIC_LABELS,
  CREATABLE_ALERT_METRICS,
  type AlertMetric,
  type CreatableAlertMetric,
} from "@foglamp/contracts/alerts";
import {
  IconAlertTriangle,
  IconBolt,
  IconChartDots,
  IconCircleCheck,
  IconClock,
  IconCoin,
  IconStack2,
  IconStar,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

type MetricMeta = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  badgeVariant: "secondary" | "green" | "amber" | "rose" | "blue" | "violet";
  unit: string;
  placeholder: string;
};

export const METRIC_META: Record<AlertMetric, MetricMeta> = {
  cost: {
    label: ALERT_METRIC_LABELS.cost,
    icon: IconCoin,
    badgeVariant: "green",
    unit: "USD",
    placeholder: "500",
  },
  latency_p50: {
    label: ALERT_METRIC_LABELS.latency_p50,
    icon: IconClock,
    badgeVariant: "amber",
    unit: "ms",
    placeholder: "2000",
  },
  latency_p95: {
    label: ALERT_METRIC_LABELS.latency_p95,
    icon: IconClock,
    badgeVariant: "amber",
    unit: "ms",
    placeholder: "2000",
  },
  latency_p99: {
    label: ALERT_METRIC_LABELS.latency_p99,
    icon: IconClock,
    badgeVariant: "amber",
    unit: "ms",
    placeholder: "2000",
  },
  ttft_p95: {
    label: ALERT_METRIC_LABELS.ttft_p95,
    icon: IconBolt,
    badgeVariant: "amber",
    unit: "ms",
    placeholder: "1000",
  },
  error_rate: {
    label: ALERT_METRIC_LABELS.error_rate,
    icon: IconAlertTriangle,
    badgeVariant: "rose",
    unit: "%",
    placeholder: "5",
  },
  token_usage: {
    label: ALERT_METRIC_LABELS.token_usage,
    icon: IconStack2,
    badgeVariant: "blue",
    unit: "tokens",
    placeholder: "100000",
  },
  request_count: {
    label: ALERT_METRIC_LABELS.request_count,
    icon: IconChartDots,
    badgeVariant: "secondary",
    unit: "requests",
    placeholder: "1000",
  },
  eval_avg_score: {
    label: ALERT_METRIC_LABELS.eval_avg_score,
    icon: IconStar,
    badgeVariant: "violet",
    unit: "0–1",
    placeholder: "0.8",
  },
  eval_pass_rate: {
    label: ALERT_METRIC_LABELS.eval_pass_rate,
    icon: IconCircleCheck,
    badgeVariant: "violet",
    unit: "%",
    placeholder: "90",
  },
};

export const CREATABLE_METRIC_OPTIONS = CREATABLE_ALERT_METRICS.map(
  (value) => ({
    value,
    ...METRIC_META[value],
  }),
);

export const COMPARISON_OPTIONS = [
  { value: "gt", symbol: ">", label: "greater than" },
  { value: "gte", symbol: "≥", label: "greater than or equal" },
  { value: "lt", symbol: "<", label: "less than" },
  { value: "lte", symbol: "≤", label: "less than or equal" },
] as const;

export const WINDOW_PRESETS = [
  { value: "300", label: "5 minutes" },
  { value: "900", label: "15 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "24 hours" },
] as const;

export function isEvalMetric(metric: AlertMetric): boolean {
  return metric === "eval_avg_score" || metric === "eval_pass_rate";
}

export function isRateMetric(metric: AlertMetric): boolean {
  return metric === "error_rate" || metric === "eval_pass_rate";
}

export function thresholdToInput(metric: AlertMetric, value: number): string {
  return String(isRateMetric(metric) ? value * 100 : value);
}

export function thresholdFromInput(metric: AlertMetric, value: string): number {
  const parsed = Number(value);
  return isRateMetric(metric) ? parsed / 100 : parsed;
}

export function isCreatableMetric(
  metric: AlertMetric,
): metric is CreatableAlertMetric {
  return (CREATABLE_ALERT_METRICS as readonly string[]).includes(metric);
}
