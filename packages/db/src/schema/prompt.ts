import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

import { project } from "./project";

// Prompt versions inferred from runs (packages/prompts inferVersions). Nothing
// here is user-declared: the prompt-version job groups the distinct system
// prompts an agent has run with into versions and keeps them current as new
// runs arrive. Version ids are stable across re-inference (matched by shared
// hashes) so evals can pin one.
export const promptVersion = pgTable(
  "prompt_version",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    agentName: text("agent_name").notNull(),
    // 1-based per agent, in order of first appearance (the "v3" label).
    number: integer("number").notNull(),
    // Canonical prompt with varying stretches blanked to a `{…}` line.
    template: text("template").notNull(),
    slotCount: integer("slot_count").default(0).notNull(),
    hashCount: integer("hash_count").default(0).notNull(),
    runCount: integer("run_count").default(0).notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("prompt_version_agent_idx").on(table.projectId, table.agentName)],
);

// One row per distinct normalized prompt (its hash) per agent — the inference
// input, rolled up from ClickHouse by the job. `text` is a (capped) sample of
// the normalized prompt so re-inference never needs to re-read spans.
export const promptHash = pgTable(
  "prompt_hash",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    agentName: text("agent_name").notNull(),
    hash: text("hash").notNull(),
    text: text("text").notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
    runCount: integer("run_count").default(0).notNull(),
    versionId: text("version_id").references(() => promptVersion.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.agentName, table.hash] }),
    index("prompt_hash_version_idx").on(table.versionId),
  ],
);

// Job state: how far into ClickHouse (spans.ingested_at) the sweep has read.
// A single row; the sweep is global and serialized by an advisory lock.
export const promptInferState = pgTable("prompt_infer_state", {
  id: text("id").primaryKey(),
  watermark: timestamp("watermark", { withTimezone: true }).notNull(),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
