import { captureActivationEvent } from "@foglamp/analytics";
import { listTraces } from "@foglamp/clickhouse";
import {
  applyPlanEdits,
  auditPlanGraph,
  canTransition,
  type Decisions,
  type FailureStage,
  type PlanEdits,
  type PlanStatus,
  summarizePlan,
  validateAppliedReport,
  validateDetectedPlan,
} from "@foglamp/contracts/instrumentation";
import {
  instrumentationPlan,
  type InstrumentationPlanRow,
} from "@foglamp/db/schema/instrumentationPlan";
import { member } from "@foglamp/db/schema/organization";
import { env } from "@foglamp/env/server";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";

import { toClickHouseDateTime } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

// The onboarding approval loop's business logic.
//
// Concurrency model: every status write is a conditional
// `UPDATE ... WHERE status = <expected> RETURNING`. Postgres decides the winner,
// so a double-click, a retried request, and two server instances racing all
// converge on one transition — and the empty RETURNING tells us it was a
// duplicate, which is exactly when an analytics event must NOT fire again.
//
// Nothing here trusts the caller's copy of anything: uploads are re-validated
// against the contract, and every read is scoped by projectId (agent) or
// requireProjectAccess (browser).

/** Plans self-destruct if nobody acts on them. */
const PLAN_TTL_HOURS = env.SETUP_PLAN_TTL_HOURS;

/**
 * Statuses the expiry sweep is allowed to reap (see canTransition). `applying`
 * is here for the agent that died mid-apply — without it that plan would spin
 * on the review page forever. `applied` is not: the code changes are real, the
 * plan is just waiting on a trace, and that wait is legitimately unbounded.
 */
const EXPIRABLE: PlanStatus[] = ["awaiting_approval", "approved", "applying"];

/**
 * How a plan reads right now. A plan past its deadline is expired the moment
 * anyone looks at it, not whenever the hourly sweep gets to it — otherwise an
 * agent could wait on a dead plan, and the review page would keep saying
 * "waiting for your coding agent" for up to an hour after it died.
 */
export function effectiveStatus(plan: {
  status: PlanStatus;
  expiresAt: Date;
}): PlanStatus {
  if (!EXPIRABLE.includes(plan.status)) return plan.status;
  return plan.expiresAt.getTime() < Date.now() ? "expired" : plan.status;
}

export type PlanCreateOutcome =
  | { ok: true; id: string; expiresAt: Date }
  | { ok: false; errors: string[] };

/**
 * Record a plan an agent just detected. Re-validates server-side; the agent's
 * payload is never persisted unparsed.
 */
export async function createPlan(
  db: Db,
  input: {
    projectId: string;
    orgId: string;
    apiKeyId: string | null;
    ownerUserId: string | null;
    detected: unknown;
  },
): Promise<PlanCreateOutcome> {
  const parsed = validateDetectedPlan(input.detected);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  // Schema-valid but degenerate maps (all agent nodes, no wiring) are bounced
  // too — the 422 details tell the agent exactly what the picture is missing.
  const audit = auditPlanGraph(parsed.data);
  if (audit.length > 0) return { ok: false, errors: audit };

  const expiresAt = new Date(Date.now() + PLAN_TTL_HOURS * 3_600_000);
  const rows = await db
    .insert(instrumentationPlan)
    .values({
      projectId: input.projectId,
      orgId: input.orgId,
      createdByApiKeyId: input.apiKeyId,
      detected: parsed.data,
      expiresAt,
    })
    .returning({ id: instrumentationPlan.id });

  const id = rows[0]!.id;
  const counts = summarizePlan(parsed.data);
  void capture("instrumentation_plan_created", input.ownerUserId, {
    project_id: input.projectId,
    sdk_major: parsed.data.sdk.major,
    agents: counts.agents,
    workflows: counts.workflows,
    sessions: counts.sessions,
    calls: counts.calls,
  });

  return { ok: true, id, expiresAt };
}

/**
 * Fetch a plan on behalf of an agent. Scoped by projectId, so a key from
 * another project sees a plain miss — never a hint that the id exists.
 */
export async function getPlanForAgent(
  db: Db,
  input: { planId: string; projectId: string },
): Promise<InstrumentationPlanRow | null> {
  const rows = await db
    .select()
    .from(instrumentationPlan)
    .where(
      and(
        eq(instrumentationPlan.id, input.planId),
        eq(instrumentationPlan.projectId, input.projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Fetch a plan on behalf of a signed-in user, enforcing org/project access. */
export async function getPlanForUser(
  db: Db,
  userId: string,
  planId: string,
): Promise<InstrumentationPlanRow | null> {
  const rows = await db
    .select()
    .from(instrumentationPlan)
    .where(eq(instrumentationPlan.id, planId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Throws FORBIDDEN unless the caller belongs to the plan's org.
  await requireProjectAccess(db, userId, row.projectId);
  return row;
}

export type TransitionOutcome =
  | { ok: true; row: InstrumentationPlanRow; changed: boolean }
  | { ok: false; reason: "not_found" | "illegal" };

/**
 * Move a plan to `to`, but only from one of `from`. Returns `changed: false`
 * when the row was already in the target state (a duplicate request), and
 * `illegal` when it sits somewhere the state machine forbids moving from.
 */
async function transition(
  db: Db,
  input: {
    planId: string;
    projectId?: string;
    from: PlanStatus[];
    to: PlanStatus;
    set?: Partial<typeof instrumentationPlan.$inferInsert>;
  },
): Promise<TransitionOutcome> {
  for (const f of input.from) {
    if (!canTransition(f, input.to)) {
      throw new Error(`illegal transition declared: ${f} -> ${input.to}`);
    }
  }

  const scope = input.projectId
    ? [eq(instrumentationPlan.projectId, input.projectId)]
    : [];

  const updated = await db
    .update(instrumentationPlan)
    .set({ status: input.to, ...input.set })
    .where(
      and(
        eq(instrumentationPlan.id, input.planId),
        inArray(instrumentationPlan.status, input.from),
        ...scope,
      ),
    )
    .returning();

  if (updated[0]) return { ok: true, row: updated[0], changed: true };

  // Nothing moved: either the plan is gone, or it's already past this point.
  const current = await db
    .select()
    .from(instrumentationPlan)
    .where(
      and(eq(instrumentationPlan.id, input.planId), ...scope),
    )
    .limit(1);
  const row = current[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === input.to) return { ok: true, row, changed: false };
  return { ok: false, reason: "illegal" };
}

export type ApproveOutcome =
  | TransitionOutcome
  | { ok: false; reason: "invalid"; errors: string[] };

/**
 * The user approved the plan, optionally with edits (renames, source tweaks —
 * see PlanEdits). Idempotent; edits only land on the transition that wins.
 */
export async function approvePlan(
  db: Db,
  userId: string,
  planId: string,
  edits?: PlanEdits,
): Promise<ApproveOutcome> {
  const plan = await getPlanForUser(db, userId, planId);
  if (!plan) return { ok: false, reason: "not_found" };
  // Past the deadline the waiting agent has already given up, so an approval
  // would go nowhere. Refuse it rather than leaving the user watching a plan
  // that nothing will ever pick up.
  if (effectiveStatus(plan) === "expired") return { ok: false, reason: "illegal" };

  // The approved decisions are the detected ones with the user's edits merged
  // on top, server-side — the browser can rename and re-source, never invent
  // call sites or rewrite the evidence. Snapshotting the merge now means a
  // later contract change can never retroactively alter what was agreed to.
  let approved: Decisions = plan.detected.decisions;
  let editedCount = 0;
  if (edits) {
    const merged = applyPlanEdits(plan.detected.decisions, edits);
    if (!merged.ok) return { ok: false, reason: "invalid", errors: merged.errors };
    approved = merged.decisions;
    editedCount = merged.editedCount;
  }

  const res = await transition(db, {
    planId,
    from: ["awaiting_approval"],
    to: "approved",
    set: { approved, approvedAt: new Date() },
  });

  if (res.ok && res.changed) {
    // Attributed to the org owner, not the clicker, so the whole funnel
    // (created → approved → resumed → applied → verified) shares one
    // distinct_id even when a teammate does the approving.
    const owner = await ownerOfOrg(db, plan.orgId);
    void capture("instrumentation_plan_approved", owner, {
      project_id: plan.projectId,
      seconds_to_approval: secondsBetween(plan.createdAt, new Date()),
      edited_decisions: editedCount,
    });
    if (editedCount > 0) {
      void capture("instrumentation_plan_edited", owner, {
        project_id: plan.projectId,
        edited_decisions: editedCount,
      });
    }
  }
  return res;
}

/** The user rejected the plan; the waiting agent exits cleanly. Idempotent. */
export async function rejectPlan(
  db: Db,
  userId: string,
  planId: string,
): Promise<TransitionOutcome> {
  const plan = await getPlanForUser(db, userId, planId);
  if (!plan) return { ok: false, reason: "not_found" };
  const res = await transition(db, {
    planId,
    from: ["awaiting_approval"],
    to: "rejected",
    set: { rejectedAt: new Date() },
  });
  if (res.ok && res.changed) {
    // A rejection is the funnel's most interesting drop-off — without this
    // event a user who said "no" is indistinguishable from one who never
    // opened the tab.
    const owner = await ownerOfOrg(db, plan.orgId);
    void capture("instrumentation_plan_rejected", owner, {
      project_id: plan.projectId,
      seconds_to_rejection: secondsBetween(plan.createdAt, new Date()),
    });
  }
  return res;
}

/**
 * The agent observed the approval and picked the plan up. Stamps
 * `agentResumedAt` exactly once — that first flip is the "the loop actually
 * worked without a second human message" signal, which is the whole bet.
 */
export async function markAgentResumed(
  db: Db,
  input: { planId: string; projectId: string; ownerUserId: string | null },
): Promise<InstrumentationPlanRow | null> {
  const updated = await db
    .update(instrumentationPlan)
    .set({ status: "applying", agentResumedAt: new Date() })
    .where(
      and(
        eq(instrumentationPlan.id, input.planId),
        eq(instrumentationPlan.projectId, input.projectId),
        eq(instrumentationPlan.status, "approved"),
        isNull(instrumentationPlan.agentResumedAt),
      ),
    )
    .returning();

  const row = updated[0];
  if (!row) return null;

  void capture("instrumentation_agent_resumed", input.ownerUserId, {
    project_id: input.projectId,
    seconds_waiting: secondsBetween(row.approvedAt ?? row.createdAt, new Date()),
  });
  return row;
}

export type AppliedOutcome =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "not_found" | "illegal" | "invalid"; errors?: string[] };

/** The agent finished editing the repo and reported the after-state. */
export async function markApplied(
  db: Db,
  input: {
    planId: string;
    projectId: string;
    ownerUserId: string | null;
    report: unknown;
  },
): Promise<AppliedOutcome> {
  const parsed = validateAppliedReport(input.report);
  if (!parsed.ok) return { ok: false, reason: "invalid", errors: parsed.errors };

  // An agent that reported its work without ever polling for the approval
  // leaves the plan sitting in `approved`. Walk it through `applying` rather
  // than letting it skip a stage — the reducer forbids skipping on purpose.
  // `agentResumedAt` deliberately stays null: the resume genuinely didn't
  // happen through the wait loop, and the funnel should say so.
  // This call failing is normal — it means the plan is already past this point.
  await transition(db, {
    planId: input.planId,
    projectId: input.projectId,
    from: ["approved"],
    to: "applying",
  });

  const res = await transition(db, {
    planId: input.planId,
    projectId: input.projectId,
    from: ["applying"],
    to: "applied",
    set: { applied: parsed.data, appliedAt: new Date() },
  });
  if (!res.ok) return res;

  if (res.changed) {
    const instrumented = parsed.data.calls.filter((c) => c.instrumented).length;
    void capture("instrumentation_changes_applied", input.ownerUserId, {
      project_id: input.projectId,
      files_changed: parsed.data.filesChanged.length,
      calls_instrumented: instrumented,
      calls_skipped: parsed.data.calls.length - instrumented,
      warnings: parsed.data.warnings.length,
      hud_enabled: parsed.data.hudEnabled,
      seconds_to_applied: secondsBetween(res.row.createdAt, new Date()),
    });
    // The agent is done; the page now waits on a real trace.
    void capture("instrumentation_waiting_for_trace", input.ownerUserId, {
      project_id: input.projectId,
    });
  }
  return { ok: true, changed: res.changed };
}

/** The agent gave up. Records which stage so the funnel shows where it broke. */
export async function markFailed(
  db: Db,
  input: {
    planId: string;
    projectId: string;
    ownerUserId: string | null;
    stage: FailureStage;
  },
): Promise<TransitionOutcome> {
  const res = await transition(db, {
    planId: input.planId,
    projectId: input.projectId,
    from: ["approved", "applying", "applied"],
    to: "failed",
    set: { failureStage: input.stage },
  });
  if (res.ok && res.changed) {
    void capture("instrumentation_plan_failed", input.ownerUserId, {
      project_id: input.projectId,
      failure_stage: input.stage,
    });
  }
  return res;
}

export type VerifyResult = {
  status: PlanStatus;
  firstTraceId: string | null;
  verifiedAt: Date | null;
  /** Spans on the first trace — the "it's really flowing" number. */
  spanCount: number | null;
  secondsToFirstTrace: number | null;
};

/**
 * Has a real trace landed since this plan was created? Runs on read (the review
 * page polls it) rather than on ingest, so span intake stays completely
 * uncoupled from onboarding — ingest must never depend on the setup UI.
 */
export async function verifyFirstTrace(
  db: Db,
  ch: Ch,
  plan: InstrumentationPlanRow,
): Promise<VerifyResult> {
  const done = (row: InstrumentationPlanRow, spanCount: number | null): VerifyResult => ({
    status: row.status,
    firstTraceId: row.firstTraceId,
    verifiedAt: row.verifiedAt,
    spanCount,
    secondsToFirstTrace: row.verifiedAt
      ? secondsBetween(row.createdAt, row.verifiedAt)
      : null,
  });

  if (plan.status !== "applied") return done(plan, null);

  // Only traces that started after the plan did count — an app that was already
  // sending spans shouldn't verify itself on yesterday's traffic.
  const traces = await listTraces(ch, {
    projectId: plan.projectId,
    from: toClickHouseDateTime(plan.createdAt),
    sort: { field: "when", dir: "asc" },
    limit: 1,
  });
  const first = traces[0];
  if (!first) return done(plan, null);

  const res = await transition(db, {
    planId: plan.id,
    from: ["applied"],
    to: "verified",
    set: { verifiedAt: new Date(), firstTraceId: first.trace_id },
  });
  if (!res.ok) return done(plan, null);

  const spanCount = Number(first.span_count) || null;
  if (res.changed) {
    const owner = await ownerOfOrg(db, plan.orgId);
    void capture("instrumentation_verified", owner, {
      project_id: plan.projectId,
      span_count: spanCount,
      seconds_to_first_trace: secondsBetween(plan.createdAt, new Date()),
    });
  }
  return done(res.row, spanCount);
}

/**
 * Expire unfinished plans past their deadline. Rows are kept (not deleted) so a
 * user who opens a stale link gets "this plan expired" rather than a 404.
 */
export async function expireStalePlans(db: Db): Promise<number> {
  const expired = await db
    .update(instrumentationPlan)
    .set({ status: "expired" })
    .where(
      and(
        inArray(instrumentationPlan.status, EXPIRABLE),
        lt(instrumentationPlan.expiresAt, new Date()),
      ),
    )
    .returning({
      id: instrumentationPlan.id,
      projectId: instrumentationPlan.projectId,
      orgId: instrumentationPlan.orgId,
    });

  // Attribute each expiry to its org owner like every other funnel event —
  // `capture` drops events with no distinctId, so passing null here would
  // (and historically did) silently erase expiries from the funnel. One
  // owner lookup per org, not per row.
  const owners = new Map<string, string | null>();
  for (const row of expired) {
    let owner = owners.get(row.orgId);
    if (owner === undefined) {
      owner = await ownerOfOrg(db, row.orgId);
      owners.set(row.orgId, owner);
    }
    void capture("instrumentation_plan_expired", owner, {
      project_id: row.projectId,
    });
  }
  return expired.length;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
}

/**
 * Best-effort activation capture. `distinctId` is the org owner — the identity
 * ingest already attributes project activity to. Skipped entirely when we
 * can't resolve one, rather than inventing an id.
 */
function capture(
  event: Parameters<typeof captureActivationEvent>[0]["event"],
  distinctId: string | null,
  properties: Record<string, boolean | number | string | null>,
): void {
  if (!distinctId) return;
  void captureActivationEvent({ event, distinctId, properties });
}

/** The org's owner, for analytics attribution. Null when there isn't one. */
async function ownerOfOrg(db: Db, orgId: string): Promise<string | null> {
  const rows = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.role, "owner")))
    .limit(1);
  return rows[0]?.userId ?? null;
}

export type { InstrumentationPlanRow };
