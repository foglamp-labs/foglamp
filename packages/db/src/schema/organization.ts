import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

// Per-lever plan limits; `null` = unlimited. Used for the Enterprise override.
export type LimitsOverride = {
  spansPerMonth?: number | null;
  retentionDays?: number | null;
  alerts?: number | null;
  projects?: number | null;
};

// Tables owned by the better-auth `organization` plugin. Property keys must
// match the plugin's field names (id/name/slug/logo/metadata/organizationId/…);
// better-auth supplies the id, so no $defaultFn here. Column names are
// snake_case to match the rest of the schema.

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  // JSON-encoded by better-auth.
  metadata: text("metadata"),
  // Set by the @better-auth/stripe plugin (org = billing customer).
  stripeCustomerId: text("stripe_customer_id"),
  // Enterprise (sales-led) override: a plan name + custom limits set by us, no
  // self-serve checkout. Takes precedence over any subscription in getOrgPlan.
  planOverride: text("plan_override"),
  limitsOverride: jsonb("limits_override").$type<LimitsOverride>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    teamId: text("team_id"),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("invitation_organizationId_idx").on(table.organizationId)],
);

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  inviter: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));
