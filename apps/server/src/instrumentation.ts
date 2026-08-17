import {
  createPlan,
  effectiveStatus,
  getPlanForAgent,
  markAgentResumed,
  markApplied,
  markFailed,
} from "@foglamp/api/services/instrumentationPlans";
import { FailureStage } from "@foglamp/contracts/instrumentation";
import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import type { Context } from "hono";

import type { AppEnv } from "./evlog";
import { checkPlanCreateRateLimit, checkPlanPollRateLimit } from "./rateLimit";

// The agent half of the onboarding approval loop. All four routes are
// API-key authed (see apiKeyAuth.ts) and scoped to that key's project.
//
// The interesting one is the status long-poll. The bet this whole feature
// makes is that the user's coding agent resumes on its own the moment the plan
// is approved — no second message, no "tell me when you're done". That means
// the wait has to be a single blocking call the agent makes once, not a polling
// loop it has to remember to keep running.

const APP_BASE = env.CORS_ORIGIN.replace(/\/+$/, "");

// How long a single ?wait=1 request holds the connection open.
//
// Bun's default `idleTimeout` is 10 seconds and apps/server doesn't override
// it, so a request held longer is killed mid-flight (verified: the server logs
// "request timed out after 10 seconds" and curl exits 52). Holding just under
// that keeps the loop on one round-trip per ~9s without changing the idle
// window for every other route on this server, and without assuming anything
// about the proxy in front of it.
//
// Latency isn't the tradeoff it looks like: the hold returns the instant the
// status changes, so this only sets how often the agent reconnects while
// nothing is happening.
const HOLD_MS = 9_000;
const POLL_INTERVAL_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /instrumentation-plans
 * The agent uploads what it found. Responds with the private review URL, which
 * the agent shows the user.
 */
export async function handlePlanCreate(c: Context<AppEnv>): Promise<Response> {
  const key = c.get("apiKey");
  const limit = await checkPlanCreateRateLimit(key.apiKeyId);
  if (!limit.allowed) {
    c.header("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000)));
    return c.json({ error: "rate limited — try again later" }, 429);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const outcome = await createPlan(db, {
    projectId: key.projectId,
    orgId: key.orgId,
    apiKeyId: key.apiKeyId,
    ownerUserId: key.ownerUserId,
    detected: body,
  });
  if (!outcome.ok) {
    return c.json({ error: "plan is invalid", details: outcome.errors }, 422);
  }

  return c.json(
    {
      id: outcome.id,
      reviewUrl: `${APP_BASE}/setup/${outcome.id}`,
      status: "awaiting_approval",
      expiresAt: outcome.expiresAt.toISOString(),
    },
    201,
  );
}

/**
 * GET /instrumentation-plans/:id/status?wait=1
 * Without `wait`, a plain status read. With it, the request is held until the
 * status changes or ~9s elapse — so the agent's next step fires the moment the
 * user clicks Approve.
 *
 * Returns the approved decisions inline once approved, so the agent has
 * everything it needs to start applying without a second request.
 */
export async function handlePlanStatus(c: Context<AppEnv>): Promise<Response> {
  const key = c.get("apiKey");
  const planId = c.req.param("id");
  if (!planId) return c.json({ error: "not found" }, 404);

  const limit = await checkPlanPollRateLimit(key.apiKeyId);
  if (!limit.allowed) {
    c.header("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000)));
    return c.json({ error: "rate limited — try again later" }, 429);
  }

  // Scoped to the key's project: a plan in someone else's project reads as a
  // plain 404, never a 403 that would confirm the id exists.
  let plan = await getPlanForAgent(db, { planId, projectId: key.projectId });
  if (!plan) return c.json({ error: "not found" }, 404);

  const wait = c.req.query("wait");
  const shouldHold = wait === "1" || wait === "true";

  if (shouldHold && plan.status === "awaiting_approval") {
    const deadline = Date.now() + HOLD_MS;
    while (Date.now() < deadline) {
      // Give up early if the client hung up — no point holding a dead socket.
      if (c.req.raw.signal.aborted) break;
      await sleep(POLL_INTERVAL_MS);
      const next = await getPlanForAgent(db, { planId, projectId: key.projectId });
      if (!next) return c.json({ error: "not found" }, 404);
      if (next.status !== "awaiting_approval") {
        plan = next;
        break;
      }
      plan = next;
    }
  }

  // A plan whose deadline has passed reads as expired even before the cron
  // sweeps it — otherwise an agent could wait on a plan that's already dead.
  if (effectiveStatus(plan) === "expired" && plan.status !== "expired") {
    return c.json({ id: plan.id, status: "expired", expiresAt: plan.expiresAt.toISOString() });
  }

  // The approval is the handoff: stamp the resume (once) and move the plan to
  // `applying`, then hand back the decisions the agent should implement.
  if (plan.status === "approved") {
    const resumed = await markAgentResumed(db, {
      planId,
      projectId: key.projectId,
      ownerUserId: key.ownerUserId,
    });
    if (resumed) plan = resumed;
  }

  return c.json({
    id: plan.id,
    status: plan.status,
    expiresAt: plan.expiresAt.toISOString(),
    // Present from `applying` onward — the agent re-reads it if it restarts.
    decisions: plan.approved ?? undefined,
    sdk: plan.detected.sdk,
    hasReactUi: plan.detected.hasReactUi,
    reviewUrl: `${APP_BASE}/setup/${plan.id}`,
  });
}

/**
 * POST /instrumentation-plans/:id/applied
 * The agent reports the after-state. From here the page waits on a real trace.
 */
export async function handlePlanApplied(c: Context<AppEnv>): Promise<Response> {
  const key = c.get("apiKey");
  const planId = c.req.param("id");
  if (!planId) return c.json({ error: "not found" }, 404);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const outcome = await markApplied(db, {
    planId,
    projectId: key.projectId,
    ownerUserId: key.ownerUserId,
    report: body,
  });

  if (!outcome.ok) {
    if (outcome.reason === "invalid") {
      return c.json({ error: "report is invalid", details: outcome.errors }, 422);
    }
    if (outcome.reason === "not_found") return c.json({ error: "not found" }, 404);
    return c.json({ error: "this plan can no longer be updated" }, 409);
  }

  return c.json({
    id: planId,
    status: "applied",
    // What the user should do next, in the agent's own words to them.
    next: "waiting_for_trace",
    reviewUrl: `${APP_BASE}/setup/${planId}`,
  });
}

/**
 * POST /instrumentation-plans/:id/failed
 * The agent couldn't finish. Recording the stage is what makes the funnel
 * honest — a stall shows up as a failure at a named step, not as silence.
 */
export async function handlePlanFailed(c: Context<AppEnv>): Promise<Response> {
  const key = c.get("apiKey");
  const planId = c.req.param("id");
  if (!planId) return c.json({ error: "not found" }, 404);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const stage = FailureStage.safeParse(
    body && typeof body === "object" ? (body as { stage?: unknown }).stage : undefined,
  );
  if (!stage.success) {
    return c.json({ error: "stage must be one of: detect, apply, verify" }, 400);
  }

  const outcome = await markFailed(db, {
    planId,
    projectId: key.projectId,
    ownerUserId: key.ownerUserId,
    stage: stage.data,
  });
  if (!outcome.ok) {
    return outcome.reason === "not_found"
      ? c.json({ error: "not found" }, 404)
      : c.json({ error: "this plan can no longer be updated" }, 409);
  }

  return c.json({ id: planId, status: "failed" });
}
