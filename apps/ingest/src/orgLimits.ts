import { getOrgPlan, type PlanLimits } from "@foglamp/billing";
import type { ClickHouseClient } from "@foglamp/clickhouse";
import { queryOrgSpanUsage } from "@foglamp/clickhouse";

// Per-org plan + usage on the ingest hot path, behind short-TTL in-memory caches
// (mirrors the API-key + custom-pricing caches). A little staleness is fine: the
// span quota only needs to be approximately right.

const PLAN_TTL_MS = 60_000;
const USAGE_TTL_MS = 30_000;
const WARN_FRACTION = 0.9; // warn at 90%
const HARD_FRACTION = 1.1; // hard-stop at 110% (10% grace)
// retention_days is UInt16; "unlimited" (Enterprise null) maps to a long window.
const UNLIMITED_RETENTION = 3650;

type PlanEntry = {
  limits: PlanLimits;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  expiresAt: number;
};
const planCache = new Map<string, PlanEntry>();

type UsageEntry = { count: number; expiresAt: number };
const usageCache = new Map<string, UsageEntry>();

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function planFor(orgId: string): Promise<PlanEntry> {
  const now = Date.now();
  const cached = planCache.get(orgId);
  if (cached && cached.expiresAt > now) return cached;
  const plan = await getOrgPlan(orgId);
  const entry: PlanEntry = {
    limits: plan.limits,
    periodStart: ymd(plan.periodStart),
    periodEnd: ymd(plan.periodEnd),
    expiresAt: now + PLAN_TTL_MS,
  };
  planCache.set(orgId, entry);
  return entry;
}

async function usageFor(
  client: ClickHouseClient,
  orgId: string,
  plan: PlanEntry,
): Promise<number> {
  const now = Date.now();
  const cacheKey = `${orgId}:${plan.periodStart}`;
  const cached = usageCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.count;
  const count = await queryOrgSpanUsage(client, {
    orgId,
    from: plan.periodStart,
    to: plan.periodEnd,
  });
  usageCache.set(cacheKey, { count, expiresAt: now + USAGE_TTL_MS });
  return count;
}

export type QuotaDecision = {
  retentionDays: number; // to stamp on the rows
  reject: boolean; // over the hard cap (110%)
  warn: boolean; // at/over 90%
  limit: number | null;
  used: number;
};

/**
 * Decide whether an incoming batch is within the org's monthly span quota, and
 * what retention to stamp. Unlimited plans (null span limit) never reject.
 */
export async function checkOrgQuota(
  client: ClickHouseClient,
  orgId: string,
  incoming: number,
): Promise<QuotaDecision> {
  const plan = await planFor(orgId);
  const retentionDays = Math.min(
    plan.limits.retentionDays ?? UNLIMITED_RETENTION,
    65535,
  );
  const limit = plan.limits.spansPerMonth;
  if (limit === null) {
    return { retentionDays, reject: false, warn: false, limit: null, used: 0 };
  }
  const used = await usageFor(client, orgId, plan);
  return {
    retentionDays,
    limit,
    used,
    reject: used + incoming > Math.floor(limit * HARD_FRACTION),
    warn: used >= limit * WARN_FRACTION,
  };
}

/** Drop idle cache entries; hook into the ingest prune timer. */
export function pruneOrgLimits(): void {
  const now = Date.now();
  for (const [k, v] of planCache) if (v.expiresAt <= now) planCache.delete(k);
  for (const [k, v] of usageCache) if (v.expiresAt <= now) usageCache.delete(k);
}
