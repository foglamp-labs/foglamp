import { db } from "@foglamp/db";
import { organization } from "@foglamp/db/schema/organization";
import { subscription } from "@foglamp/db/schema/subscription";
import { env } from "@foglamp/env/server";
import { and, eq, inArray } from "drizzle-orm";

// Billing is the gate for the whole metering system. It's enabled when Stripe
// is configured (the same condition that registers the Stripe auth plugin).
// When disabled (self-host / no Stripe), the platform is UNMETERED: no plan
// limits are enforced anywhere.
export function isBillingEnabled(): boolean {
  // Both are required: without the webhook secret, subscription state never
  // syncs, so enforcing limits would strand orgs with no way to upgrade.
  return !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET;
}

// Plan limits are the single source of truth for the whole product (API gates,
// ingest quota, the usage tab). `null` = unlimited. Free is the fallback when an
// org has no active subscription and no Enterprise override.

export type PlanName = "free" | "pro" | "enterprise" | "unmetered";

export type PlanLimits = {
  spansPerMonth: number | null;
  retentionDays: number | null;
  alerts: number | null;
  projects: number | null;
  evals: number | null;
};

// All-unlimited; used when billing is disabled (self-host).
const UNLIMITED: PlanLimits = {
  spansPerMonth: null,
  retentionDays: null,
  alerts: null,
  projects: null,
  evals: null,
};

// The selectable plans (unmetered isn't a plan — it's the billing-off state).
export const PLAN_LIMITS: Record<Exclude<PlanName, "unmetered">, PlanLimits> = {
  free: { spansPerMonth: 10_000, retentionDays: 3, alerts: 1, projects: 1, evals: 5 },
  pro: { spansPerMonth: 1_000_000, retentionDays: 14, alerts: 10, projects: 5, evals: 20 },
  // Enterprise defaults; per-org overrides merge on top (see getOrgPlan).
  enterprise: {
    spansPerMonth: null,
    retentionDays: 90,
    alerts: null,
    projects: null,
    evals: null,
  },
};

// The default retention stamped on spans for orgs with no plan resolved yet
// (also the ClickHouse column default that grandfathers pre-plan rows).
export const DEFAULT_RETENTION_DAYS = 3;

const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

export type OrgPlan = {
  plan: PlanName;
  limits: PlanLimits;
  /** Usage window: subscription period for paid; calendar month otherwise. */
  periodStart: Date;
  periodEnd: Date;
};

function calendarMonth(now = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

/**
 * Resolve an org's effective plan + limits + usage window. Precedence:
 * Enterprise override → active subscription → Free.
 */
export async function getOrgPlan(orgId: string): Promise<OrgPlan> {
  // Billing disabled (self-host) → unmetered: no limits enforced anywhere.
  if (!isBillingEnabled()) {
    return { plan: "unmetered", limits: UNLIMITED, ...calendarMonth() };
  }

  // One round-trip: org overrides LEFT JOINed with any active subscription.
  // getOrgPlan runs on every write mutation, so we avoid the second query even
  // though the override path (below) usually makes the subscription columns moot.
  const rows = await db
    .select({
      planOverride: organization.planOverride,
      limitsOverride: organization.limitsOverride,
      overrideExpiresAt: organization.overrideExpiresAt,
      subPlan: subscription.plan,
      subPeriodStart: subscription.periodStart,
      subPeriodEnd: subscription.periodEnd,
    })
    .from(organization)
    .leftJoin(
      subscription,
      and(
        eq(subscription.referenceId, organization.id),
        inArray(subscription.status, ACTIVE_STATUSES),
      ),
    )
    .where(eq(organization.id, orgId))
    .limit(1);
  const org = rows[0];

  // 1. Enterprise / manual override (sales-led or timed comp grant) — wins
  // over everything while live. Expiry is checked at read time, so lapsed
  // grants fall through to subscription/free with no cleanup job.
  const overrideLive =
    org?.planOverride &&
    (!org.overrideExpiresAt || org.overrideExpiresAt > new Date());
  if (overrideLive) {
    return {
      plan: "enterprise",
      limits: { ...PLAN_LIMITS.enterprise, ...(org.limitsOverride ?? {}) },
      ...calendarMonth(),
    };
  }

  // 2. Active subscription (Stripe-managed).
  if (org && org.subPlan === "pro") {
    return {
      plan: "pro",
      limits: PLAN_LIMITS.pro,
      periodStart: org.subPeriodStart ?? calendarMonth().periodStart,
      periodEnd: org.subPeriodEnd ?? calendarMonth().periodEnd,
    };
  }

  // 3. Free fallback.
  return { plan: "free", limits: PLAN_LIMITS.free, ...calendarMonth() };
}
