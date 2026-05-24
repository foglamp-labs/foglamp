import { TRPCError } from "@trpc/server";
import { apiKey } from "@watchtower/db/schema/apiKey";
import { project } from "@watchtower/db/schema/project";
import { and, desc, eq } from "drizzle-orm";

import { generateApiKey, hashApiKey, keyPrefix, slugify } from "../lib/util";
import type { Db } from "../types";
import { requireOrgAccess, requireProjectAccess } from "./access";

/** Create a project in an org the user belongs to, with a unique slug. */
export async function createProject(
  db: Db,
  userId: string,
  input: { orgId: string; name: string },
) {
  await requireOrgAccess(db, userId, input.orgId);

  const base = slugify(input.name);
  // Resolve a slug unique within the org (slug, slug-2, slug-3, …).
  const existing = await db
    .select({ slug: project.slug })
    .from(project)
    .where(eq(project.orgId, input.orgId));
  const taken = new Set(existing.map((r) => r.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i += 1) slug = `${base}-${i}`;

  const rows = await db
    .insert(project)
    .values({ orgId: input.orgId, name: input.name, slug })
    .returning({
      id: project.id,
      name: project.name,
      slug: project.slug,
      orgId: project.orgId,
      createdAt: project.createdAt,
    });
  return rows[0]!;
}

/** API keys for a project (never returns the hash). */
export async function listApiKeys(db: Db, userId: string, projectId: string) {
  await requireProjectAccess(db, userId, projectId);
  return db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(eq(apiKey.projectId, projectId))
    .orderBy(desc(apiKey.createdAt));
}

/** Mint a key; the plaintext is returned once and never stored. */
export async function createApiKey(
  db: Db,
  userId: string,
  input: { projectId: string; name: string },
) {
  await requireProjectAccess(db, userId, input.projectId);

  const key = generateApiKey();
  const rows = await db
    .insert(apiKey)
    .values({
      projectId: input.projectId,
      name: input.name,
      keyHash: hashApiKey(key),
      keyPrefix: keyPrefix(key),
    })
    .returning({ id: apiKey.id, keyPrefix: apiKey.keyPrefix });

  // `key` is the only time the plaintext exists outside the caller.
  return { id: rows[0]!.id, name: input.name, keyPrefix: rows[0]!.keyPrefix, key };
}

/** Soft-revoke a key (sets revoked_at; ingest honors it within its cache TTL). */
export async function revokeApiKey(
  db: Db,
  userId: string,
  input: { projectId: string; keyId: string },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKey.id, input.keyId), eq(apiKey.projectId, input.projectId)))
    .returning({ id: apiKey.id });
  if (!rows[0]) {
    throw new TRPCError({ code: "NOT_FOUND", message: "API key not found" });
  }
  return { id: rows[0].id };
}
