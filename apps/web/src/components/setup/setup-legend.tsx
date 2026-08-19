"use client";

import { cn } from "@foglamp/ui/lib/utils";
import { IconGhostFilled, IconMessages, IconSitemap } from "@tabler/icons-react";

// The setup page's legend answers a different question than the scan's:
// not "what kinds of things are in this codebase" but "what gets instrumented".
// Agents spotlight by node kind, workflows by group label. Sessions have no
// spatial representation in the graph contract yet, so their chip is a count,
// not a filter — honest over clickable.

export type SetupFocus =
  | { type: "agents" }
  | { type: "workflows" }
  | null;

function Chip({
  label,
  icon,
  active,
  dimmed,
  onEnter,
  onLeave,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  dimmed?: boolean;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn(
        "flex cursor-default items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider transition-all",
        active ? "text-foreground" : "text-muted-foreground/70",
        onEnter && !active && "hover:text-foreground",
        dimmed && "opacity-40",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function SetupLegend({
  agentCount,
  workflowCount,
  sessionCount,
  focus,
  onFocus,
}: {
  agentCount: number;
  workflowCount: number;
  sessionCount: number;
  focus: SetupFocus;
  onFocus: (focus: SetupFocus) => void;
}) {
  if (agentCount + workflowCount + sessionCount === 0) return null;
  const dimmed = (type: "agents" | "workflows") =>
    focus !== null && focus.type !== type;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full bg-card/70 px-5 py-2.5 shadow-(--custom-shadow) backdrop-blur-md">
      {agentCount > 0 ? (
        <Chip
          label={`${agentCount} agent${agentCount === 1 ? "" : "s"}`}
          icon={
            <IconGhostFilled
              className={cn(
                "size-3 text-orange-500 transition-transform",
                focus?.type === "agents" ? "scale-110" : "opacity-80",
              )}
            />
          }
          active={focus?.type === "agents"}
          dimmed={dimmed("agents")}
          onEnter={() => onFocus({ type: "agents" })}
          onLeave={() => onFocus(null)}
        />
      ) : null}
      {workflowCount > 0 ? (
        <Chip
          label={`${workflowCount} workflow${workflowCount === 1 ? "" : "s"}`}
          icon={
            <IconSitemap
              className={cn(
                "size-3 text-emerald-500 transition-transform",
                focus?.type === "workflows" ? "scale-110" : "opacity-80",
              )}
            />
          }
          active={focus?.type === "workflows"}
          dimmed={dimmed("workflows")}
          onEnter={() => onFocus({ type: "workflows" })}
          onLeave={() => onFocus(null)}
        />
      ) : null}
      {sessionCount > 0 ? (
        <Chip
          label={`${sessionCount} conversation${sessionCount === 1 ? "" : "s"}`}
          icon={<IconMessages className="size-3 text-sky-500 opacity-80" />}
        />
      ) : null}
    </div>
  );
}
