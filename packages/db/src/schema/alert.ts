import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

import { evalDefinition } from "./eval";
import { project } from "./project";

export const alertMetric = pgEnum("alert_metric", [
  "cost",
  "latency_p50",
  "latency_p95",
  "latency_p99",
  "ttft_p95",
  "error_rate",
  "token_usage",
  "request_count",
  // Eval-score metrics — scoped to a single eval via alertRule.evalId.
  "eval_avg_score",
  "eval_pass_rate",
]);

export const alertComparison = pgEnum("alert_comparison", [
  "gt",
  "gte",
  "lt",
  "lte",
]);

export const alertStatus = pgEnum("alert_status", ["ok", "firing"]);

export const alertEventType = pgEnum("alert_event_type", ["fired", "resolved"]);

// Optional dimension filters applied when evaluating a rule.
export type AlertFilters = {
  modelId?: string;
  agentName?: string;
  workflowName?: string;
  metadata?: Record<string, string>;
};

// Notification channels (only email in this build).
export type AlertChannel = { type: "email"; to: string };

/**
 * Auto-diagnosis attached to a fired alert event. The deterministic parts
 * (`rows`, `traces`) are computed from ClickHouse for every plan; `summary` is
 * the LLM narrative and is present only for paid tiers (and within the per-rule
 * daily cap).
 */
export type AlertDiagnosis = {
  /** LLM root-cause narrative (plain text). */
  summary?: string;
  /** Model id that wrote `summary`. */
  model?: string;
  /** Deterministic label/value context rows (window delta, top contributors). */
  rows?: [label: string, value: string][];
  /** Top offending traces for the alert's metric. */
  traces?: { traceId: string; name: string; detail: string }[];
  generatedAt: string;
};

export const alertRule = pgTable(
  "alert_rule",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Existing rules predate automatic names and remain custom. New rules set
    // this true so condition edits can keep their generated label in sync until
    // the user explicitly customizes it.
    automaticName: boolean("automatic_name").default(false).notNull(),
    metric: alertMetric("metric").notNull(),
    // Set only for eval_avg_score / eval_pass_rate metrics; the alert then
    // reads that eval's score rollup instead of the span metrics rollup.
    evalId: text("eval_id").references(() => evalDefinition.id, {
      onDelete: "cascade",
    }),
    filters: jsonb("filters").$type<AlertFilters>(),
    windowSeconds: integer("window_seconds").notNull(),
    threshold: numeric("threshold", { precision: 24, scale: 10 }).notNull(),
    comparison: alertComparison("comparison").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    channels: jsonb("channels").$type<AlertChannel[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("alert_rule_projectId_idx").on(table.projectId)],
);

export const alertState = pgTable("alert_state", {
  ruleId: text("rule_id")
    .primaryKey()
    .references(() => alertRule.id, { onDelete: "cascade" }),
  status: alertStatus("status").default("ok").notNull(),
  lastValue: numeric("last_value", { precision: 24, scale: 10 }),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  // Anti-flap damping: consecutive breached / cleared-with-margin sweeps. A
  // rule fires only after FIRE_STREAK breaches and resolves only after
  // RESOLVE_STREAK margin-clear sweeps (see alertEvaluator).
  breachStreak: integer("breach_streak").default(0).notNull(),
  okStreak: integer("ok_streak").default(0).notNull(),
  // Daily caps, keyed by UTC day (YYYY-MM-DD). Counters reset when the stored
  // day differs from today.
  notifyDay: text("notify_day"),
  notifyCount: integer("notify_count").default(0).notNull(),
  diagnosisDay: text("diagnosis_day"),
  diagnosisCount: integer("diagnosis_count").default(0).notNull(),
  // Metric value at the time the last LLM diagnosis was written; a renotify
  // regenerates only when the value has moved materially since.
  lastDiagnosisValue: numeric("last_diagnosis_value", {
    precision: 24,
    scale: 10,
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const alertEvent = pgTable(
  "alert_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    ruleId: text("rule_id")
      .notNull()
      .references(() => alertRule.id, { onDelete: "cascade" }),
    type: alertEventType("type").notNull(),
    value: numeric("value", { precision: 24, scale: 10 }),
    threshold: numeric("threshold", { precision: 24, scale: 10 }),
    // Auto-diagnosis attached to fired events (null for resolved events and
    // for fires that predate the feature).
    diagnosis: jsonb("diagnosis").$type<AlertDiagnosis>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("alert_event_ruleId_idx").on(table.ruleId)],
);

export const alertRuleRelations = relations(alertRule, ({ one, many }) => ({
  project: one(project, {
    fields: [alertRule.projectId],
    references: [project.id],
  }),
  state: one(alertState, {
    fields: [alertRule.id],
    references: [alertState.ruleId],
  }),
  events: many(alertEvent),
}));

export const alertStateRelations = relations(alertState, ({ one }) => ({
  rule: one(alertRule, {
    fields: [alertState.ruleId],
    references: [alertRule.id],
  }),
}));

export const alertEventRelations = relations(alertEvent, ({ one }) => ({
  rule: one(alertRule, {
    fields: [alertEvent.ruleId],
    references: [alertRule.id],
  }),
}));
