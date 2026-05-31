import { getOrgPlan } from "@foglamp/billing";
import { queryOrgSpanUsage } from "@foglamp/clickhouse";
import { alertRule } from "@foglamp/db/schema/alert";
import { project } from "@foglamp/db/schema/project";
import { count, eq } from "drizzle-orm";

import type { Ch, Db } from "../types";
import { requireOrgAccess } from "./access";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Org plan + current-period usage for the Usage tab and the over-quota banner.
 * Window is the subscription billing cycle (paid) or calendar month (free).
 */
export async function getOrgUsage(
  db: Db,
  ch: Ch,
  userId: string,
  input: { orgId: string },
) {
  await requireOrgAccess(db, userId, input.orgId);
  const plan = await getOrgPlan(input.orgId);

  const [spansUsed, projectRows, alertRows] = await Promise.all([
    queryOrgSpanUsage(ch, {
      orgId: input.orgId,
      from: ymd(plan.periodStart),
      to: ymd(plan.periodEnd),
    }),
    db.select({ n: count() }).from(project).where(eq(project.orgId, input.orgId)),
    db
      .select({ n: count() })
      .from(alertRule)
      .innerJoin(project, eq(project.id, alertRule.projectId))
      .where(eq(project.orgId, input.orgId)),
  ]);

  const spanLimit = plan.limits.spansPerMonth;
  return {
    plan: plan.plan,
    periodStart: plan.periodStart,
    periodEnd: plan.periodEnd,
    spans: {
      used: spansUsed,
      limit: spanLimit,
      // Fraction of quota used (null when unlimited). Banner warns at >= 0.9.
      pct: spanLimit === null ? null : spansUsed / spanLimit,
    },
    projects: { used: projectRows[0]?.n ?? 0, limit: plan.limits.projects },
    alerts: { used: alertRows[0]?.n ?? 0, limit: plan.limits.alerts },
  };
}
