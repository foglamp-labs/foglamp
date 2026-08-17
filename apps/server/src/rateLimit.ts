import { env } from "@foglamp/env/server";
import { RedisClient } from "bun";

// Fixed-window hourly rate limiting for the unauthenticated / agent-facing
// endpoints, modeled on apps/ingest/src/rateLimit.ts.
//
//   - REDIS_URL set → shared counter (INCR + EXPIRE NX), so the limit holds
//     fleet-wide across replicas.
//   - unset → per-instance in-memory counter, fine for single-instance hosts.
// Redis errors fail open to the in-memory counter — a limiter outage must never
// take an endpoint down.
//
// Each caller gets its own namespace and budget. That separation matters: the
// onboarding agent long-polls a plan every ~9 seconds, which would blow through
// the scan-create budget in the first two minutes if they shared one.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Floored at 1 so a misconfigured 0 disables the endpoint rather than the limit.
const SCAN_CREATE_LIMIT = Math.max(1, env.SCAN_CREATE_PER_HOUR);
const PLAN_CREATE_LIMIT = Math.max(1, env.SETUP_PLAN_CREATE_PER_HOUR);
// A 30-minute wait at a ~9s hold is ~200 polls; the ceiling allows a couple of
// full waits per key per hour while still bounding a runaway loop.
const PLAN_POLL_LIMIT = Math.max(1, env.SETUP_PLAN_POLL_PER_HOUR);

const redis = env.REDIS_URL ? new RedisClient(env.REDIS_URL) : null;

const counters = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

async function check(ns: string, key: string, limit: number): Promise<RateLimitResult> {
  if (redis) {
    try {
      return await checkRedis(ns, key, limit);
    } catch {
      // Redis unreachable → degrade to the per-instance counter.
    }
  }
  return checkMemory(ns, key, limit);
}

/** Count one scan create against `ip`. */
export function checkScanRateLimit(ip: string): Promise<RateLimitResult> {
  return check("scan", ip, SCAN_CREATE_LIMIT);
}

/** Count one instrumentation-plan upload against the API key that sent it. */
export function checkPlanCreateRateLimit(apiKeyId: string): Promise<RateLimitResult> {
  return check("planCreate", apiKeyId, PLAN_CREATE_LIMIT);
}

/** Count one status poll against the API key that sent it. */
export function checkPlanPollRateLimit(apiKeyId: string): Promise<RateLimitResult> {
  return check("planPoll", apiKeyId, PLAN_POLL_LIMIT);
}

async function checkRedis(
  ns: string,
  key: string,
  limit: number,
): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const windowKey = `rl:${ns}:${key}:${Math.floor(nowMs / WINDOW_MS)}`;
  const count = Number(await redis!.send("INCR", [windowKey]));
  // TTL slightly over the window so a straddling request still expires.
  await redis!.send("EXPIRE", [windowKey, String(Math.ceil(WINDOW_MS / 1000) + 60), "NX"]);
  if (count <= limit) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: WINDOW_MS - (nowMs % WINDOW_MS) };
}

function checkMemory(ns: string, key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const id = `${ns}:${key}`;
  let entry = counters.get(id);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    counters.set(id, entry);
  }
  entry.count += 1;
  if (entry.count <= limit) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: entry.resetAt - now };
}

/** Drop expired in-memory counters so the map can't grow unbounded. */
export function pruneScanRateLimits(): void {
  const now = Date.now();
  for (const [id, entry] of counters) {
    if (entry.resetAt <= now) counters.delete(id);
  }
}
