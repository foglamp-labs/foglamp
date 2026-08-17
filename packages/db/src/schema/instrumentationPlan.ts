import type {
  AppliedReport,
  DetectedPlan,
  Decisions,
  PlanStatus,
} from "@foglamp/contracts/instrumentation";
import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

import { apiKey } from "./apiKey";
import { organization } from "./organization";
import { project } from "./project";

// The onboarding approval loop's durable state. A coding agent uploads a
// detected plan (authenticating with the project's API key), then long-polls
// this row until the user approves it in the browser at /setup/<id>.
//
// Everything lives here rather than in process memory: the agent and the
// browser hit different apps, and the loop has to survive restarts and run
// across multiple instances.
//
// `status` is only ever moved through canTransition() in
// @foglamp/contracts/instrumentation, via conditional
// `UPDATE ... WHERE status = <expected>` so retries and concurrent requests are
// idempotent rather than racy.
export const instrumentationPlan = pgTable(
  "instrumentation_plan",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    // Denormalized from project so an agent request never needs a join to
    // scope itself — matches how ingest carries orgId on a resolved key.
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Which key uploaded this. Not a user id: api_key has no creator column,
    // and a key's "owner" is resolved as the org owner, not the minter.
    createdByApiKeyId: text("created_by_api_key_id").references(() => apiKey.id, {
      onDelete: "set null",
    }),

    status: text("status").$type<PlanStatus>().default("awaiting_approval").notNull(),

    /** What the agent found, before touching any code. */
    detected: jsonb("detected").$type<DetectedPlan>().notNull(),
    /** The decisions as approved — Stage 1 copies `detected`; Stage 2 will diverge. */
    approved: jsonb("approved").$type<Decisions>(),
    /** The after-state the agent reports once the edits are in. */
    applied: jsonb("applied").$type<AppliedReport>(),
    /** Which stage the agent gave up at, when status is `failed`. */
    failureStage: text("failure_stage"),

    // Each timestamp flips null → non-null exactly once. That flip (observed
    // via RETURNING on a conditional UPDATE) is what makes the analytics
    // events fire once, no matter how often a page reloads or an agent polls.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    /** First time the agent observed the approval and resumed on its own. */
    agentResumedAt: timestamp("agent_resumed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    /** The first real span's trace id — the proof that onboarding worked. */
    firstTraceId: text("first_trace_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("instrumentation_plan_projectId_idx").on(table.projectId),
    // The expiry sweep: unfinished plans past their deadline.
    index("instrumentation_plan_status_expiresAt_idx").on(table.status, table.expiresAt),
  ],
);

export const instrumentationPlanRelations = relations(instrumentationPlan, ({ one }) => ({
  project: one(project, {
    fields: [instrumentationPlan.projectId],
    references: [project.id],
  }),
}));

export type InstrumentationPlanRow = typeof instrumentationPlan.$inferSelect;
