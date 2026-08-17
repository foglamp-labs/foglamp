"use client";

import type { DetectedPlan, PlanStatus } from "@foglamp/contracts/instrumentation";
import type { NodeKind } from "@foglamp/contracts/scan";
import { useState } from "react";

import { FlowMap } from "@/components/scan/flow-map";
import { KIND_ORDER } from "@/components/scan/kinds";
import { LeftRail } from "@/components/scan/left-rail";
import { PoweredBy } from "@/components/scan/powered-by";
import { ShareBar } from "@/components/scan/share-bar";

import { DecisionList } from "./decision-list";
import { SetupSummary } from "./setup-summary";
import { StatusStrip } from "./status-strip";

// The review surface. Composed from the same primitives as the public scan
// board rather than forked from it: the map, rail and legend are identical, but
// this page is an instrumentation *plan* awaiting approval, not a published
// scan — so it has its own decisions column and no share/publish affordances.

/** Clearance for the initial map fit: left rail + right decisions column. */
const MAP_PADDING = { left: 432, right: 420 };

export function SetupBoard({
  plan,
  status,
  firstTraceId,
  spanCount,
  secondsToFirstTrace,
  failureStage,
  filesChanged,
  onApprove,
  onReject,
  approving,
}: {
  plan: DetectedPlan;
  status: PlanStatus;
  firstTraceId?: string | null;
  spanCount?: number | null;
  secondsToFirstTrace?: number | null;
  failureStage?: string | null;
  filesChanged?: number;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
}) {
  const kinds = KIND_ORDER.filter((k) =>
    plan.scan.graph.nodes.some((n) => n.kind === k),
  );
  const [focusKinds, setFocusKinds] = useState<NodeKind[] | null>(null);

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-100 text-foreground dark:bg-background">
      {/* Left column: attribution, then what's in the codebase. */}
      <div className="absolute top-6 left-6 z-20 flex w-fit max-w-[380px] flex-col gap-4">
        <PoweredBy />
        <LeftRail data={plan.scan} />
      </div>

      {/* Right column: what Foglamp decided, and the approve/live status. */}
      <div className="absolute top-6 right-6 bottom-24 z-20 flex w-[380px] flex-col gap-4 overflow-y-auto no-scrollbar">
        <SetupSummary plan={plan} />
        <StatusStrip
          status={status}
          firstTraceId={firstTraceId}
          spanCount={spanCount}
          secondsToFirstTrace={secondsToFirstTrace}
          failureStage={failureStage}
          filesChanged={filesChanged}
          onApprove={onApprove}
          onReject={onReject}
          approving={approving}
        />
        <DecisionList plan={plan} />
      </div>

      <FlowMap
        graph={plan.scan.graph}
        focusKinds={focusKinds}
        padding={MAP_PADDING}
      />
      <ShareBar
        kinds={kinds}
        focusKinds={focusKinds}
        onFocusKinds={setFocusKinds}
      />
    </div>
  );
}
