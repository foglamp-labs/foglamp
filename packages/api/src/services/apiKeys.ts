import { apiKey } from "@foglamp/db/schema/apiKey";
import { member } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import { and, eq } from "drizzle-orm";

import { hashApiKey } from "../lib/util";
import type { Db } from "../types";

// API-key resolution for the control-plane routes an agent calls during
// onboarding (apps/server/src/instrumentation.ts).
//
// Deliberately a separate, cache-free implementation from the ingest resolver
// in apps/ingest/src/apiKey.ts — same query shape, but that one is the span hot
// path with an in-memory TTL cache tuned for volume, and it lives in a
// different process. These routes are low-volume (a handful of calls per
// onboarding), so they read straight through: a revoked key stops working
// immediately, with no staleness window.

export type ResolvedKey = {
  apiKeyId: string;
  projectId: string;
  orgId: string;
  /**
   * The org's owner — the same identity ingest attributes activation events to.
   * Not the person who minted the key: `api_key` has no creator column.
   */
  ownerUserId: string | null;
};

/** Resolve a presented `fl_…` key to its project, or null if unknown/revoked. */
export async function resolveApiKeyForRequest(
  db: Db,
  key: string,
): Promise<ResolvedKey | null> {
  if (!key) return null;
  const hash = hashApiKey(key);

  const rows = await db
    .select({
      id: apiKey.id,
      projectId: apiKey.projectId,
      orgId: project.orgId,
      ownerUserId: member.userId,
      revokedAt: apiKey.revokedAt,
    })
    .from(apiKey)
    .innerJoin(project, eq(project.id, apiKey.projectId))
    .leftJoin(member, and(eq(member.organizationId, project.orgId), eq(member.role, "owner")))
    .where(eq(apiKey.keyHash, hash))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt) return null;
  return {
    apiKeyId: row.id,
    projectId: row.projectId,
    orgId: row.orgId,
    ownerUserId: row.ownerUserId,
  };
}
