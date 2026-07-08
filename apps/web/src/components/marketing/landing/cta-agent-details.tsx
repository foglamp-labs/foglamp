"use client";

// The agent details that live under the CTA's fog: no card, no border — just
// type, trace bars and numbers sitting on the section itself. Shared by the
// live CtaSection and the bake-off variants.

import { cn } from "@foglamp/ui/lib/utils";
import { IconCircleCheckFilled, IconGhostFilled } from "@tabler/icons-react";

import { ClaudeLogo } from "@/components/brand-logos";

const SPANS = [
  { label: "plan", w: "34%", x: "0%", color: "#f97316" },
  { label: "search_docs", w: "22%", x: "18%", color: "#8b5cf6" },
  { label: "generateText", w: "48%", x: "34%", color: "#3b82f6" },
  { label: "reply", w: "14%", x: "80%", color: "#22c55e" },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-display text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </span>
  );
}

export function AgentDetails({
  animateSpans = false,
  className,
}: {
  /** Spans start collapsed and draw in on group-hover (the "light on" take). */
  animateSpans?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex w-105 max-w-full flex-col gap-7", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center border border-border/20 justify-center rounded-2xl corner-squircle bg-blue-500/10 text-blue-500">
          <IconGhostFilled className="size-5" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="font-display text-sm font-semibold leading-tight">
            Support Agent
          </span>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ClaudeLogo className="size-3" /> Claude Fable 5
          </span>
        </span>
        <span className="ml-auto rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs flex items-center pl-2 gap-1 font-medium text-emerald-500">
          <IconCircleCheckFilled className="size-3 mb-px" />
          Passed
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {SPANS.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-24 truncate font-mono text-[11px] text-muted-foreground">
              {s.label}
            </span>
            <div className="relative h-0.5 flex-1">
              <div
                className={cn(
                  "absolute top-0 h-0.5 rounded-full",
                  animateSpans &&
                    "origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
                )}
                style={{
                  left: s.x,
                  width: s.w,
                  background: s.color,
                  opacity: 0.8,
                  transitionDelay: animateSpans
                    ? `${150 + i * 110}ms`
                    : undefined,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-end justify-between">
        <Stat label="Cost" value="$0.0041" />
        <Stat label="Latency" value="2.3s" />
        <Stat label="Tokens" value="1,842" />
        <Stat label="Evals" value="94%" />
      </div>
    </div>
  );
}
