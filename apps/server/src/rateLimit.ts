import { env } from "@foglamp/env/server";
import { RedisClient } from "bun";

// IP rate limiter for the public, unauthenticated poster create endpoint.
// Fixed-window hourly counter, modeled on apps/ingest/src/rateLimit.ts.
//
//   - REDIS_URL set → shared counter (INCR + EXPIRE NX), so the limit holds
//     fleet-wide across replicas.
//   - unset → per-instance in-memory counter, fine for single-instance hosts.
// Redis errors fail open to the in-memory counter — a limiter outage must never
// take the endpoint down.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const LIMIT = Math.max(1, Number(process.env.POSTER_CREATE_PER_HOUR) || 15);

const redis = env.REDIS_URL ? new RedisClient(env.REDIS_URL) : null;

const counters = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

/** Count one poster create against `ip`. */
export async function checkPosterRateLimit(ip: string): Promise<RateLimitResult> {
  if (redis) {
    try {
      return await checkRedis(ip);
    } catch {
      // Redis unreachable → degrade to the per-instance counter.
    }
  }
  return checkMemory(ip);
}

async function checkRedis(ip: string): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const windowKey = `rl:poster:${ip}:${Math.floor(nowMs / WINDOW_MS)}`;
  const count = Number(await redis!.send("INCR", [windowKey]));
  // TTL slightly over the window so a straddling request still expires.
  await redis!.send("EXPIRE", [windowKey, String(Math.ceil(WINDOW_MS / 1000) + 60), "NX"]);
  if (count <= LIMIT) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: WINDOW_MS - (nowMs % WINDOW_MS) };
}

function checkMemory(ip: string): RateLimitResult {
  const now = Date.now();
  let entry = counters.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    counters.set(ip, entry);
  }
  entry.count += 1;
  if (entry.count <= LIMIT) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: entry.resetAt - now };
}

/** Drop expired in-memory counters so the map can't grow unbounded. */
export function prunePosterRateLimits(): void {
  const now = Date.now();
  for (const [ip, entry] of counters) {
    if (entry.resetAt <= now) counters.delete(ip);
  }
}
