import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

import { user } from "./auth";
import { organization } from "./organization";

export type OnboardingEmailMilestone = 1 | 3 | 7;
export type OnboardingEmailStatus = "pending" | "claimed" | "sent" | "skipped";

/**
 * Durable delivery queue for the personal onboarding notes sent after signup.
 * Rows are created for the same signup cohort as the welcome email, so invited
 * teammates do not enter this sequence.
 */
export const onboardingEmail = pgTable(
  "onboarding_email",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    milestoneDays: integer("milestone_days")
      .$type<OnboardingEmailMilestone>()
      .notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: text("status")
      .$type<OnboardingEmailStatus>()
      .default("pending")
      .notNull(),
    claimToken: text("claim_token"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("onboarding_email_userId_milestoneDays_unique").on(
      table.userId,
      table.milestoneDays,
    ),
    index("onboarding_email_status_scheduledAt_idx").on(
      table.status,
      table.scheduledAt,
    ),
  ],
);

export const onboardingEmailRelations = relations(onboardingEmail, ({ one }) => ({
  user: one(user, {
    fields: [onboardingEmail.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [onboardingEmail.orgId],
    references: [organization.id],
  }),
}));
