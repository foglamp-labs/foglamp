import { TRPCError } from "@trpc/server";
import { customPricing } from "@foglamp/db/schema/pricing";
import { and, desc, eq } from "drizzle-orm";

import { decimalOrNull } from "../lib/util";
import type { Db } from "../types";
import { requireOrgRole, requireProjectAccess } from "./access";

// Custom pricing rewrites cost data for every span in the project, so writes
// are admin-gated like API keys and provider keys; reads stay member-level.
const ADMIN = ["owner", "admin"] as const;

// The eight OpenRouter price dimensions, stored per-token. Any unset dimension
// falls back to the resolved OpenRouter price at ingest time.
export type PriceDims = {
  promptPrice?: number | null;
  completionPrice?: number | null;
  requestPrice?: number | null;
  imagePrice?: number | null;
  webSearchPrice?: number | null;
  internalReasoningPrice?: number | null;
  cacheReadPrice?: number | null;
  cacheWritePrice?: number | null;
};

const DIMS = [
  "promptPrice",
  "completionPrice",
  "requestPrice",
  "imagePrice",
  "webSearchPrice",
  "internalReasoningPrice",
  "cacheReadPrice",
  "cacheWritePrice",
] as const;

function toColumns(dims: PriceDims): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const dim of DIMS) {
    const value = dims[dim];
    if (value !== undefined) out[dim] = value === null ? null : String(value);
  }
  return out;
}

export async function listCustomPricing(
  db: Db,
  userId: string,
  projectId: string,
) {
  await requireProjectAccess(db, userId, projectId);
  const rows = await db
    .select()
    .from(customPricing)
    .where(eq(customPricing.projectId, projectId))
    .orderBy(desc(customPricing.effectiveFrom));
  return rows.map((r) => ({
    id: r.id,
    modelPattern: r.modelPattern,
    promptPrice: decimalOrNull(r.promptPrice),
    completionPrice: decimalOrNull(r.completionPrice),
    requestPrice: decimalOrNull(r.requestPrice),
    imagePrice: decimalOrNull(r.imagePrice),
    webSearchPrice: decimalOrNull(r.webSearchPrice),
    internalReasoningPrice: decimalOrNull(r.internalReasoningPrice),
    cacheReadPrice: decimalOrNull(r.cacheReadPrice),
    cacheWritePrice: decimalOrNull(r.cacheWritePrice),
    effectiveFrom: r.effectiveFrom,
  }));
}

export async function createCustomPricing(
  db: Db,
  userId: string,
  input: { projectId: string; modelPattern: string; effectiveFrom?: Date } & PriceDims,
) {
  const proj = await requireProjectAccess(db, userId, input.projectId);
  await requireOrgRole(db, userId, proj.orgId, [...ADMIN]);
  const rows = await db
    .insert(customPricing)
    .values({
      projectId: input.projectId,
      modelPattern: input.modelPattern,
      ...(input.effectiveFrom ? { effectiveFrom: input.effectiveFrom } : {}),
      ...toColumns(input),
    })
    .returning({ id: customPricing.id });
  return { id: rows[0]!.id };
}

export async function updateCustomPricing(
  db: Db,
  userId: string,
  input: { id: string; projectId: string; modelPattern?: string } & PriceDims,
) {
  const proj = await requireProjectAccess(db, userId, input.projectId);
  await requireOrgRole(db, userId, proj.orgId, [...ADMIN]);
  const rows = await db
    .update(customPricing)
    .set({
      ...(input.modelPattern !== undefined
        ? { modelPattern: input.modelPattern }
        : {}),
      ...toColumns(input),
    })
    .where(
      and(
        eq(customPricing.id, input.id),
        eq(customPricing.projectId, input.projectId),
      ),
    )
    .returning({ id: customPricing.id });
  if (!rows[0]) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pricing rule not found" });
  }
  return { id: rows[0].id };
}

export async function deleteCustomPricing(
  db: Db,
  userId: string,
  input: { id: string; projectId: string },
) {
  const proj = await requireProjectAccess(db, userId, input.projectId);
  await requireOrgRole(db, userId, proj.orgId, [...ADMIN]);
  await db
    .delete(customPricing)
    .where(
      and(
        eq(customPricing.id, input.id),
        eq(customPricing.projectId, input.projectId),
      ),
    );
  return { id: input.id };
}
