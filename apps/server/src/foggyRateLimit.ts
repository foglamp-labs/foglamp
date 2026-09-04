import { env } from "@foglamp/env/server";

// Limiters for the Foggy chat endpoints: a token bucket (requests/min) plus a
// rolling 24h cap, keyed by user for the in-app assistant and by IP for the
// public one on the landing page. In-memory and per-instance: they bound a
// single server's cost, not a coordinated fleet. Good enough for the OSS core,
// since apps/server typically runs as one replica; if you scale it out, move
// this to the shared Redis the ingest limiter already uses (REDIS_URL).

type Bucket = { tokens: number; updatedAt: number };
type Daily = { count: number; resetAt: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export type FoggyRateResult = {
  allowed: boolean;
  reason?: "rate" | "daily" | "global";
  retryAfterMs: number;
};

function createLimiter(opts: { rpm: number; daily: number }) {
  const buckets = new Map<string, Bucket>();
  const daily = new Map<string, Daily>();
  const rpm = Math.max(1, opts.rpm);
  const perMs = rpm / 60_000; // refill rate (tokens per ms)
  const capacity = rpm; // one minute of burst headroom

  return {
    /** Drop idle bucket and expired daily entries so they don't grow without bound. */
    prune(): void {
      const now = Date.now();
      for (const [key, b] of buckets) {
        const projected = Math.min(capacity, b.tokens + (now - b.updatedAt) * perMs);
        if (projected >= capacity) buckets.delete(key);
      }
      for (const [key, d] of daily) {
        if (now >= d.resetAt) daily.delete(key);
      }
    },

    check(key: string): FoggyRateResult {
      const now = Date.now();

      // Rolling daily cap.
      let d = daily.get(key);
      if (!d || now >= d.resetAt) {
        d = { count: 0, resetAt: now + DAY_MS };
        daily.set(key, d);
      }
      if (d.count >= opts.daily) {
        return { allowed: false, reason: "daily", retryAfterMs: d.resetAt - now };
      }

      // Per-minute token bucket.
      let b = buckets.get(key);
      if (!b) {
        b = { tokens: capacity, updatedAt: now };
        buckets.set(key, b);
      } else {
        b.tokens = Math.min(capacity, b.tokens + (now - b.updatedAt) * perMs);
        b.updatedAt = now;
      }
      if (b.tokens < 1) {
        return {
          allowed: false,
          reason: "rate",
          retryAfterMs: Math.ceil((1 - b.tokens) / perMs),
        };
      }

      b.tokens -= 1;
      d.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}

const userLimiter = createLimiter({
  rpm: env.FOGGY_RPM,
  daily: env.FOGGY_DAILY_LIMIT,
});
const publicLimiter = createLimiter({
  rpm: env.FOGGY_PUBLIC_RPM,
  daily: env.FOGGY_PUBLIC_DAILY_LIMIT,
});

// One counter for every public visitor combined. Per-IP caps stop one person;
// this stops a crawler with a thousand addresses.
let publicGlobal: Daily = { count: 0, resetAt: Date.now() + DAY_MS };

export function pruneFoggyRateLimits(): void {
  userLimiter.prune();
  publicLimiter.prune();
}

export function checkFoggyRateLimit(userId: string): FoggyRateResult {
  return userLimiter.check(userId);
}

export function checkFoggyPublicRateLimit(ip: string): FoggyRateResult {
  const now = Date.now();
  if (now >= publicGlobal.resetAt) {
    publicGlobal = { count: 0, resetAt: now + DAY_MS };
  }
  if (publicGlobal.count >= env.FOGGY_PUBLIC_GLOBAL_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: "global",
      retryAfterMs: publicGlobal.resetAt - now,
    };
  }
  const res = publicLimiter.check(ip);
  if (res.allowed) publicGlobal.count += 1;
  return res;
}
