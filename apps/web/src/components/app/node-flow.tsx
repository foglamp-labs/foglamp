"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import { Skeleton } from "@foglamp/ui/components/skeleton";

import { cn } from "@/lib/utils";
import { formatDateTime, formatDuration } from "@/lib/format";

export type FlowNode = {
  /** Stable key. */
  id: string;
  /** Brand/type icon shown in the box (e.g. <ModelLogo /> or a tabler icon). */
  icon: React.ReactNode;
  /** Pill text — the step/agent name. */
  label: string;
  /** Optional muted second line (e.g. model id). */
  sublabel?: string | null;
  /** Drives the pill colour. `aborted` (amber) is a clean cancellation. */
  status: "ok" | "error" | "aborted";
  /** ClickHouse datetime / ISO string; rendered as a timestamp under the pill. */
  timestamp: string;
  /** Optional duration (ms) shown next to the timestamp. */
  durationMs?: number | null;
};

/**
 * A horizontal flow of nodes — icon boxes joined by lines, with a status-coloured
 * pill and timestamp under each. Used for a workflow run's agent steps and an
 * agent trace's LLM/tool steps. Scrolls horizontally when it overflows. When
 * `onNodeClick` is given, the icon/label area is a button.
 */
export function NodeFlow({
  nodes,
  onNodeClick,
}: {
  nodes: FlowNode[];
  onNodeClick?: (id: string) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex w-max min-w-full items-start">
        {nodes.map((node, i) => {
          const column = (
            <>
              {/* Icon box with a connector line stub on each side (the first
                  node hides its left stub, the last its right) so adjacent
                  boxes read as joined regardless of horizontal scroll. */}
              <div className="relative flex w-full items-center justify-center">
                {i > 0 && (
                  <div className="absolute top-1/2 right-1/2 -left-1 h-px -translate-y-1/2 bg-border" />
                )}
                {i < nodes.length - 1 && (
                  <div className="absolute top-1/2 -right-1 left-1/2 h-px -translate-y-1/2 bg-border" />
                )}
                <div
                  className={cn(
                    "relative flex size-12 items-center dark:text-emerald-600 text-emerald-400 justify-center rounded-3xl corner-squircle border dark:bg-background bg-neutral-50",
                    node.status === "error" &&
                      "border-rose-500/40 dark:text-rose-600 text-rose-400",
                    node.status === "aborted" &&
                      "border-amber-500/40 dark:text-amber-600 text-amber-400"
                  )}
                >
                  {node.icon}
                </div>
              </div>

              <Badge
                variant={
                  node.status === "error"
                    ? "rose"
                    : node.status === "aborted"
                      ? "amber"
                      : "emerald"
                }
                className="max-w-full mt-0.5"
              >
                <span className="truncate">{node.label}</span>
              </Badge>

              {node.sublabel && (
                <span className="max-w-full truncate text-[10px] text-muted-foreground">
                  {node.sublabel}
                </span>
              )}

              <span className="text-center text-[10px] text-muted-foreground/70 tabular-nums mt-0.5">
                {formatDateTime(node.timestamp)}
                <br />
                {node.durationMs != null && (
                  <>{formatDuration(node.durationMs)}</>
                )}
              </span>
            </>
          );

          const base = "flex w-32 shrink-0 flex-col items-center gap-2 px-1";
          const inner = "flex w-full flex-col items-center gap-2";
          return (
            <div key={node.id} className={base}>
              {onNodeClick ? (
                <button
                  type="button"
                  onClick={() => onNodeClick(node.id)}
                  className={cn(
                    inner,
                    "rounded-lg py-1 hover:bg-accent/50 cursor-pointer"
                  )}
                >
                  {column}
                </button>
              ) : (
                <div className={inner}>{column}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Loading placeholder shaped like {@link NodeFlow} — same column width, icon
 * box, connector lines, pill, and timestamp — so swapping it in for a loading
 * run doesn't shift the layout or flicker the card height. `count` should track
 * the run's trace count when known so the skeleton's width roughly matches the
 * flow that's about to replace it.
 */
export function NodeFlowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex w-max min-w-full items-start">
        {Array.from({ length: Math.max(1, count) }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder
            key={i}
            className="flex w-32 shrink-0 flex-col items-center gap-2 px-1 py-1"
          >
            <div className="relative flex w-full items-center justify-center">
              {i > 0 && (
                <div className="absolute top-1/2 right-1/2 -left-1 h-px -translate-y-1/2 bg-border" />
              )}
              {i < count - 1 && (
                <div className="absolute top-1/2 -right-1 left-1/2 h-px -translate-y-1/2 bg-border" />
              )}
              <div className="relative flex size-12 items-center justify-center rounded-xl border bg-background shadow-(--custom-shadow)">
                <Skeleton className="size-5 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-5.5 w-20 rounded-md mt-0.5" />
            <Skeleton className="h-3 w-16 rounded-sm" />
            <Skeleton className="h-1.5 w-8 rounded-sm mt-0.5" />
          </div>
        ))}
      </div>
    </div>
  );
}
