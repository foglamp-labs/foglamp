import type { ScanData } from "@foglamp/contracts/scan";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

import { user } from "./auth";

// Anonymous, unlisted codebase scans. No org/user FK — created by an agent via
// the public POST endpoint. `slug` is the unguessable public id in the URL; only
// the sha256 of the edit token is stored (like apiKey), so a holder of the raw
// token can update their scan in place. Anonymous rows expire (expiresAt set to
// +90d on create) and are swept by the scan cleanup cron.
// Physical table (and index) keep the original "poster" name — the product
// was renamed to Scan after shipping, and a table rename isn't worth a
// migration for an invisible identifier.
export const scan = pgTable(
  "poster",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    slug: text("slug").notNull().unique(),
    data: jsonb("data").$type<ScanData>().notNull(),
    /** The data as it was before the last editToken update — powers the
     *  "what changed since last scan" diff. Only one version is kept. */
    previousData: jsonb("previous_data").$type<ScanData>(),
    editTokenHash: text("edit_token_hash").notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    /** Set when a signed-in user claims the scan (which clears expiresAt). */
    claimedByUserId: text("claimed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("poster_expiresAt_idx").on(table.expiresAt)],
);

export type ScanRow = typeof scan.$inferSelect;
