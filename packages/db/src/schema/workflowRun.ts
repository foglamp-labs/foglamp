import { relations } from "drizzle-orm";
import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { project } from "./project";
import { user } from "./auth";

// User-editable display name for a workflow run. The run id is supplied by the
// SDK and is only unique within a project, so the PK is composite. Absence of a
// row means "use the raw workflow_run_id" in the UI.
export const workflowRunName = pgTable(
  "workflow_run_name",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    workflowRunId: text("workflow_run_id").notNull(),
    name: text("name").notNull(),
    renamedBy: text("renamed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.workflowRunId] }),
  ],
);

export const workflowRunNameRelations = relations(
  workflowRunName,
  ({ one }) => ({
    project: one(project, {
      fields: [workflowRunName.projectId],
      references: [project.id],
    }),
    renamedByUser: one(user, {
      fields: [workflowRunName.renamedBy],
      references: [user.id],
    }),
  }),
);
