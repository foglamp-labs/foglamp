import { TRPCError } from "@trpc/server";
import { member, organization } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import { and, eq } from "drizzle-orm";

import type { Db } from "../types";

export type AccessibleProject = {
  id: string;
  name: string;
  slug: string;
  orgId: string;
  /** The caller's role in the project's org — lets admin-gated writes skip a
   * second membership round-trip (pass it to `assertOrgRole`). */
  role: OrgRole;
};

/**
 * Resolve a project the user may read, or throw. Access = the user is a member
 * of the project's organization. Every data query funnels through this so a
 * caller can never read another org's spans. Also returns the caller's role so
 * admin-gated writes don't need a separate `requireOrgRole` round-trip.
 */
export async function requireProjectAccess(
  db: Db,
  userId: string,
  projectId: string,
): Promise<AccessibleProject> {
  const rows = await db
    .select({
      id: project.id,
      name: project.name,
      slug: project.slug,
      orgId: project.orgId,
      role: member.role,
    })
    .from(project)
    .innerJoin(member, eq(member.organizationId, project.orgId))
    .where(and(eq(project.id, projectId), eq(member.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Project not found or not accessible",
    });
  }
  return { ...row, role: row.role as OrgRole };
}

/** Throw unless the user is a member of the organization. */
export async function requireOrgAccess(
  db: Db,
  userId: string,
  orgId: string,
): Promise<void> {
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .limit(1);
  if (!rows[0]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Organization not found or not accessible",
    });
  }
}

export type OrgRole = "owner" | "admin" | "member";

/** Roles that may perform privileged writes (API keys, project management, billing). */
export const ADMIN = ["owner", "admin"] as const;

/**
 * Throw unless `role` is one of `roles`. Use with the role returned by
 * `requireProjectAccess` to gate an admin write without a second DB round-trip.
 */
export function assertOrgRole(
  role: OrgRole | undefined,
  roles: readonly OrgRole[],
): void {
  if (!role || !roles.includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Requires ${roles.join(" or ")} role`,
    });
  }
}

/**
 * Throw unless the user holds one of `roles` in the organization. Reads only
 * need `requireProjectAccess`/`requireOrgAccess`; sensitive writes (API keys,
 * project create/delete, billing) gate on this. Prefer `assertOrgRole` with the
 * role from `requireProjectAccess` when a project is already resolved.
 */
export async function requireOrgRole(
  db: Db,
  userId: string,
  orgId: string,
  roles: OrgRole[],
): Promise<void> {
  const rows = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .limit(1);
  const role = rows[0]?.role as OrgRole | undefined;
  if (!role || !roles.includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Requires ${roles.join(" or ")} role`,
    });
  }
}

/** Every project across the organizations the user belongs to. */
export async function listAccessibleProjects(db: Db, userId: string) {
  return db
    .select({
      id: project.id,
      name: project.name,
      slug: project.slug,
      url: project.url,
      orgId: project.orgId,
      orgName: organization.name,
      orgSlug: organization.slug,
      createdAt: project.createdAt,
    })
    .from(project)
    .innerJoin(member, eq(member.organizationId, project.orgId))
    .innerJoin(organization, eq(organization.id, project.orgId))
    .where(eq(member.userId, userId))
    .orderBy(project.createdAt);
}
