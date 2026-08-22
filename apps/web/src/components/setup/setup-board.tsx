"use client";

import type {
  AppliedReport,
  Decisions,
  DetectedPlan,
  PlanEdits,
  PlanStatus,
} from "@foglamp/contracts/instrumentation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FlowMap, type MapZoomTarget } from "@/components/scan/flow-map";

import { DecisionList, type EditPatch } from "./decision-list";
import { SetupSummary } from "./setup-summary";
import { VerificationReport } from "./verification-report";

// Hovering a decision row spotlights its subject on the map: a single agent
// by node label, a single workflow by group label.
export type SetupFocus =
  | { type: "agent"; name: string }
  | { type: "workflow"; name: string }
  | null;

/**
 * Review-time overrides, keyed by decision id. Only divergence from the
 * detected values is stored; approving converts whatever remains into the
 * `PlanEdits` patch the server merges (server-side, onto ITS copy — the
 * browser never ships a whole decisions blob).
 */
export interface EditsState {
  agents: Record<string, { name?: string; oneOff?: boolean }>;
  workflows: Record<string, { name?: string; runIdSource?: string }>;
  sessions: Record<string, { label?: string; sessionIdSource?: string }>;
  customer?: { recommended?: boolean; idSource?: string };
}

const NO_EDITS: EditsState = { agents: {}, workflows: {}, sessions: {} };

/** Drop `undefined` fields; return undefined when nothing survives. */
function compact<T extends Record<string, unknown>>(o: T): T | undefined {
  const entries = Object.entries(o).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

// The review surface. Shares the map with the public scan board, but nothing
// else: no attribution, no rail, no share affordances — the user is already
// signed in on our own domain, and this page's one job is a decision. A single
// left column carries the summary+actions card and the compact decision list;
// the rest of the viewport belongs to the map.

/** Clearance for the initial map fit: the left column is all there is. */
const MAP_PADDING = { left: 452, right: 48 };

export function SetupBoard({
  plan,
  approved,
  applied,
  status,
  firstTraceId,
  spanCount,
  secondsToFirstTrace,
  failureStage,
  onApprove,
  onReject,
  approving,
}: {
  plan: DetectedPlan;
  /** The decisions actually agreed to (detected + edits), once approved. */
  approved?: Decisions | null;
  /** The agent's after-report, once the plan has been applied. */
  applied?: AppliedReport | null;
  status: PlanStatus;
  firstTraceId?: string | null;
  spanCount?: number | null;
  secondsToFirstTrace?: number | null;
  failureStage?: string | null;
  onApprove: (edits: PlanEdits | undefined) => void;
  onReject: () => void;
  approving: boolean;
}) {
  const [focus, setFocusState] = useState<SetupFocus>(null);
  // Spotlighting re-renders the whole map, so hover commits are debounced:
  // scrolling (or sweeping the pointer down) the list fires mouseenter on
  // every row it passes, and rendering the map once per row is what made the
  // list feel laggy. Only the row the cursor actually RESTS on gets a render
  // — consecutive calls coalesce to the last one. The commit itself is still
  // a transition, so React can abandon it if a newer focus lands mid-render.
  const focusTimer = useRef<number | null>(null);
  const setFocus = useCallback((focus: SetupFocus) => {
    if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    focusTimer.current = window.setTimeout(() => {
      focusTimer.current = null;
      startTransition(() => setFocusState(focus));
    }, 90);
  }, []);
  useEffect(
    () => () => {
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    },
    []
  );
  // Clicking a row flies the map to its subject. A fresh object per click on
  // purpose: re-clicking the same row after panning away re-centers it.
  const [zoom, setZoom] = useState<MapZoomTarget | null>(null);
  const selectFocus = useCallback((focus: NonNullable<SetupFocus>) => {
    setZoom(
      focus.type === "agent"
        ? { labels: [focus.name] }
        : { groups: [focus.name] }
    );
  }, []);

  // Each patch carries the row's WHOLE override (the editor threads untouched
  // fields through), so merging is replacement: compact the patch, then store
  // or delete the row.
  const [edits, setEdits] = useState<EditsState>(NO_EDITS);
  const applyEdit = useCallback((patch: EditPatch) => {
    setEdits((prev) => {
      if (patch.kind === "customer") {
        const row = compact({
          recommended: patch.recommended,
          idSource: patch.idSource,
        });
        return { ...prev, customer: row };
      }
      const { kind, id, ...fields } = patch;
      const key = (
        { agent: "agents", workflow: "workflows", session: "sessions" } as const
      )[kind];
      const rows = { ...prev[key] } as Record<string, object>;
      const row = compact(fields);
      if (row) rows[id] = row;
      else delete rows[id];
      return { ...prev, [key]: rows };
    });
  }, []);

  // The wire shape: arrays of {id, ...changes}. Overrides equal to the
  // detected value were never stored, so everything here is a real change.
  const buildEdits = useCallback((): PlanEdits | undefined => {
    const agents = Object.entries(edits.agents).map(([id, e]) => ({
      id,
      ...e,
    }));
    const workflows = Object.entries(edits.workflows).map(([id, e]) => ({
      id,
      ...e,
    }));
    const sessions = Object.entries(edits.sessions).map(([id, e]) => ({
      id,
      ...e,
    }));
    if (
      !agents.length &&
      !workflows.length &&
      !sessions.length &&
      !edits.customer
    ) {
      return undefined;
    }
    return { agents, workflows, sessions, customer: edits.customer };
  }, [edits]);

  // Post-approval the source of truth flips: the list shows what was agreed
  // to (detected + edits), not the raw detection.
  const decisions = approved ?? plan.decisions;
  // Stable identity — FlowMap relayouts when the group-name CONTENT changes.
  // Union of detected and approved names: the before-graph carries detected
  // group labels, the agent's after-graph carries the (possibly renamed)
  // approved ones, and matching is by name.
  const workflowNames = useMemo(() => {
    const names = new Set(plan.decisions.workflows.map((w) => w.name));
    for (const w of approved?.workflows ?? []) names.add(w.name);
    return [...names];
  }, [plan, approved]);
  // Once the agent reports back, the map shows the instrumented architecture.
  const graph = applied?.scan.graph ?? plan.scan.graph;

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
          onApprove={() => onApprove(buildEdits())}
          onReject={onReject}
          approving={approving}
        />
        {applied ? (
          <VerificationReport
            before={plan.scan}
            report={applied}
            verified={status === "verified"}
            spanCount={spanCount}
            secondsToFirstTrace={secondsToFirstTrace}
          />
        ) : null}
        <DecisionList
          decisions={decisions}
          edits={edits}
          editable={status === "awaiting_approval"}
          onEdit={applyEdit}
          onFocus={setFocus}
          onSelect={selectFocus}
        />
      </div>

      <FlowMap
        graph={graph}
        focusKinds={null}
        focusLabels={focus?.type === "agent" ? [focus.name] : null}
        focusGroups={focus?.type === "workflow" ? [focus.name] : null}
        workflowGroups={workflowNames}
        padding={MAP_PADDING}
        zoomTo={zoom}
      />
    </div>
  );
}
