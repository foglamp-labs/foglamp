"use client";

import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";

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
  /** Drives the pill colour. */
  status: "ok" | "error";
  /** ClickHouse datetime / ISO string; rendered as a timestamp under the pill. */
  timestamp: string;
  /** Optional duration (ms) shown next to the timestamp. */
  durationMs?: number | null;
};

/**
 * A horizontal flow of nodes — icon boxes joined by lines, with a status-coloured
 * pill and timestamp under each. Used for a workflow run's agent steps and an
 * agent trace's LLM/tool steps. Scrolls horizontally when it overflows. When
 * `onNodeClick` is given, the icon/label area is a button; `onNodeReplay` adds a
 * separate ▶ control under each node (kept a sibling so buttons never nest).
 */
export function NodeFlow({
  nodes,
  onNodeClick,
  onNodeReplay,
}: {
  nodes: FlowNode[];
  onNodeClick?: (id: string) => void;
  onNodeReplay?: (id: string) => void;
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
                  <div className="absolute top-1/2 right-1/2 left-0 h-px -translate-y-1/2 bg-border" />
                )}
                {i < nodes.length - 1 && (
                  <div className="absolute top-1/2 right-0 left-1/2 h-px -translate-y-1/2 bg-border" />
                )}
                <div className="relative flex size-12 items-center justify-center rounded-xl border bg-background shadow-(--custom-shadow)">
                  {node.icon}
                </div>
              </div>

              <Badge
                variant={node.status === "error" ? "rose" : "emerald"}
                className="max-w-full"
              >
                <span className="truncate">{node.label}</span>
              </Badge>

              {node.sublabel && (
                <span className="max-w-full truncate text-[10px] text-muted-foreground">
                  {node.sublabel}
                </span>
              )}

              <span className="text-center text-[10px] text-muted-foreground tabular-nums">
                {formatDateTime(node.timestamp)}
                {node.durationMs != null && (
                  <> · {formatDuration(node.durationMs)}</>
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
                  className={cn(inner, "rounded-lg py-1 hover:bg-accent/50")}
                >
                  {column}
                </button>
              ) : (
                <div className={inner}>{column}</div>
              )}
              {onNodeReplay && (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Replay trace"
                  onClick={() => onNodeReplay(node.id)}
                >
                  <IconPlayerPlayFilled />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
