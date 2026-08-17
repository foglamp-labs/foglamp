import { describe, expect, test } from "bun:test";

import {
  canTransition,
  isPending,
  isTerminalStatus,
  PLAN_STATUSES,
  PLAN_VERSION,
  summarizePlan,
  TERMINAL_STATUSES,
  validateAppliedReport,
  validateDetectedPlan,
} from "./instrumentation";
import type { PlanStatus } from "./instrumentation";

// A minimal-but-valid ScanData, since DetectedPlan embeds the public contract.
const scan = {
  version: 1 as const,
  project: { name: "Acme", slug: "acme", date: "2026-08-17" },
  stats: { agents: 1, models: 1, tools: 0, integrations: 0 },
  topModels: [],
  topTools: [],
  topIntegrations: [],
  graph: {
    nodes: [{ id: "a", label: "Support agent", kind: "agent" as const }],
    edges: [],
  },
};

const plan = (over: Record<string, unknown> = {}) => ({
  version: PLAN_VERSION,
  sdk: { major: 5, version: "5.0.12" },
  hasReactUi: true,
  scan,
  calls: [{ id: "c1", fn: "streamText", sourceRef: "src/agents/support.ts:42" }],
  decisions: {
    agents: [
      {
        id: "a1",
        name: "support",
        callIds: ["c1"],
        confidence: "high" as const,
        sourceRef: "src/agents/support.ts:42",
        rationale: "A named streamText loop behind the support route.",
      },
    ],
    workflows: [],
    sessions: [],
    customer: { recommended: false, confidence: "high" as const, rationale: "Single tenant." },
  },
  ...over,
});

describe("canTransition", () => {
  test("walks the happy path end to end", () => {
    expect(canTransition("awaiting_approval", "approved")).toBe(true);
    expect(canTransition("approved", "applying")).toBe(true);
    expect(canTransition("applying", "applied")).toBe(true);
    expect(canTransition("applied", "verified")).toBe(true);
  });

  test("allows the user to reject and the cron to expire", () => {
    expect(canTransition("awaiting_approval", "rejected")).toBe(true);
    expect(canTransition("awaiting_approval", "expired")).toBe(true);
    // An approved-but-never-collected plan still ages out.
    expect(canTransition("approved", "expired")).toBe(true);
    // ...but once the agent is mid-apply, expiry must not yank it away.
    expect(canTransition("applying", "expired")).toBe(false);
    expect(canTransition("applied", "expired")).toBe(false);
  });

  test("lets the agent fail from any stage it can act in", () => {
    expect(canTransition("approved", "failed")).toBe(true);
    expect(canTransition("applying", "failed")).toBe(true);
    expect(canTransition("applied", "failed")).toBe(true);
    // Nothing has run yet, so there is nothing to fail.
    expect(canTransition("awaiting_approval", "failed")).toBe(false);
  });

  test("never skips a stage", () => {
    expect(canTransition("awaiting_approval", "applying")).toBe(false);
    expect(canTransition("awaiting_approval", "applied")).toBe(false);
    expect(canTransition("awaiting_approval", "verified")).toBe(false);
    expect(canTransition("approved", "applied")).toBe(false);
    expect(canTransition("approved", "verified")).toBe(false);
    expect(canTransition("applying", "verified")).toBe(false);
  });

  test("never runs backwards", () => {
    expect(canTransition("approved", "awaiting_approval")).toBe(false);
    expect(canTransition("applying", "approved")).toBe(false);
    expect(canTransition("applied", "applying")).toBe(false);
    expect(canTransition("verified", "applied")).toBe(false);
  });

  test("terminal states absorb everything — a late request can't undo them", () => {
    for (const from of TERMINAL_STATUSES) {
      for (const to of PLAN_STATUSES) {
        if (to === from) continue;
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  test("self-transitions are legal, so retries are no-ops not errors", () => {
    for (const s of PLAN_STATUSES) {
      expect(canTransition(s, s)).toBe(true);
    }
  });

  test("every status is reachable from awaiting_approval", () => {
    // Guards against adding a status to the enum but forgetting the edge.
    const seen = new Set<PlanStatus>(["awaiting_approval"]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const from of [...seen]) {
        for (const to of PLAN_STATUSES) {
          if (!seen.has(to) && from !== to && canTransition(from, to)) {
            seen.add(to);
            grew = true;
          }
        }
      }
    }
    expect(seen.size).toBe(PLAN_STATUSES.length);
  });
});

describe("isTerminalStatus / isPending", () => {
  test("splits the enum exactly in half with no overlap", () => {
    for (const s of PLAN_STATUSES) {
      expect(isPending(s)).toBe(!isTerminalStatus(s));
    }
    expect(PLAN_STATUSES.filter(isTerminalStatus)).toEqual([...TERMINAL_STATUSES]);
  });

  test("a terminal status can never leave", () => {
    for (const s of PLAN_STATUSES) {
      if (!isTerminalStatus(s)) continue;
      expect(PLAN_STATUSES.some((to) => to !== s && canTransition(s, to))).toBe(false);
    }
  });
});

describe("validateDetectedPlan", () => {
  test("accepts a well-formed plan", () => {
    const res = validateDetectedPlan(plan());
    expect(res.ok).toBe(true);
  });

  test("rejects unknown top-level keys — no smuggling extra payload", () => {
    const res = validateDetectedPlan({ ...plan(), sourceCode: "console.log(1)" });
    expect(res.ok).toBe(false);
  });

  test("rejects an unsupported AI SDK major", () => {
    const res = validateDetectedPlan(plan({ sdk: { major: 3, version: "3.0.0" } }));
    expect(res.ok).toBe(false);
  });

  test("rejects a decision pointing at a call site that doesn't exist", () => {
    const p = plan();
    p.decisions.agents[0]!.callIds = ["nope"];
    const res = validateDetectedPlan(p);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toContain("unknown call id");
  });

  test("rejects duplicate call ids", () => {
    const p = plan();
    p.calls = [...p.calls, { ...p.calls[0]! }];
    const res = validateDetectedPlan(p);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toContain("unique");
  });

  test("caps rationale so a file body can't ride along in it", () => {
    const p = plan();
    p.decisions.agents[0]!.rationale = "x".repeat(5000);
    expect(validateDetectedPlan(p).ok).toBe(false);
  });

  test("caps the number of call sites", () => {
    const p = plan();
    p.calls = Array.from({ length: 201 }, (_, i) => ({
      id: `c${i}`,
      fn: "generateText",
      sourceRef: "src/x.ts:1",
    }));
    p.decisions.agents[0]!.callIds = ["c0"];
    expect(validateDetectedPlan(p).ok).toBe(false);
  });

  test("requires an id source when customer attribution is recommended", () => {
    const p = plan();
    p.decisions.customer = {
      recommended: true,
      confidence: "medium",
      rationale: "Serves distinct tenants.",
    } as never;
    expect(validateDetectedPlan(p).ok).toBe(false);
  });

  test("propagates ScanData's own caps", () => {
    const p = plan({
      scan: { ...scan, topModels: [1, 2, 3, 4].map((n) => ({ id: `m${n}`, label: `M${n}` })) },
    });
    expect(validateDetectedPlan(p).ok).toBe(false);
  });

  test("reports errors as readable path: message lines", () => {
    const res = validateDetectedPlan({ version: PLAN_VERSION });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.every((e) => e.includes(":"))).toBe(true);
    }
  });
});

describe("validateAppliedReport", () => {
  const report = (over: Record<string, unknown> = {}) => ({
    version: PLAN_VERSION,
    scan,
    calls: [{ id: "c1", instrumented: true }],
    filesChanged: ["src/agents/support.ts"],
    warnings: [],
    hudEnabled: true,
    ...over,
  });

  test("accepts a well-formed report", () => {
    expect(validateAppliedReport(report()).ok).toBe(true);
  });

  test("rejects a diff or file body sneaking into filesChanged", () => {
    expect(validateAppliedReport(report({ filesChanged: ["x".repeat(500)] })).ok).toBe(false);
  });

  test("rejects unknown keys", () => {
    expect(validateAppliedReport({ ...report(), patch: "@@ -1 +1 @@" }).ok).toBe(false);
  });
});

describe("summarizePlan", () => {
  test("counts what the headline claims", () => {
    const res = validateDetectedPlan(plan());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(summarizePlan(res.data)).toEqual({
      agents: 1,
      workflows: 0,
      sessions: 0,
      calls: 1,
    });
  });
});
