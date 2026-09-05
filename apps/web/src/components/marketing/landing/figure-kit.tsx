"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import type { ReactNode } from "react";

// Shared pieces for the benefit figures: the frame they all sit in (the same
// chrome as the hero demo, so the page reads as one product), a few small
// product-styled parts, and the mock data every section draws from.

/** The hero demo's chrome: a hairline frame, the sidebar tint, and the inset
 * content surface. Every figure renders inside one so the three sections and
 * the hero share a single visual language. */
export function Panel({
  children,
  className,
  inset = true,
}: {
  children: ReactNode;
  className?: string;
  /** Pad the inset surface. Off for figures that fill it edge to edge. */
  inset?: boolean;
}) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl bg-sidebar p-2 ring-1 ring-border dark:bg-neutral-900/70">
      <div
        className={cn(
          "min-w-0 rounded-md squircle:rounded-xl corner-squircle bg-background text-sm text-foreground dark:shadow-(--custom-shadow)",
          inset && "p-5",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A small product card with an optional title row. */
export function Tile({
  title,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card size="sm" className={cn("gap-3", className)}>
      {title !== undefined && (
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{title}</CardTitle>
          {action}
        </CardHeader>
      )}
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

/** A ranked breakdown entry, as on the overview: glyph and name on the left,
 * value and a share bar on the right. */
export function BreakdownRow({
  icon,
  title,
  value,
  fraction,
  color,
  trailing,
}: {
  icon: ReactNode;
  title: string;
  value: ReactNode;
  fraction: number;
  color: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {icon}
        <span className="truncate">{title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {trailing}
        <div className="flex flex-col items-end gap-1.5">
          <span className="tabular-nums">{value}</span>
          <div className="h-0.5 w-12 overflow-hidden rounded-full bg-muted-foreground/10">
            <div
              className="ml-auto h-full rounded-full"
              style={{
                width: `${Math.max(2, fraction * 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Label over value, as in the trace inspector. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-[13px] tabular-nums">{value}</span>
    </div>
  );
}

/** A muted mono key, for ids and code. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-xs text-muted-foreground", className)}>
      {children}
    </span>
  );
}

// ─── Mock data ──────────────────────────────────────────────────────────────

export const MODELS = [
  { id: "gpt-5.6-sol", cost: 512.4, color: "#10a37f", requests: 8100, tokens: 24_200_000 },
  { id: "claude-fable-5", cost: 284.1, color: "#d97757", requests: 5600, tokens: 14_100_000 },
  { id: "gemini-3.5-flash", cost: 45.67, color: "#1ba1e3", requests: 4500, tokens: 4_500_000 },
  { id: "glm-5", cost: 38.2, color: "#9ca3af", requests: 2100, tokens: 3_900_000 },
] as const;

export const AGENTS = [
  { name: "research-planner", cost: 318.2, requests: 3100, tokens: 9_800_000, p95: 4120, errors: 12 },
  { name: "support-triage", cost: 214.8, requests: 6200, tokens: 7_400_000, p95: 2810, errors: 31 },
  { name: "code-reviewer", cost: 196.4, requests: 2400, tokens: 6_100_000, p95: 3940, errors: 8 },
  { name: "email-drafter", cost: 58.1, requests: 1800, tokens: 1_900_000, p95: 1620, errors: 4 },
] as const;

export const CUSTOMERS = [
  { id: "cus_acme", name: "Acme Inc", cost: 241.6, delta: 0.18 },
  { id: "cus_globex", name: "Globex", cost: 188.3, delta: -0.06 },
  { id: "cus_initech", name: "Initech", cost: 122.9, delta: 0.42 },
  { id: "cus_umbrella", name: "Umbrella", cost: 74.2, delta: 0.03 },
  { id: "cus_hooli", name: "Hooli", cost: 31.5, delta: -0.12 },
] as const;

export const TOTAL_COST = 842.17;

/** `n` hourly ClickHouse-style buckets ending at a fixed hour, so the trend
 * chart helpers label them like real data. */
export function hourBuckets(n: number): string[] {
  const base = new Date("2026-06-15T14:00:00Z").getTime();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base - (n - 1 - i) * 3_600_000);
    return d.toISOString().slice(0, 19).replace("T", " ");
  });
}

export const BUCKETS = hourBuckets(24);
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** A workday bell over the hour of day, near 0 in the small hours and near 1
 * mid afternoon. */
export function wave(i: number): number {
  const hour = (14 - (23 - i) + 24) % 24;
  return 0.5 - 0.5 * Math.cos(((hour - 3) / 24) * 2 * Math.PI);
}

/** Deterministic jitter in [0, 1). */
export function noise(i: number, seed: number): number {
  const x = Math.sin(i * 113.9 + seed * 271.3) * 43758.5453;
  return x - Math.floor(x);
}

/** Percentile thresholds at 20/40/60/80, for heat-tinted cells. */
export function quintiles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  return [0.2, 0.4, 0.6, 0.8].map((q) => {
    const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
    return sorted[idx] ?? 0;
  });
}

// One support-triage run, the same shape the hero's trace page shows.
export type Span = {
  id: string;
  parent: string | null;
  name: string;
  type: "agent" | "llm" | "tool";
  start: number;
  end: number;
  tokens?: number;
  cost?: number;
  error?: boolean;
};

export const SPANS: Span[] = [
  { id: "s0", parent: null, name: "support-triage", type: "agent", start: 0, end: 5840 },
  { id: "s1", parent: "s0", name: "classify-intent", type: "llm", start: 120, end: 1040, tokens: 612, cost: 0.0011 },
  { id: "s2", parent: "s0", name: "fetch-order", type: "tool", start: 1080, end: 1520 },
  { id: "s3", parent: "s0", name: "search-knowledge-base", type: "tool", start: 1560, end: 2900 },
  { id: "s4", parent: "s3", name: "rerank-passages", type: "llm", start: 1900, end: 2700, tokens: 1480, cost: 0.0026 },
  { id: "s5", parent: "s0", name: "draft-reply", type: "llm", start: 2960, end: 5780, tokens: 1830, cost: 0.0091 },
];

export const TRACE = {
  id: "tr_9f2a4c8e1b7d3a6f5e0c",
  title:
    'Hey, my order #48213 still says "processing" after 5 days. Can you check what\'s going on?',
  agent: "support-triage",
  model: "gpt-5.6-sol",
  customer: { id: "cus_acme", name: "Acme Inc" },
  durationMs: 5840,
  tokens: 3922,
  cost: 0.0128,
  when: "12s ago",
};

export const REPLY =
  "Thanks for your patience. Order #48213 is held at our warehouse because one item is on backorder. It ships Thursday, and I have added free express shipping so it arrives Friday.";
