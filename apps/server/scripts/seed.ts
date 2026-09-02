import { createHash, randomBytes } from "node:crypto";

import { auth } from "@foglamp/auth";
import { db } from "@foglamp/db";
import { apiKey } from "@foglamp/db/schema/apiKey";
import { member, organization } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import { user } from "@foglamp/db/schema/auth";
import { env } from "@foglamp/env/server";
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

const DEFAULT_ADMIN_EMAIL = "admin@foglamp.local";
const DEFAULT_ORG_NAME = "Foglamp";
const DEFAULT_ORG_SLUG = "foglamp";
const DEFAULT_PROJECT_NAME = "Default";
const DEFAULT_PROJECT_SLUG = "default";
const DEFAULT_KEY_NAME = "Default key";

// `fl_` + 32 url-safe bytes. Only the sha256 hash is persisted; this must match
// the ingest resolver's hashing (apps/ingest/src/apiKey.ts).
function generateApiKey() {
  return `fl_${randomBytes(32).toString("base64url")}`;
}

function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

const banner: string[] = [];

async function ensureAdminUser() {
  const email = (env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).toLowerCase();

  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing[0]) {
    console.log(`✓ admin user already exists (${email})`);
    return { id: existing[0].id, email };
  }

  // Honor a provided password; otherwise mint a strong one and surface it once.
  const provided = env.ADMIN_PASSWORD;
  const password = provided ?? randomBytes(18).toString("base64url");

  // better-auth owns password hashing + the linked account row, so route user
  // creation through it rather than inserting into `user`/`account` by hand.
  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Admin" },
  });

  console.log(`✓ created admin user (${email})`);
  if (!provided) {
    banner.push(`  Admin email:    ${email}`);
    banner.push(`  Admin password: ${password}`);
  }

  return { id: result.user.id, email };
}

async function ensureOrganization() {
  const existing = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, DEFAULT_ORG_SLUG))
    .limit(1);

  if (existing[0]) {
    console.log(`✓ organization already exists (${DEFAULT_ORG_SLUG})`);
    return existing[0].id;
  }

  const id = uuidv7();
  await db.insert(organization).values({
    id,
    name: DEFAULT_ORG_NAME,
    slug: DEFAULT_ORG_SLUG,
  });
  console.log(`✓ created organization (${DEFAULT_ORG_SLUG})`);
  return id;
}

async function ensureMembership(orgId: string, userId: string) {
  const existing = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .limit(1);

  if (existing[0]) {
    console.log("✓ membership already exists");
    return;
  }

  // The organization plugin grants the creator the "owner" role.
  await db.insert(member).values({
    id: uuidv7(),
    organizationId: orgId,
    userId,
    role: "owner",
  });
  console.log("✓ created membership (owner)");
}

async function ensureProject(orgId: string) {
  const existing = await db
    .select({ id: project.id })
    .from(project)
    .where(
      and(eq(project.orgId, orgId), eq(project.slug, DEFAULT_PROJECT_SLUG)),
    )
    .limit(1);

  if (existing[0]) {
    console.log(`✓ project already exists (${DEFAULT_PROJECT_SLUG})`);
    return existing[0].id;
  }

  const id = uuidv7();
  await db.insert(project).values({
    id,
    orgId,
    name: DEFAULT_PROJECT_NAME,
    slug: DEFAULT_PROJECT_SLUG,
  });
  console.log(`✓ created project (${DEFAULT_PROJECT_SLUG})`);
  return id;
}

async function ensureApiKey(projectId: string) {
  const existing = await db
    .select({ id: apiKey.id, keyPrefix: apiKey.keyPrefix })
    .from(apiKey)
    .where(eq(apiKey.projectId, projectId))
    .limit(1);

  if (existing[0]) {
    console.log(
      `✓ API key already exists (${existing[0].keyPrefix}…) — not reprinted`,
    );
    return;
  }

  const key = generateApiKey();
  await db.insert(apiKey).values({
    id: uuidv7(),
    projectId,
    name: DEFAULT_KEY_NAME,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, 11),
  });
  console.log("✓ created API key");
  banner.push(`  API key:        ${key}`);
}

async function main() {
  console.log("Seeding Foglamp…\n");

  const admin = await ensureAdminUser();
  const orgId = await ensureOrganization();
  await ensureMembership(orgId, admin.id);
  const projectId = await ensureProject(orgId);
  await ensureApiKey(projectId);

  if (banner.length > 0) {
    console.log(
      "\n──────────────────────────────────────────────────────────────",
    );
    console.log("  Save these now — they are shown only once:\n");
    for (const line of banner) console.log(line);
    console.log(
      "──────────────────────────────────────────────────────────────",
    );
  }

  console.log("\nSeed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exit(1);
  });
