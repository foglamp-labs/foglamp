import { env } from "@watchtower/env/server";

// Per-key token-bucket rate limiter. In-memory and therefore per-instance and
// approximate — without a shared store (Redis), N replicas allow up to N× the
// configured rate. This is intentional for the OSS core; it protects a single
// instance from a runaway client, not the fleet from a coordinated one.

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

const RPS = Math.max(1, env.INGEST_RATE_LIMIT_RPS);
// Capacity = one second of burst headroom over the steady rate.
const CAPACITY = RPS;

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

/**
 * Try to consume `cost` tokens for `key`. Refills continuously at RPS up to
 * CAPACITY. Returns whether the request is allowed and, if not, how long until
 * enough tokens accrue.
 */
export function checkRateLimit(key: string, cost = 1): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: CAPACITY, updatedAt: now };
    buckets.set(key, bucket);
  } else {
    const elapsedSec = (now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsedSec * RPS);
    bucket.updatedAt = now;
  }

  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    return { allowed: true, retryAfterMs: 0 };
  }
  const deficit = cost - bucket.tokens;
  return { allowed: false, retryAfterMs: Math.ceil((deficit / RPS) * 1000) };
}

/**
 * Drop idle buckets so a large, churning key set doesn't grow memory without
 * bound. A bucket that has fully refilled carries no state worth keeping.
 * Called on an interval from main.
 */
export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    const elapsedSec = (now - bucket.updatedAt) / 1000;
    if (bucket.tokens + elapsedSec * RPS >= CAPACITY) buckets.delete(key);
  }
}
