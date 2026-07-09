import {
  queryClickHouseDisks,
  queryClickHouseTableStats,
  queryPlatformErrorsByDay,
  queryPlatformTopOrgs,
  queryPlatformUsageByDay,
  queryRecentlyActiveOrgs,
} from "@foglamp/clickhouse";
import { user } from "@foglamp/db/schema/auth";
import { member, organization } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import { scan } from "@foglamp/db/schema/scan";
import { subscription } from "@foglamp/db/schema/subscription";
import { env } from "@foglamp/env/server";
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";
import Stripe from "stripe";

import { createLogger } from "evlog";

import { ymd } from "../lib/util";
import type { Ch, Db } from "../types";

/**
 * Hosted-operator allowlist. Platform stats are cross-org (every customer's
 * usage), so this is gated by operator email, not org role. Unset on
 * self-hosts → nobody, and the UI entry point stays hidden.
 */
export function getPlatformAdminEmails(): string[] {
  return (env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string): boolean {
  return getPlatformAdminEmails().includes(email.toLowerCase());
}

const log = createLogger();

const ACTIVE_SUB_STATUSES = ["active", "trialing", "past_due"];

let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}

/**
 * MRR in cents, summed from live Stripe subscriptions (amounts live in Stripe,
 * not our subscription mirror). Only items on our configured price IDs count,
 * so unrelated products in the same Stripe account can't skew the number.
 * Annual prices are normalized to per-month. Null when billing is disabled or
 * Stripe is unreachable — the page shows "—" rather than a fake zero.
 */
async function getMrrCents(): Promise<number | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const ourPriceIds = new Set(
    [env.STRIPE_PRICE_ID_PRO_MONTHLY, env.STRIPE_PRICE_ID_PRO_ANNUAL].filter(
      Boolean,
    ),
  );
  if (ourPriceIds.size === 0) return null;
  try {
    let total = 0;
    for await (const sub of stripe.subscriptions.list({
      status: "active",
      limit: 100,
    })) {
      for (const item of sub.items.data) {
        const price = item.price;
        if (!price?.unit_amount || !price.recurring) continue;
        if (!ourPriceIds.has(price.id)) continue;
        const amount = price.unit_amount * (item.quantity ?? 1);
        const { interval, interval_count: n } = price.recurring;
        const months =
          interval === "year"
            ? 12 * n
            : interval === "month"
              ? n
              : interval === "week"
                ? (7 * n) / 30
                : n / 30;
        total += amount / months;
      }
    }
    return Math.round(total);
  } catch (err) {
    log.error("platform.stripe_mrr_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Postgres database size + heaviest tables (pg catalog; no GCP API needed). */
async function getPostgresStats(db: Db) {
  const [sizeRows, tableRows] = await Promise.all([
    db.execute(
      sql`SELECT pg_database_size(current_database()) AS bytes`,
    ) as Promise<{ rows: { bytes: string }[] }>,
    db.execute(sql`
      SELECT c.relname AS table, pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY bytes DESC
      LIMIT 8
    `) as Promise<{ rows: { table: string; bytes: string }[] }>,
  ]);
  return {
    totalBytes: Number(sizeRows.rows[0]?.bytes ?? 0),
    tables: tableRows.rows.map((r) => ({
      table: r.table,
      bytes: Number(r.bytes),
    })),
  };
}

// min() collapses the (rare) multi-owner case to one deterministic email.
const ownerEmail = sql<string | null>`min(${user.email})`;
// Owner avatar, paired with ownerEmail. min() over a different column can in
// theory pick a different owner's image than email when an org has several
// owners; acceptable for an operator dashboard (same tradeoff as ownerEmail).
const ownerImage = sql<string | null>`min(${user.image})`;

// How many orgs the platform "top organizations" panel surfaces. Volume leaders
// come first; the rest is filled with the most recent (often zero-volume) orgs.
const TOP_ORGS_DISPLAY = 12;

/** Org lookup for the access-grant UI (name or slug, case-insensitive). */
export async function searchOrgs(db: Db, query: string) {
  const pattern = `%${query}%`;
  return db
    .select({
      id: organization.id,
      name: organization.name,
      ownerEmail,
      planOverride: organization.planOverride,
      overrideExpiresAt: organization.overrideExpiresAt,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .leftJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.role, "owner"),
      ),
    )
    .leftJoin(user, eq(user.id, member.userId))
    .where(
      or(
        ilike(organization.name, pattern),
        ilike(organization.slug, pattern),
        ilike(user.email, pattern),
      ),
    )
    .groupBy(organization.id)
    .limit(10);
}

/** All orgs with a plan override, live or lapsed (the UI labels expired ones). */
export async function listAccessGrants(db: Db) {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      ownerEmail,
      planOverride: organization.planOverride,
      overrideExpiresAt: organization.overrideExpiresAt,
    })
    .from(organization)
    .leftJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.role, "owner"),
      ),
    )
    .leftJoin(user, eq(user.id, member.userId))
    .where(isNotNull(organization.planOverride))
    .groupBy(organization.id)
    .orderBy(desc(organization.createdAt));
}

/**
 * Comp an org up to enterprise limits (unlimited spans/projects/alerts/evals,
 * 90d retention), optionally time-boxed. Expiry is enforced at read time in
 * getOrgPlan, so the grant lapses on its own. Ingest caches plans for ~60s,
 * so grants/revocations take effect within a minute.
 */
export async function grantOrgAccess(
  db: Db,
  params: { orgId: string; days: number | null },
) {
  const overrideExpiresAt = params.days
    ? new Date(Date.now() + params.days * 86_400_000)
    : null;
  // limitsOverride is left untouched so a sales-led custom-limits org keeps
  // its negotiated levers if we extend its grant.
  await db
    .update(organization)
    .set({ planOverride: "comp", overrideExpiresAt })
    .where(eq(organization.id, params.orgId));
}

export async function revokeOrgAccess(db: Db, orgId: string) {
  await db
    .update(organization)
    .set({ planOverride: null, limitsOverride: null, overrideExpiresAt: null })
    .where(eq(organization.id, orgId));
}

/** Cross-org platform snapshot for the operator dashboard. */
export async function getPlatformStats(db: Db, ch: Ch) {
  const now = Date.now();
  const since7d = new Date(now - 7 * 86_400_000);
  const since30d = new Date(now - 30 * 86_400_000);

  const [
    [
      userRows,
      users7dRows,
      orgRows,
      projectRows,
      memberRows,
      subRows,
      orgsWithProjectsRows,
      planRows,
      signupRows,
    ],
    usageByDay,
    errorsByDay,
    topOrgRows,
    chTables,
    chDisks,
    activeOrgIds30d,
    mrrCents,
    postgres,
    scanRows,
  ] = await Promise.all([
    Promise.all([
      db.select({ n: count() }).from(user),
      db.select({ n: count() }).from(user).where(gte(user.createdAt, since7d)),
      db.select({ n: count() }).from(organization),
      db.select({ n: count() }).from(project),
      db.select({ n: count() }).from(member),
      db
        .select({ n: count() })
        .from(subscription)
        .where(inArray(subscription.status, ACTIVE_SUB_STATUSES)),
      db.select({ n: countDistinct(project.orgId) }).from(project),
      db
        .select({ plan: subscription.plan, n: count() })
        .from(subscription)
        .where(inArray(subscription.status, ACTIVE_SUB_STATUSES))
        .groupBy(subscription.plan),
      db
        .select({
          day: sql<string>`to_char(${user.createdAt}, 'YYYY-MM-DD')`,
          n: count(),
        })
        .from(user)
        .where(gte(user.createdAt, since30d))
        .groupBy(sql`to_char(${user.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${user.createdAt}, 'YYYY-MM-DD')`),
    ]),
    queryPlatformUsageByDay(ch, ymd(since30d)),
    queryPlatformErrorsByDay(ch, ymd(since30d)),
    queryPlatformTopOrgs(ch, ymd(since30d), 10),
    queryClickHouseTableStats(ch),
    queryClickHouseDisks(ch),
    queryRecentlyActiveOrgs(ch, ymd(since30d)),
    getMrrCents(),
    getPostgresStats(db),
    // Anonymous codebase scans (physical table "poster"): total, last 7d, and
    // cumulative views across every scan page.
    db
      .select({
        total: count(),
        last7d: sql<number>`count(*) filter (where ${scan.createdAt} >= ${since7d})`,
        views: sql<number>`coalesce(sum(${scan.viewCount}), 0)`,
      })
      .from(scan),
  ]);

  // Build the top-orgs panel: CH only has ids + span counts, so resolve org
  // names and owner contact info from Postgres. We pull two sets and merge:
  //   - the volume leaders (so a high-traffic but old org always resolves), and
  //   - the most recent orgs (so freshly-signed-up, zero-volume orgs show too).
  const topOrgIds = topOrgRows.map((r) => r.org_id);
  const spansById = new Map(
    topOrgRows.map((r) => [r.org_id, Number(r.span_count)]),
  );
  const withOwner = {
    id: organization.id,
    name: organization.name,
    ownerEmail,
    ownerImage,
    createdAt: organization.createdAt,
  };
  const [volumeOrgRows, recentOrgRows] = await Promise.all([
    topOrgIds.length
      ? db
          .select(withOwner)
          .from(organization)
          .leftJoin(
            member,
            and(
              eq(member.organizationId, organization.id),
              eq(member.role, "owner"),
            ),
          )
          .leftJoin(user, eq(user.id, member.userId))
          .where(inArray(organization.id, topOrgIds))
          .groupBy(organization.id)
      : Promise.resolve([]),
    db
      .select(withOwner)
      .from(organization)
      .leftJoin(
        member,
        and(
          eq(member.organizationId, organization.id),
          eq(member.role, "owner"),
        ),
      )
      .leftJoin(user, eq(user.id, member.userId))
      .groupBy(organization.id)
      .orderBy(desc(organization.createdAt))
      .limit(TOP_ORGS_DISPLAY),
  ]);
  const orgById = new Map<string, (typeof recentOrgRows)[number]>();
  for (const o of recentOrgRows) orgById.set(o.id, o);
  for (const o of volumeOrgRows) orgById.set(o.id, o);

  const spans30d = usageByDay.reduce((acc, r) => acc + Number(r.span_count), 0);
  const spans24h = usageByDay
    .filter((r) => r.day >= ymd(new Date(now - 86_400_000)))
    .reduce((acc, r) => acc + Number(r.span_count), 0);

  const totalOrgs = orgRows[0]?.n ?? 0;
  const paidOrgs = subRows[0]?.n ?? 0;
  const errorByDayMap = new Map(
    errorsByDay.map((r) => [
      r.day,
      { spans: Number(r.span_count), errors: Number(r.error_count) },
    ]),
  );
  return {
    totals: {
      users: userRows[0]?.n ?? 0,
      usersLast7d: users7dRows[0]?.n ?? 0,
      orgs: totalOrgs,
      projects: projectRows[0]?.n ?? 0,
      memberships: memberRows[0]?.n ?? 0,
      activeSubscriptions: paidOrgs,
    },
    // Null when billing is off / Stripe unreachable.
    mrrCents,
    // Active paid plans by name + the implied free remainder.
    plans: [
      ...planRows.map((r) => ({ plan: r.plan, orgs: r.n })),
      { plan: "free", orgs: Math.max(0, totalOrgs - paidOrgs) },
    ],
    // Signup → created a project → sent spans (30d) → paying.
    funnel: {
      users: userRows[0]?.n ?? 0,
      orgsWithProjects: orgsWithProjectsRows[0]?.n ?? 0,
      orgsActive30d: activeOrgIds30d.length,
      paidOrgs,
    },
    spans: { last24h: spans24h, last30d: spans30d },
    scans: {
      total: scanRows[0]?.total ?? 0,
      last7d: Number(scanRows[0]?.last7d ?? 0),
      views: Number(scanRows[0]?.views ?? 0),
    },
    signupsByDay: signupRows.map((r) => ({ day: r.day, users: r.n })),
    usageByDay: usageByDay.map((r) => {
      const err = errorByDayMap.get(r.day);
      return {
        day: r.day,
        spans: Number(r.span_count),
        activeOrgs: Number(r.active_orgs),
        errors: err?.errors ?? 0,
        errorRate: err && err.spans > 0 ? err.errors / err.spans : 0,
      };
    }),
    // Volume leaders first, then the most recent orgs (zero-volume included),
    // capped to the panel size.
    topOrgs: [...orgById.values()]
      .map((o) => ({
        orgId: o.id,
        name: o.name,
        ownerEmail: o.ownerEmail,
        ownerImage: o.ownerImage,
        spans: spansById.get(o.id) ?? 0,
        createdAt: o.createdAt,
      }))
      .sort(
        (a, b) =>
          b.spans - a.spans ||
          (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
      )
      .slice(0, TOP_ORGS_DISPLAY)
      .map(({ createdAt: _createdAt, ...rest }) => rest),
    postgres,
    clickhouse: {
      tables: chTables.map((t) => ({
        table: t.table,
        rows: Number(t.row_count),
        bytes: Number(t.bytes_on_disk),
      })),
      disks: chDisks.map((d) => ({
        name: d.name,
        freeBytes: Number(d.free_space),
        totalBytes: Number(d.total_space),
      })),
    },
  };
}
