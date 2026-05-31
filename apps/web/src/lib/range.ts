// Time-range model shared by the metric pages. A range resolves to concrete
// instants (passed to tRPC as ISO strings; `z.coerce.date` parses them
// server-side). Presets are either relative (now-anchored) or calendar-anchored;
// a custom range comes from the calendar picker.
import {
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subHours,
  subMonths,
} from "date-fns";

export type RangeValue = {
  /** Originating preset key, or "custom" for a calendar-selected range. */
  key: string;
  label: string;
  from: Date;
  to: Date;
};

type Preset = {
  key: string;
  label: string;
  resolve: (now: Date) => { from: Date; to: Date };
};

export const RANGE_PRESETS: Preset[] = [
  { key: "1h", label: "Last hour", resolve: (n) => ({ from: subHours(n, 1), to: n }) },
  {
    key: "24h",
    label: "Last 24 hours",
    resolve: (n) => ({ from: subHours(n, 24), to: n }),
  },
  { key: "7d", label: "Last 7 days", resolve: (n) => ({ from: subDays(n, 7), to: n }) },
  {
    key: "30d",
    label: "Last 30 days",
    resolve: (n) => ({ from: subDays(n, 30), to: n }),
  },
  {
    key: "90d",
    label: "Last 90 days",
    resolve: (n) => ({ from: subDays(n, 90), to: n }),
  },
  { key: "today", label: "Today", resolve: (n) => ({ from: startOfDay(n), to: n }) },
  {
    key: "month",
    label: "This month",
    resolve: (n) => ({ from: startOfMonth(n), to: n }),
  },
  {
    key: "lastMonth",
    label: "Last month",
    resolve: (n) => {
      const start = startOfMonth(subMonths(n, 1));
      return { from: start, to: endOfMonth(start) };
    },
  },
];

export function resolvePreset(key: string, now: Date = new Date()): RangeValue {
  const p = RANGE_PRESETS.find((x) => x.key === key) ?? RANGE_PRESETS[1]!;
  const { from, to } = p.resolve(now);
  return { key: p.key, label: p.label, from, to };
}

export function defaultRange(): RangeValue {
  return resolvePreset("24h");
}

/** A calendar-selected absolute range (whole days, inclusive of the end day). */
export function customRange(from: Date, to: Date): RangeValue {
  const f = startOfDay(from);
  const t = endOfDay(to);
  return { key: "custom", label: formatRangeLabel(f, t), from: f, to: t };
}

export function formatRangeLabel(from: Date, to: Date): string {
  const sameDay = startOfDay(from).getTime() === startOfDay(to).getTime();
  if (sameDay) return format(from, "MMM d, yyyy");
  const sameYear = from.getFullYear() === to.getFullYear();
  return `${format(from, sameYear ? "MMM d" : "MMM d, yyyy")} – ${format(
    to,
    "MMM d, yyyy",
  )}`;
}
