import { sendQuotaWarningEmail } from "@foglamp/auth/email";
import { getOrgPlan } from "@foglamp/billing";
import { queryOrgSpanUsage, queryRecentlyActiveOrgs } from "@foglamp/clickhouse";
import { user } from "@foglamp/db/schema/auth";
import { member, organization } from "@foglamp/db/schema/organization";
import { env } from "@foglamp/env/server";
import { and, eq, inArray } from "drizzle-orm";

import type { Ch, Db, Log } from "../types";

// One in-process notice per (org, period) so we don't re-email every sweep.
// Matches the single-instance assumption of the other crons; a restart may
// re-warn an over-quota org once (acceptable for a billing nudge).
const notified = new Map<string, string>();

const WARN_FRACTION = 0.9;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Email owners/admins of any org that has crossed 90% of its monthly span
 * quota this period. System task (no per-user access check); bounded to orgs
 * with recent traffic.
 */
export async function evaluateQuotaWarnings(db: Db, ch: Ch, log: Log): Promise<void> {
  const since = ymd(new Date(Date.now() - 35 * 24 * 60 * 60 * 1000));
  const orgIds = await queryRecentlyActiveOrgs(ch, since);

  for (const orgId of orgIds) {
    try {
      const plan = await getOrgPlan(orgId);
      const limit = plan.limits.spansPerMonth;
      if (limit === null) continue; // unlimited

      const used = await queryOrgSpanUsage(ch, {
        orgId,
        from: ymd(plan.periodStart),
        to: ymd(plan.periodEnd),
      });
      if (used < limit * WARN_FRACTION) continue;

      const periodKey = plan.periodStart.toISOString();
      if (notified.get(orgId) === periodKey) continue;

      const recipients = await db
        .select({ email: user.email })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(member.organizationId, orgId),
            inArray(member.role, ["owner", "admin"]),
          ),
        );
      const orgRow = await db
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1);
      const orgName = orgRow[0]?.name ?? "your organization";
      const pct = Math.min(100, Math.round((used / limit) * 100));
      const url = `${env.CORS_ORIGIN.replace(/\/$/, "")}/settings/org`;

      for (const r of recipients) {
        await sendQuotaWarningEmail({ to: r.email, orgName, pct, url });
      }
      notified.set(orgId, periodKey);
      log.info("quota.warned", { orgId, pct, recipients: recipients.length });
    } catch (err) {
      log.error("quota.warn_failed", {
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
