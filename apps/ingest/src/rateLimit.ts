import { env } from "@foglamp/env/server";
import { RedisClient } from "bun";

// Per-key rate limiter, costed in spans (not requests) so a single request
// carrying a 1,000-span batch can't amplify past the limit.
//
// Two backends:
//   - REDIS_URL set → a shared fixed-window counter (INCRBY + EXPIRE NX per
//     1-second window), so the limit holds fleet-wide across N replicas.
//   - unset → the original in-memory token bucket: per-instance and
//     approximate, fine for the single-instance self-host.
// Redis errors fail open to the in-memory bucket — a rate-limiter outage must
// never take ingest down with it.

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

const RPS = Math.max(1, env.INGEST_RATE_LIMIT_RPS);
// Capacity = one second of burst headroom over the steady rate.
const CAPACITY = RPS;

const redis = env.REDIS_URL ? new RedisClient(env.REDIS_URL) : null;

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

/**
 * Try to consume `cost` tokens (spans) for `key`. Returns whether the request
 * is allowed and, if not, how long until enough budget accrues. A cost larger
 * than one second's budget is clamped to it, so an oversized batch drains the
 * window rather than being rejected forever.
 */
export async function checkRateLimit(
  key: string,
  cost = 1,
): Promise<RateLimitResult> {
  const clamped = Math.max(1, Math.min(cost, CAPACITY));
  if (redis) {
    try {
      return await checkRedis(key, clamped);
    } catch {
      // Redis unreachable → degrade to the per-instance bucket.
    }
  }
  return checkBucket(key, clamped);
}

async function checkRedis(key: string, cost: number): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const windowKey = `rl:${key}:${Math.floor(nowMs / 1000)}`;
  const count = Number(await redis!.send("INCRBY", [windowKey, String(cost)]));
  // NX: set the TTL only if the key has none — covers a crash between the
  // first INCRBY and its EXPIRE without resetting the window on every hit.
  // 2s (not 1s) so a window straddling a second boundary still expires.
  await redis!.send("EXPIRE", [windowKey, "2", "NX"]);
  if (count <= RPS) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: 1000 - (nowMs % 1000) };
}

function checkBucket(key: string, cost: number): RateLimitResult {
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
 * Drop idle in-memory buckets so a large, churning key set doesn't grow memory
 * without bound. No-op for the Redis path (windows expire via TTL). Called on
 * an interval from main.
 */
export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    const elapsedSec = (now - bucket.updatedAt) / 1000;
    if (bucket.tokens + elapsedSec * RPS >= CAPACITY) buckets.delete(key);
  }
}
