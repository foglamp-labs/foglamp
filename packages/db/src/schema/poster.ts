import type { PosterData } from "@foglamp/contracts/poster";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

// Anonymous, unlisted codebase posters. No org/user FK — created by an agent via
// the public POST endpoint. `slug` is the unguessable public id in the URL; only
// the sha256 of the edit token is stored (like apiKey), so a holder of the raw
// token can update their poster in place. Anonymous rows expire (expiresAt set to
// +90d on create) and are swept by the poster cleanup cron.
export const poster = pgTable(
  "poster",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    slug: text("slug").notNull().unique(),
    data: jsonb("data").$type<PosterData>().notNull(),
    editTokenHash: text("edit_token_hash").notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("poster_expiresAt_idx").on(table.expiresAt)],
);

export type PosterRow = typeof poster.$inferSelect;
