import { relations } from "drizzle-orm";
import { index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

import { project } from "./project";

// Per-project price override that takes precedence over OpenRouter pricing.
// `modelPattern` matches a normalized model id (exact or glob). All eight
// OpenRouter price dimensions are stored per-token; unset (null) dimensions
// fall back to the resolved OpenRouter price.
const price = (name: string) => numeric(name, { precision: 24, scale: 12 });

export const customPricing = pgTable(
  "custom_pricing",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    modelPattern: text("model_pattern").notNull(),
    promptPrice: price("prompt_price"),
    completionPrice: price("completion_price"),
    requestPrice: price("request_price"),
    imagePrice: price("image_price"),
    webSearchPrice: price("web_search_price"),
    internalReasoningPrice: price("internal_reasoning_price"),
    cacheReadPrice: price("cache_read_price"),
    cacheWritePrice: price("cache_write_price"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("custom_pricing_projectId_idx").on(table.projectId)],
);

export const customPricingRelations = relations(customPricing, ({ one }) => ({
  project: one(project, {
    fields: [customPricing.projectId],
    references: [project.id],
  }),
}));
