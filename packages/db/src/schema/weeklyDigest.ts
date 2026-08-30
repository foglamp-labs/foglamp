import {
	boolean,
	date,
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

/**
 * Per-(user, org) email preferences. A row exists only once the user has
 * explicitly changed something; absence means the role default (owners and
 * admins receive the weekly digest, members do not).
 */
export const notificationPreference = pgTable(
	"notification_preference",
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
		weeklyDigest: boolean("weekly_digest").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("notification_preference_user_org_unique").on(
			table.userId,
			table.orgId,
		),
		index("notification_preference_orgId_idx").on(table.orgId),
	],
);

export type WeeklyDigestStatus = "pending" | "claimed" | "sent" | "skipped";

/**
 * Durable one-row-per-(org, week) send queue for the weekly digest. Rows are
 * enqueued by the sweep once the week's send time has passed and claimed
 * before any external work, mirroring `onboarding_email`.
 */
export const weeklyDigest = pgTable(
	"weekly_digest",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv7()),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		/** Monday (UTC) of the week the digest covers, YYYY-MM-DD. */
		weekStart: date("week_start").notNull(),
		status: text("status")
			.$type<WeeklyDigestStatus>()
			.default("pending")
			.notNull(),
		claimToken: text("claim_token"),
		claimedAt: timestamp("claimed_at", { withTimezone: true }),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		/** How many emails went out (0 for a skipped or quiet week). */
		recipients: integer("recipients").default(0).notNull(),
		/** Why the row ended as it did: "digest", "nudge", "quiet", "no_recipients". */
		outcome: text("outcome"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("weekly_digest_org_week_unique").on(table.orgId, table.weekStart),
		index("weekly_digest_status_idx").on(table.status),
	],
);
