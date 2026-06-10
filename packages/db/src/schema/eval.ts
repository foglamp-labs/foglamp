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
  unique,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

import { project } from "./project";

export const evalScorerSource = pgEnum("eval_scorer_source", ["code", "llm"]);
export const evalTargetLevel = pgEnum("eval_target_level", ["trace", "span"]);
export const evalRunStatus = pgEnum("eval_run_status", [
  "ok",
  "paused_no_key",
  "error",
]);
export const providerName = pgEnum("provider_name", [
  "google",
  "openai",
  "anthropic",
]);
export const evalJobStatus = pgEnum("eval_job_status", [
  "pending",
  "running",
  "done",
  "dead",
]);

// Which traces/spans an eval scores. Empty = everything at the chosen level.
export type EvalFilters = {
  agentName?: string;
  workflowName?: string;
  traceName?: string;
  modelId?: string;
  spanType?: string;
  status?: string;
  metadata?: Record<string, string>;
};

// The judge model (llm scorers only). Provider must have a saved credential.
export type EvalModel = { provider: "google" | "openai" | "anthropic"; modelId: string };

// Per-eval overrides of preset defaults: judge rubric, code params, and the
// context-extraction selector (where RAG presets pull their context from).
export type EvalConfig = {
  promptOverride?: string;
  params?: Record<string, unknown>;
  contextSpec?: Record<string, unknown>;
};

export const evalDefinition = pgTable(
  "eval",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Catalog key identifying the scorer (see packages/api evals/presets.ts).
    presetId: text("preset_id").notNull(),
    scorerSource: evalScorerSource("scorer_source").notNull(),
    targetLevel: evalTargetLevel("target_level").notNull(),
    filters: jsonb("filters").$type<EvalFilters>(),
    // 0..1 fraction of matching targets to score (deterministic by target id).
    sampleRate: numeric("sample_rate", { precision: 5, scale: 4 })
      .default("0.1")
      .notNull(),
    model: jsonb("model").$type<EvalModel>(),
    config: jsonb("config").$type<EvalConfig>(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("eval_projectId_idx").on(table.projectId)],
);

export const evalState = pgTable("eval_state", {
  evalId: text("eval_id")
    .primaryKey()
    .references(() => evalDefinition.id, { onDelete: "cascade" }),
  // Future-only scoring: defaults to creation time, advances as the worker
  // processes newer spans (compared against spans.ingested_at).
  watermark: timestamp("watermark", { withTimezone: true })
    .defaultNow()
    .notNull(),
  status: evalRunStatus("status").default("ok").notNull(),
  lastScoredAt: timestamp("last_scored_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Durable scoring work queue. The planner claims a watermark window and inserts
// one job per (eval, window); executors lease jobs with FOR UPDATE SKIP LOCKED
// and re-query ClickHouse for the window's candidates. Scores collapse in
// storage (ReplacingMergeTree on score_id), so a retried job re-scoring the
// same window is idempotent — at-least-once is safe and beats silent gaps.
export const evalJob = pgTable(
  "eval_job",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    evalId: text("eval_id")
      .notNull()
      .references(() => evalDefinition.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    status: evalJobStatus("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    // Lease deadline while running; a job whose lease expired is reclaimed
    // (crashed executor) rather than stuck in `running` forever.
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("eval_job_evalId_idx").on(table.evalId),
    index("eval_job_status_createdAt_idx").on(table.status, table.createdAt),
  ],
);

// BYOK provider credentials, AES-256-GCM encrypted at rest (see crypto.ts).
// One key per provider per project; plaintext is never stored or returned.
export const providerCredential = pgTable(
  "provider_credential",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    provider: providerName("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").default(1).notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("provider_credential_project_provider_uq").on(
      table.projectId,
      table.provider,
    ),
  ],
);

export const evalDefinitionRelations = relations(evalDefinition, ({ one }) => ({
  project: one(project, {
    fields: [evalDefinition.projectId],
    references: [project.id],
  }),
  state: one(evalState, {
    fields: [evalDefinition.id],
    references: [evalState.evalId],
  }),
}));

export const evalStateRelations = relations(evalState, ({ one }) => ({
  eval: one(evalDefinition, {
    fields: [evalState.evalId],
    references: [evalDefinition.id],
  }),
}));

export const evalJobRelations = relations(evalJob, ({ one }) => ({
  eval: one(evalDefinition, {
    fields: [evalJob.evalId],
    references: [evalDefinition.id],
  }),
}));

export const providerCredentialRelations = relations(
  providerCredential,
  ({ one }) => ({
    project: one(project, {
      fields: [providerCredential.projectId],
      references: [project.id],
    }),
  }),
);
