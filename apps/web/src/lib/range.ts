// Time-range presets shared by the metric pages. Resolved to concrete ISO
// instants at query time so tRPC (z.coerce.date) parses them server-side.

export type RangeKey = "1h" | "24h" | "7d" | "30d";

export const RANGE_PRESETS: { key: RangeKey; label: string; ms: number }[] = [
  { key: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

export function resolveRange(key: RangeKey): { from: string; to: string } {
  const preset = RANGE_PRESETS.find((p) => p.key === key) ?? RANGE_PRESETS[1]!;
  const to = new Date();
  const from = new Date(to.getTime() - preset.ms);
  return { from: from.toISOString(), to: to.toISOString() };
}
