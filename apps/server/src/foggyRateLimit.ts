import { env } from "@foglamp/env/server";

// Per-user limiter for the Foggy chat endpoint: a token bucket (requests/min)
// plus a rolling 24h cap. In-memory and per-instance — like the ingest limiter,
// it bounds a single server's cost, not a coordinated fleet. Good enough for the
// OSS core; swap for a shared store (Redis) if you run many replicas.

type Bucket = { tokens: number; updatedAt: number };
type Daily = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const daily = new Map<string, Daily>();

const RPM = Math.max(1, env.FOGGY_RPM);
const PER_MS = RPM / 60_000; // refill rate (tokens per ms)
const CAPACITY = RPM; // one minute of burst headroom
const DAY_MS = 24 * 60 * 60 * 1000;

export type FoggyRateResult = {
  allowed: boolean;
  reason?: "rate" | "daily";
  retryAfterMs: number;
};

export function checkFoggyRateLimit(userId: string): FoggyRateResult {
  const now = Date.now();

  // Rolling daily cap.
  let d = daily.get(userId);
  if (!d || now >= d.resetAt) {
    d = { count: 0, resetAt: now + DAY_MS };
    daily.set(userId, d);
  }
  if (d.count >= env.FOGGY_DAILY_LIMIT) {
    return { allowed: false, reason: "daily", retryAfterMs: d.resetAt - now };
  }

  // Per-minute token bucket.
  let b = buckets.get(userId);
  if (!b) {
    b = { tokens: CAPACITY, updatedAt: now };
    buckets.set(userId, b);
  } else {
    b.tokens = Math.min(CAPACITY, b.tokens + (now - b.updatedAt) * PER_MS);
    b.updatedAt = now;
  }
  if (b.tokens < 1) {
    return {
      allowed: false,
      reason: "rate",
      retryAfterMs: Math.ceil((1 - b.tokens) / PER_MS),
    };
  }

  b.tokens -= 1;
  d.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
