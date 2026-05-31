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
  return !!env.STRIPE_SECRET_KEY;
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
};

// All-unlimited; used when billing is disabled (self-host).
const UNLIMITED: PlanLimits = {
  spansPerMonth: null,
  retentionDays: null,
  alerts: null,
  projects: null,
};

// The selectable plans (unmetered isn't a plan — it's the billing-off state).
export const PLAN_LIMITS: Record<Exclude<PlanName, "unmetered">, PlanLimits> = {
  free: { spansPerMonth: 10_000, retentionDays: 3, alerts: 1, projects: 1 },
  pro: { spansPerMonth: 1_000_000, retentionDays: 14, alerts: 10, projects: 5 },
  // Enterprise defaults; per-org overrides merge on top (see getOrgPlan).
  enterprise: { spansPerMonth: null, retentionDays: 90, alerts: null, projects: null },
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

  const orgRows = await db
    .select({
      planOverride: organization.planOverride,
      limitsOverride: organization.limitsOverride,
    })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  const org = orgRows[0];

  // 1. Enterprise / manual override (sales-led) — wins over everything.
  if (org?.planOverride) {
    return {
      plan: "enterprise",
      limits: { ...PLAN_LIMITS.enterprise, ...(org.limitsOverride ?? {}) },
      ...calendarMonth(),
    };
  }

  // 2. Active subscription (Stripe-managed).
  const subRows = await db
    .select({
      plan: subscription.plan,
      status: subscription.status,
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
    })
    .from(subscription)
    .where(
      and(
        eq(subscription.referenceId, orgId),
        inArray(subscription.status, ACTIVE_STATUSES),
      ),
    )
    .limit(1);
  const sub = subRows[0];
  if (sub && sub.plan === "pro") {
    return {
      plan: "pro",
      limits: PLAN_LIMITS.pro,
      periodStart: sub.periodStart ?? calendarMonth().periodStart,
      periodEnd: sub.periodEnd ?? calendarMonth().periodEnd,
    };
  }

  // 3. Free fallback.
  return { plan: "free", limits: PLAN_LIMITS.free, ...calendarMonth() };
}
