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
    metric: alertMetric("metric").notNull(),
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
