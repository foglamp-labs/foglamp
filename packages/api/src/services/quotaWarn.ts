import { sendQuotaWarningEmail } from "@foglamp/auth/email";
import { getOrgPlan } from "@foglamp/billing";
import { queryOrgSpanUsage, queryRecentlyActiveOrgs } from "@foglamp/clickhouse";
import { user } from "@foglamp/db/schema/auth";
import { member, organization } from "@foglamp/db/schema/organization";
import { env } from "@foglamp/env/server";
import { RedisClient } from "bun";
import { and, eq, inArray } from "drizzle-orm";

import { mapLimit, ymd } from "../lib/util";
import type { Ch, Db, Log } from "../types";

// Bounded fan-out for the quota sweep: each org does its own plan + usage +
// recipient queries, so serial processing was O(orgs × query latency).
const QUOTA_WARN_CONCURRENCY = 8;

// Two-tier deduplication so we don't re-email an over-quota org every sweep:
//
//   Tier 1 — Redis (when REDIS_URL is set): SET <key> 1 NX EX <ttl> — the SET
//     succeeds (returns "OK") only on the first claim; subsequent sweeps across
//     any replica see the key and skip. TTL is 40 days, covering the 35-day
//     billing lookback with headroom.
//
//   Tier 2 — in-process Map (REDIS_URL unset OR Redis errors): one notice per
//     (org, period) within the running process. Acceptable for single-instance
//     deployments; a restart may re-warn once (fine for a billing nudge).
//
// Both tiers fail open: a Redis outage falls back to the Map rather than
// dropping emails or crashing the sweep.

const notified = new Map<string, string>();
const DEDUP_TTL_SECS = 40 * 24 * 60 * 60; // 40 days

const redis = env.REDIS_URL ? new RedisClient(env.REDIS_URL) : null;

async function claimNotification(orgId: string, periodKey: string): Promise<boolean> {
  if (redis) {
    try {
      const key = `quota:warned:${orgId}:${periodKey}`;
      const result = await redis.send("SET", [key, "1", "NX", "EX", String(DEDUP_TTL_SECS)]);
      return result === "OK";
    } catch {
      // Redis error → fall through to the in-memory fallback.
    }
  }
  if (notified.get(orgId) === periodKey) return false;
  notified.set(orgId, periodKey);
  return true;
}

const WARN_FRACTION = 0.9;

/**
 * Email owners/admins of any org that has crossed 90% of its monthly span
 * quota this period. System task (no per-user access check); bounded to orgs
 * with recent traffic.
 */
export async function evaluateQuotaWarnings(db: Db, ch: Ch, log: Log): Promise<void> {
  const since = ymd(new Date(Date.now() - 35 * 24 * 60 * 60 * 1000));
  const orgIds = await queryRecentlyActiveOrgs(ch, since);

  await mapLimit(orgIds, QUOTA_WARN_CONCURRENCY, async (orgId) => {
    try {
      const plan = await getOrgPlan(orgId);
      const limit = plan.limits.spansPerMonth;
      if (limit === null) return; // unlimited

      const used = await queryOrgSpanUsage(ch, {
        orgId,
        from: ymd(plan.periodStart),
        to: ymd(plan.periodEnd),
      });
      if (used < limit * WARN_FRACTION) return;

      const periodKey = plan.periodStart.toISOString();
      const claimed = await claimNotification(orgId, periodKey);
      if (!claimed) return;

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

      await Promise.all(
        recipients.map((r) =>
          sendQuotaWarningEmail({ to: r.email, orgName, pct, url }),
        ),
      );
      log.info("quota.warned", { orgId, pct, recipients: recipients.length });
    } catch (err) {
      log.error("quota.warn_failed", {
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
