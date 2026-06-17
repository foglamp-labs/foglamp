"use client";

import { useTheme } from "next-themes";
import { Text as RechartsText } from "recharts";

import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { cn } from "@/lib/utils";

// Evil Charts wants `colors: { light, dark }`; our --chart-* vars adapt to the
// theme already, so the same value serves both.
export const themed = (color: string) => ({ light: [color], dark: [color] });

/** Clickable legend for the trend charts. Lives in the card header so it lines
 * up with the description, and drives the chart's selection in a controlled way.
 * Swatch colors are resolved from the config for the active theme. */
export function ChartLegend({
  config,
  selected,
  onSelect,
}: {
  config: ChartConfig;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  // Honor a forced theme (the marketing demo forces dark) before the user's
  // stored theme, which next-themes still reports via resolvedTheme.
  const { resolvedTheme, forcedTheme } = useTheme();
  const mode = (forcedTheme ?? resolvedTheme) === "dark" ? "dark" : "light";

  return (
    <div className="flex items-center gap-3 select-none">
      {Object.entries(config).map(([key, entry]) => {
        const color = entry.colors?.[mode]?.[0] ?? entry.colors?.light?.[0];
        const dimmed = selected !== null && selected !== key;
        const active = selected === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(selected === key ? null : key)}
            className={cn(
              "text-muted-foreground flex items-center cursor-pointer gap-1.5 text-sm transition-all hover:text-foreground",
              dimmed && "opacity-30",
              active && "text-foreground"
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-2xl corner-squircle"
              style={{ backgroundColor: color }}
            />
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

/** A bucket-axis label: time-of-day for short windows, month/day for spans over
 * ~2 days (where bare times would repeat across days). */
export function makeBucketLabel(windowMs: number) {
  const multiDay = windowMs > 2 * 86_400_000;
  return (bucket: string) => {
    const d = new Date(`${bucket.replace(" ", "T")}Z`);
    if (Number.isNaN(d.getTime())) return bucket;
    return multiDay
      ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : d.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
  };
}

/** A full date+time label for tooltips, where every bucket should stay
 * distinguishable even when the axis only shows the day. */
export function formatBucketFull(bucket: string) {
  const d = new Date(`${bucket.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return bucket;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** One representative bucket per distinct axis label, so the x-axis shows e.g.
 * a single "May 29" tick instead of one per sub-day bucket. */
export function dedupeTicks(buckets: string[], labelFn: (b: string) => string) {
  const ticks: string[] = [];
  let last: string | null = null;
  for (const b of buckets) {
    const l = labelFn(b);
    if (l !== last) {
      ticks.push(b);
      last = l;
    }
  }
  return ticks;
}

/** Thin the per-label representatives down to ~`target` evenly-spaced ticks,
 * always keeping both endpoints. Crucially, the final tick is held a full step
 * away from its neighbour (replacing the penultimate pick when needed) so the
 * end-anchored last label doesn't crowd the one before it. */
export function thinTicks(
  buckets: string[],
  labelFn: (b: string) => string,
  target = 8
) {
  const reps = dedupeTicks(buckets, labelFn);
  const n = reps.length;
  if (n <= target) return reps;
  const step = Math.ceil((n - 1) / (target - 1));
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i += step) idx.push(i);
  if (n - 1 - idx[idx.length - 1]! < step) idx[idx.length - 1] = n - 1;
  else idx.push(n - 1);
  return idx.map((i) => reps[i]!);
}

/**
 * An x-axis tick renderer that anchors the first label to its start and the last
 * to its end, so the edge labels tuck inward instead of overhanging the plot —
 * keeping the chart data full-bleed (no plot-area padding). Middle labels stay
 * centred. Inherits the muted axis color/size from the ChartContainer CSS since
 * it renders inside the `.recharts-cartesian-axis-tick` group.
 */
export function makeEdgeTick(labelFn: (b: string) => string) {
  return function EdgeTick(props: {
    x?: string | number;
    y?: string | number;
    index?: number;
    visibleTicksCount?: number;
    payload?: { value: string | number };
  }) {
    const { x = 0, y = 0, index = 0, visibleTicksCount = 0, payload } = props;
    const anchor =
      index === 0
        ? "start"
        : index === visibleTicksCount - 1
          ? "end"
          : "middle";
    return (
      <RechartsText
        x={Number(x)}
        y={Number(y)}
        dy={4}
        textAnchor={anchor}
        verticalAnchor="start"
      >
        {payload ? labelFn(String(payload.value)) : ""}
      </RechartsText>
    );
  };
}

/** Page numbers to render (1-based), collapsing long runs to a single ellipsis,
 * e.g. `1 … 4 5 6 … 20`. */
export function pageWindow(
  current: number,
  total: number
): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const middle: number[] = [];
  for (
    let i = Math.max(2, current - 1);
    i <= Math.min(total - 1, current + 1);
    i++
  )
    middle.push(i);
  const out: (number | "ellipsis")[] = [1];
  if (middle[0] > 2) out.push("ellipsis");
  out.push(...middle);
  if (middle[middle.length - 1] < total - 1) out.push("ellipsis");
  out.push(total);
  return out;
}
