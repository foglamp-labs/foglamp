import { TRPCError } from "@trpc/server";
import { getOrgPlan } from "@foglamp/billing";
import { deleteProjectData } from "@foglamp/clickhouse";
import { apiKey } from "@foglamp/db/schema/apiKey";
import { project } from "@foglamp/db/schema/project";
import { and, count, desc, eq } from "drizzle-orm";

import { generateApiKey, hashApiKey, keyPrefix, slugify } from "../lib/util";
import type { Ch, Db } from "../types";
import {
  ADMIN,
  listAccessibleProjects,
  requireOrgRole,
  requireProjectAccess,
} from "./access";

/** Create a project in an org the user belongs to, with a unique slug. */
export async function createProject(
  db: Db,
  userId: string,
  input: { orgId: string; name: string; url?: string | null },
) {
  await requireOrgRole(db, userId, input.orgId, [...ADMIN]);

  // Plan limit: cap projects per org (null = unlimited).
  const { limits } = await getOrgPlan(input.orgId);
  if (limits.projects !== null) {
    const rows = await db
      .select({ n: count() })
      .from(project)
      .where(eq(project.orgId, input.orgId));
    if ((rows[0]?.n ?? 0) >= limits.projects) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Your plan allows ${limits.projects} project${limits.projects === 1 ? "" : "s"}. Upgrade to add more.`,
      });
    }
  }

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
    .values({ orgId: input.orgId, name: input.name, slug, url: input.url || null })
    .returning({
      id: project.id,
      name: project.name,
      slug: project.slug,
      url: project.url,
      orgId: project.orgId,
      createdAt: project.createdAt,
    });
  return rows[0]!;
}

/** Update a project's editable fields (name, url). Re-derives nothing. */
export async function updateProject(
  db: Db,
  userId: string,
  input: { projectId: string; name?: string; url?: string | null },
) {
  const proj = await requireProjectAccess(db, userId, input.projectId);
  await requireOrgRole(db, userId, proj.orgId, [...ADMIN]);

  const patch: { name?: string; url?: string | null } = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.url !== undefined) patch.url = input.url || null;

  const rows = await db
    .update(project)
    .set(patch)
    .where(eq(project.id, input.projectId))
    .returning({
      id: project.id,
      name: project.name,
      slug: project.slug,
      url: project.url,
      orgId: project.orgId,
      createdAt: project.createdAt,
    });
  if (!rows[0]) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  return rows[0];
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
  const proj = await requireProjectAccess(db, userId, input.projectId);
  await requireOrgRole(db, userId, proj.orgId, [...ADMIN]);

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

/**
 * Mint an API key for `npx foglamp login`. Resolves the user's default project
 * (the "default"-slug project the signup bootstrap creates, falling back to
 * their earliest project for edge/legacy accounts) and mints a key against it.
 * Called by the device-auth flow once the user approves in the browser.
 */
export async function provisionCliKey(db: Db, userId: string, name = "CLI") {
  const projects = await listAccessibleProjects(db, userId);
  // listAccessibleProjects is ordered by createdAt, so projects[0] is earliest.
  const target = projects.find((p) => p.slug === "default") ?? projects[0];
  if (!target) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No project found for this account",
    });
  }
  const minted = await createApiKey(db, userId, { projectId: target.id, name });
  return { key: minted.key, projectId: target.id, projectName: target.name };
}

/** Soft-revoke a key (sets revoked_at; ingest honors it within its cache TTL). */
export async function revokeApiKey(
  db: Db,
  userId: string,
  input: { projectId: string; keyId: string },
) {
  const proj = await requireProjectAccess(db, userId, input.projectId);
  await requireOrgRole(db, userId, proj.orgId, [...ADMIN]);
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

/**
 * Hard-delete a key row. Used for ephemeral bootstrap keys (e.g. the onboarding
 * key the dashboard re-mints) so revoked rows don't accumulate. For
 * user-managed keys prefer revoke (keeps an auditable row).
 */
export async function deleteApiKey(
  db: Db,
  userId: string,
  input: { projectId: string; keyId: string },
) {
  const proj = await requireProjectAccess(db, userId, input.projectId);
  await requireOrgRole(db, userId, proj.orgId, [...ADMIN]);
  await db
    .delete(apiKey)
    .where(and(eq(apiKey.id, input.keyId), eq(apiKey.projectId, input.projectId)));
  return { id: input.keyId };
}

/**
 * Delete a project: Postgres cascades remove its keys/alerts/evals/pricing/
 * workflow-run-names; ClickHouse has no FKs so its spans/scores are purged
 * explicitly. Admin+ only.
 */
export async function deleteProject(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string },
) {
  const proj = await requireProjectAccess(db, userId, input.projectId);
  await requireOrgRole(db, userId, proj.orgId, [...ADMIN]);
  await db.delete(project).where(eq(project.id, input.projectId));
  await deleteProjectData(ch, input.projectId); // async CH mutation
  return { id: input.projectId };
}
