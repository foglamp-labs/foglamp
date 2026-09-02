import { z } from "zod";

import { type GraphNode, ScanData } from "./scan";

/** Schema version for the plan payloads, independent of ScanData's version. */
export const PLAN_VERSION = 1;

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * The lifecycle of a plan. Persisted as text; the transition table below is the
 * only thing allowed to move a row between these.
 *
 *  - awaiting_approval: uploaded, the agent is polling, the user hasn't acted
 *  - approved:          the user said yes; the agent hasn't picked it up yet
 *  - applying:          the agent resumed and is editing the repo
 *  - applied:           code changes are in; waiting for the first real trace
 *  - verified:          a real span arrived — onboarding is complete
 *  - rejected:          the user said no; the agent exits cleanly
 *  - expired:           nobody acted before expiresAt; swept by the cron
 *  - failed:            the agent gave up (it reports which stage)
 *
 * Note there is no separate `waiting_for_trace` state: it would always coincide
 * exactly with `applied`, and two states that must flip together are a bug
 * waiting to happen. The UI renders `applied` as "Waiting for your first real
 * trace" — the user-facing distinction is copy, not state.
 */
export const PLAN_STATUSES = [
  "awaiting_approval",
  "approved",
  "applying",
  "applied",
  "verified",
  "rejected",
  "expired",
  "failed",
] as const;
export const PlanStatus = z.enum(PLAN_STATUSES);
export type PlanStatus = z.infer<typeof PlanStatus>;

/** Statuses from which nothing further can happen. */
export const TERMINAL_STATUSES = ["verified", "rejected", "expired", "failed"] as const;

/**
 * The only legal moves. Anything not listed is rejected — a status write can
 * never silently overwrite a terminal state, so a late-arriving agent request
 * can't un-reject or un-expire a plan.
 */
const TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  awaiting_approval: ["approved", "rejected", "expired"],
  approved: ["applying", "expired", "failed"],
  // `expired` here covers the agent that died mid-apply (crashed, laptop
  // closed): without it the plan would sit in `applying` forever and the
  // review page would spin until the end of time. The TTL is generous (24h),
  // so a healthy apply — minutes — never gets close.
  applying: ["applied", "expired", "failed"],
  applied: ["verified", "failed"],
  // Terminal — absorbing states.
  verified: [],
  rejected: [],
  expired: [],
  failed: [],
};

export function isTerminalStatus(status: PlanStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Can a plan move from `from` to `to`? Pure — no I/O, no clock, no database.
 *
 * A self-transition (`from === to`) is always legal so that retries and
 * duplicate requests are no-ops rather than errors: the caller's conditional
 * `UPDATE ... WHERE status = <expected>` simply matches zero rows the second
 * time, which is exactly the idempotency we want.
 */
export function canTransition(from: PlanStatus, to: PlanStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

/** The statuses a plan can still leave — i.e. worth polling for a change. */
export function isPending(status: PlanStatus): boolean {
  return !isTerminalStatus(status);
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Where something lives in the repo, e.g. "src/agents/support.ts:42". */
const SourceRef = z.string().min(1).max(160);

/** One short sentence explaining a recommendation. Never contains code. */
const Rationale = z.string().min(1).max(200);

/** How sure the agent is. Drives the review UI's emphasis, nothing else. */
export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

/**
 * A static name attached to a span (`agentName`, `workflowName`, `traceName`).
 * The constraint that matters: these must be stable literals so they group
 * across runs. Anything dynamic (an id, slug, URL, timestamp) belongs in
 * metadata / workflowRunId / sessionId / customer.id instead.
 */
const StaticName = z.string().min(1).max(48);

/**
 * A described source for a dynamic value, e.g. how to derive a workflowRunId.
 * Prose, not code: "the job id from the queue payload". The agent turns this
 * into an expression when it applies the plan.
 */
const ValueSource = z.string().min(1).max(160);

/** The AI SDK major this repo is on — decides wrap() vs fog.integration(). */
const SdkInfo = z
  .object({
    major: z.union([z.literal(4), z.literal(5), z.literal(6), z.literal(7)]),
    /** Exact installed version string, e.g. "5.0.12". Display only. */
    version: z.string().min(1).max(32),
  })
  .strict();
export type SdkInfo = z.infer<typeof SdkInfo>;

/** A single model call site found in the repo. */
const CallSite = z
  .object({
    /** Unique within the plan; referenced by decisions. */
    id: z.string().min(1).max(64),
    /** The AI SDK function called, e.g. "streamText". */
    fn: z.string().min(1).max(40),
    sourceRef: SourceRef,
    /** Model id if statically determinable, e.g. "gpt-4o". */
    modelId: z.string().max(64).optional(),
  })
  .strict();
export type CallSite = z.infer<typeof CallSite>;

// ---------------------------------------------------------------------------
// Decisions — the reviewable part
// ---------------------------------------------------------------------------

/**
 * A named agent flow. `oneOff` marks calls that aren't a repeated agent at all
 * (a one-shot classification, a title generator) — those get a `traceName`
 * rather than an `agentName`.
 */
const AgentDecision = z
  .object({
    id: z.string().min(1).max(64),
    name: StaticName,
    /** Call site ids this name covers. */
    callIds: z.array(z.string().min(1).max(64)).min(1).max(50),
    oneOff: z.boolean().default(false),
    confidence: Confidence,
    sourceRef: SourceRef,
    rationale: Rationale,
  })
  .strict();
export type AgentDecision = z.infer<typeof AgentDecision>;

/**
 * A multi-step pipeline whose calls share a workflowName + workflowRunId.
 * Batch jobs, crons and pipelines are workflows — never sessions.
 */
const WorkflowDecision = z
  .object({
    id: z.string().min(1).max(64),
    name: StaticName,
    callIds: z.array(z.string().min(1).max(64)).min(1).max(50),
    /** How to derive the per-run id that ties the steps together. */
    runIdSource: ValueSource,
    confidence: Confidence,
    sourceRef: SourceRef,
    rationale: Rationale,
  })
  .strict();
export type WorkflowDecision = z.infer<typeof WorkflowDecision>;

/**
 * A real end-user conversation thread. Only genuine back-and-forth qualifies —
 * one-off calls, background jobs, batches and pipelines must not be labelled
 * with a sessionId.
 */
const SessionDecision = z
  .object({
    id: z.string().min(1).max(64),
    /** Human label for the review UI, e.g. "Support chat". */
    label: z.string().min(1).max(48),
    callIds: z.array(z.string().min(1).max(64)).min(1).max(50),
    /** How to derive the conversation id, e.g. "the thread id on the request". */
    sessionIdSource: ValueSource,
    confidence: Confidence,
    sourceRef: SourceRef,
    rationale: Rationale,
  })
  .strict();
export type SessionDecision = z.infer<typeof SessionDecision>;

/**
 * Per-customer spend attribution. Only recommended when the app clearly serves
 * distinct end-customers or tenants; `recommended: false` is the common and
 * correct answer for a single-tenant app.
 */
const CustomerDecision = z
  .object({
    recommended: z.boolean(),
    /** How to derive customer.id. Required when recommended. */
    idSource: ValueSource.optional(),
    nameSource: ValueSource.optional(),
    imageUrlSource: ValueSource.optional(),
    confidence: Confidence,
    rationale: Rationale,
  })
  .strict()
  .refine((c) => !c.recommended || Boolean(c.idSource), {
    message: "idSource is required when customer attribution is recommended",
  });
export type CustomerDecision = z.infer<typeof CustomerDecision>;

const Decisions = z
  .object({
    agents: z.array(AgentDecision).max(40).default([]),
    workflows: z.array(WorkflowDecision).max(20).default([]),
    sessions: z.array(SessionDecision).max(20).default([]),
    customer: CustomerDecision,
  })
  .strict();
export type Decisions = z.infer<typeof Decisions>;

// ---------------------------------------------------------------------------
// DetectedPlan — what the agent uploads before touching any code
// ---------------------------------------------------------------------------

export const DetectedPlan = z
  .object({
    version: z.literal(PLAN_VERSION),
    sdk: SdkInfo,
    /** Whether the repo has a React UI — decides if the HUD is offered. */
    hasReactUi: z.boolean().default(false),
    /** The architecture map, in the public Scan contract's exact shape. */
    scan: ScanData,
    calls: z.array(CallSite).max(200).default([]),
    decisions: Decisions,
  })
  .strict()
  .superRefine((plan, ctx) => {
    const callIds = new Set(plan.calls.map((c) => c.id));
    const seen = new Set<string>();
    for (const c of plan.calls) {
      if (seen.has(c.id)) {
        ctx.addIssue({ code: "custom", path: ["calls"], message: "call ids must be unique" });
        break;
      }
      seen.add(c.id);
    }
    const groups = [
      ["agents", plan.decisions.agents],
      ["workflows", plan.decisions.workflows],
      ["sessions", plan.decisions.sessions],
    ] as const;
    for (const [key, list] of groups) {
      for (const d of list) {
        for (const id of d.callIds) {
          if (!callIds.has(id)) {
            ctx.addIssue({
              code: "custom",
              path: ["decisions", key],
              message: `unknown call id "${id}"`,
            });
          }
        }
      }
    }
  });
export type DetectedPlan = z.infer<typeof DetectedPlan>;

/**
 * What the agent receives back once the user approves. Stage 1 hands back the
 * decisions unchanged (the review UI is read-only); the shape is separate from
 * DetectedPlan so Stage 2 can return user-edited decisions without the agent
 * needing to change how it reads them.
 */
export const ApprovedPlan = z
  .object({
    version: z.literal(PLAN_VERSION),
    decisions: Decisions,
  })
  .strict();
export type ApprovedPlan = z.infer<typeof ApprovedPlan>;

// ---------------------------------------------------------------------------
// PlanEdits — what the review UI may change before approving (Stage 2)
// ---------------------------------------------------------------------------
//
// The browser never sends a whole Decisions object: it sends a small patch
// keyed by decision id, and the server applies it onto the DETECTED decisions.
// That keeps callIds, sourceRefs, rationales and confidences server-
// authoritative — an edited approval can rename things and adjust sources,
// never invent call sites or rewrite the evidence.

const AgentEdit = z
  .object({
    id: z.string().min(1).max(64),
    name: StaticName.optional(),
    oneOff: z.boolean().optional(),
  })
  .strict();

const WorkflowEdit = z
  .object({
    id: z.string().min(1).max(64),
    name: StaticName.optional(),
    runIdSource: ValueSource.optional(),
  })
  .strict();

const SessionEdit = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(48).optional(),
    sessionIdSource: ValueSource.optional(),
  })
  .strict();

const CustomerEdit = z
  .object({
    recommended: z.boolean().optional(),
    idSource: ValueSource.optional(),
  })
  .strict();

export const PlanEdits = z
  .object({
    agents: z.array(AgentEdit).max(40).default([]),
    workflows: z.array(WorkflowEdit).max(20).default([]),
    sessions: z.array(SessionEdit).max(20).default([]),
    customer: CustomerEdit.optional(),
  })
  .strict();
export type PlanEdits = z.infer<typeof PlanEdits>;

export type ApplyEditsResult =
  | {
      ok: true;
      decisions: Decisions;
      /** Decisions that actually changed — 0 means the edits were all no-ops. */
      editedCount: number;
    }
  | { ok: false; errors: string[] };

/** Trimmed value, or undefined when the edit is absent or trims to nothing —
 *  an all-whitespace input falls back to the detected value instead of
 *  producing an empty name. */
function cleaned(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/**
 * Apply user edits onto the detected decisions, producing what the agent will
 * receive. Pure. Unknown ids are errors (the UI can only edit what was
 * detected); the merged result is re-validated through `Decisions`, so caps
 * and the customer `recommended → idSource` invariant hold no matter what the
 * browser sent.
 */
export function applyPlanEdits(
  detected: Decisions,
  edits: PlanEdits,
): ApplyEditsResult {
  const errors: string[] = [];
  let editedCount = 0;

  function mergeList<
    T extends { id: string },
    E extends { id: string },
  >(
    kind: string,
    list: T[],
    patches: E[],
    apply: (item: T, patch: E) => T,
  ): T[] {
    const byId = new Map(list.map((d) => [d.id, d] as const));
    for (const patch of patches) {
      const cur = byId.get(patch.id);
      if (!cur) {
        errors.push(`decisions.${kind}: unknown id "${patch.id}"`);
        continue;
      }
      const next = apply(cur, patch);
      if (JSON.stringify(next) !== JSON.stringify(cur)) {
        editedCount += 1;
        byId.set(patch.id, next);
      }
    }
    return list.map((d) => byId.get(d.id)!);
  }

  const agents = mergeList(
    "agents",
    detected.agents,
    edits.agents,
    (a, e) => ({
      ...a,
      name: cleaned(e.name) ?? a.name,
      oneOff: e.oneOff ?? a.oneOff,
    }),
  );
  const workflows = mergeList(
    "workflows",
    detected.workflows,
    edits.workflows,
    (w, e) => ({
      ...w,
      name: cleaned(e.name) ?? w.name,
      runIdSource: cleaned(e.runIdSource) ?? w.runIdSource,
    }),
  );
  const sessions = mergeList(
    "sessions",
    detected.sessions,
    edits.sessions,
    (s, e) => ({
      ...s,
      label: cleaned(e.label) ?? s.label,
      sessionIdSource: cleaned(e.sessionIdSource) ?? s.sessionIdSource,
    }),
  );

  let customer = detected.customer;
  if (edits.customer) {
    const next = {
      ...customer,
      recommended: edits.customer.recommended ?? customer.recommended,
      idSource: cleaned(edits.customer.idSource) ?? customer.idSource,
    };
    if (JSON.stringify(next) !== JSON.stringify(customer)) {
      editedCount += 1;
      customer = next;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const parsed = Decisions.safeParse({ agents, workflows, sessions, customer });
  if (!parsed.success) return { ok: false, errors: flatten(parsed.error.issues) };
  return { ok: true, decisions: parsed.data, editedCount };
}

// ---------------------------------------------------------------------------
// AppliedReport — what the agent uploads after editing the repo
// ---------------------------------------------------------------------------

const AppliedCall = z
  .object({
    id: z.string().min(1).max(64),
    instrumented: z.boolean(),
    /** Why it was skipped, when it wasn't instrumented. */
    note: z.string().max(160).optional(),
  })
  .strict();

export const AppliedReport = z
  .object({
    version: z.literal(PLAN_VERSION),
    /** The map as it stands after instrumentation — powers the after-state diff. */
    scan: ScanData,
    calls: z.array(AppliedCall).max(200).default([]),
    /** Repo-relative paths only. No diffs, no contents. */
    filesChanged: z.array(z.string().min(1).max(200)).max(100).default([]),
    /** Anything the user should know, e.g. "flush() needed in the cron entry". */
    warnings: z.array(z.string().min(1).max(200)).max(20).default([]),
    hudEnabled: z.boolean().default(false),
  })
  .strict();
export type AppliedReport = z.infer<typeof AppliedReport>;

/** The stage an agent gave up at, reported on failure. */
export const FailureStage = z.enum(["detect", "apply", "verify"]);
export type FailureStage = z.infer<typeof FailureStage>;

// ---------------------------------------------------------------------------
// Validation helpers — same shape as validateScan (scan.ts)
// ---------------------------------------------------------------------------

export interface PlanValidateOk<T> {
  ok: true;
  data: T;
}
export interface PlanValidateErr {
  ok: false;
  /** Human-readable lines like `decisions.agents.0.name: too long`. */
  errors: string[];
}

function flatten(issues: z.ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `${path}: ${issue.message}`;
  });
}

export function validateDetectedPlan(
  input: unknown,
): PlanValidateOk<DetectedPlan> | PlanValidateErr {
  const res = DetectedPlan.safeParse(input);
  if (res.success) return { ok: true, data: res.data };
  return { ok: false, errors: flatten(res.error.issues) };
}

export function validateAppliedReport(
  input: unknown,
): PlanValidateOk<AppliedReport> | PlanValidateErr {
  const res = AppliedReport.safeParse(input);
  if (res.success) return { ok: true, data: res.data };
  return { ok: false, errors: flatten(res.error.issues) };
}

// ---------------------------------------------------------------------------
// Graph audit — degenerate-map detection
// ---------------------------------------------------------------------------

/**
 * Structural sanity checks on the architecture map, beyond what the schema can
 * express. A graph that is just the decisions list re-drawn — all agent nodes,
 * barely any wiring, no models or stores — defeats the review page: the user
 * can't judge a plan against a picture that isn't their system. These lines
 * join the 422 `details` on upload, so the agent self-corrects and retries.
 *
 * Thresholds are deliberately loose: a tiny repo with two agents and a route
 * passes untouched. Only maps that are BOTH sizable and degenerate fail.
 */
export function auditPlanGraph(plan: DetectedPlan): string[] {
  const { nodes, edges } = plan.scan.graph;
  const errors: string[] = [];
  const ofKind = (kind: GraphNode["kind"]) =>
    nodes.filter((n) => n.kind === kind);

  if (plan.calls.length > 0 && ofKind("model").length === 0) {
    errors.push(
      "scan.graph: no model nodes — add one model node per distinct model the calls use, wired from the agents that call it",
    );
  }

  const agents = ofKind("agent");
  if (nodes.length >= 8 && agents.length / nodes.length > 0.8) {
    errors.push(
      `scan.graph: ${agents.length} of ${nodes.length} nodes are agents — this is the decisions list re-drawn, not the architecture; add the models, services, stores and third-party APIs the flows touch`,
    );
  }

  if (nodes.length >= 6 && edges.length * 2 < nodes.length) {
    errors.push(
      `scan.graph: only ${edges.length} edges for ${nodes.length} nodes — most of the map floats unconnected; wire each flow end to end, entry through model`,
    );
  }

  if (nodes.length >= 6) {
    const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
    const stranded = agents.filter((n) => !connected.has(n.id));
    if (agents.length >= 3 && stranded.length * 2 > agents.length) {
      errors.push(
        `scan.graph: ${stranded.length} of ${agents.length} agent nodes have no edges at all — connect each agent FROM what triggers it and TO what it uses`,
      );
    }
    if (ofKind("entry").length === 0 && ofKind("cron").length === 0) {
      errors.push(
        "scan.graph: no entry or cron nodes — add the real routes, pages, webhooks or scheduled jobs that trigger the AI work",
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Summary — the one-line headline on the review page
// ---------------------------------------------------------------------------

export interface PlanSummary {
  agents: number;
  workflows: number;
  sessions: number;
  calls: number;
}

/** Counts for "Foglamp found 4 agents, 2 workflows, …". */
export function summarizePlan(plan: DetectedPlan): PlanSummary {
  return {
    agents: plan.decisions.agents.length,
    workflows: plan.decisions.workflows.length,
    sessions: plan.decisions.sessions.length,
    calls: plan.calls.length,
  };
}
