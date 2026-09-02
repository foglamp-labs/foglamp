const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const plain = new Intl.NumberFormat("en-US");

/** Cost in USD; null/undefined → em dash (unpriced, never $0). */
export function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return usd.format(value);
}

export function formatTokens(value: number): string {
  return value >= 1000 ? compact.format(value) : plain.format(value);
}

/** Tokens/sec; null/undefined → em dash. */
export function formatTps(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 1000 ? compact.format(value) : Math.round(value)} tok/s`;
}

/** Milliseconds → human duration (µs/ms/s/m/h). */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms === 0) return "0s";
  if (ms < 1) return `${Math.round(ms * 1000)}µs`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.slice(0, 2).join(" ") || "0s";
}
