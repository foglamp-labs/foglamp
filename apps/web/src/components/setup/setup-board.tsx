"use client";

import type {
  DetectedPlan,
  PlanStatus,
} from "@foglamp/contracts/instrumentation";
import { useState } from "react";

import { FlowMap } from "@/components/scan/flow-map";

import { DecisionList } from "./decision-list";
import { SetupSummary } from "./setup-summary";

// Hovering a decision row spotlights its subject on the map: a single agent
// by node label, a single workflow by group label.
export type SetupFocus =
  | { type: "agent"; name: string }
  | { type: "workflow"; name: string }
  | null;

// The review surface. Shares the map with the public scan board, but nothing
// else: no attribution, no rail, no share affordances — the user is already
// signed in on our own domain, and this page's one job is a decision. A single
// left column carries the summary+actions card and the compact decision list;
// the rest of the viewport belongs to the map.

/** Clearance for the initial map fit: the left column is all there is. */
const MAP_PADDING = { left: 452, right: 48 };

export function SetupBoard({
  plan,
  status,
  firstTraceId,
  failureStage,
  onApprove,
  onReject,
  approving,
}: {
  plan: DetectedPlan;
  status: PlanStatus;
  firstTraceId?: string | null;
  failureStage?: string | null;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
}) {
  const [focus, setFocus] = useState<SetupFocus>(null);
  const { workflows } = plan.decisions;

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-100 text-foreground dark:bg-background">
      {/* The one column: what was found + approve, then why. The page never
          scrolls — the decisions card fills whatever height the summary
          leaves and scrolls inside itself. */}
      <div className="absolute top-6 bottom-24 left-6 z-20 flex w-72 flex-col gap-4">
        <SetupSummary
          plan={plan}
          status={status}
          firstTraceId={firstTraceId}
          failureStage={failureStage}
          onApprove={onApprove}
          onReject={onReject}
          approving={approving}
        />
        <DecisionList plan={plan} onFocus={setFocus} />
      </div>

      <FlowMap
        graph={plan.scan.graph}
        focusKinds={null}
        focusLabels={focus?.type === "agent" ? [focus.name] : null}
        focusGroups={focus?.type === "workflow" ? [focus.name] : null}
        workflowGroups={workflows.map((w) => w.name)}
        padding={MAP_PADDING}
      />
    </div>
  );
}
