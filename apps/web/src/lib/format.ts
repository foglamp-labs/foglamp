// Display formatters for the dashboard. Costs come back as numbers|null (null =
// unpriced, must render "—", never "$0.00"); counts/durations as numbers.

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

/** A cost value; `null`/`undefined` → em dash (unpriced, never $0). */
export function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return usd.format(value);
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const plain = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return value >= 10_000 ? compact.format(value) : plain.format(value);
}

export function formatTokens(value: number): string {
  return compact.format(value);
}

/** Tokens/sec; `null`/`undefined` → em dash (no measurable rate). */
export function formatTps(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 1000 ? compact.format(value) : Math.round(value)} tok/s`;
}

/** Milliseconds → human duration (µs/ms/s/m/h/d). */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  // Exact zero reads as "0s" (not "0µs") everywhere — e.g. latency axes anchored
  // at the origin.
  if (ms === 0) return "0s";
  if (ms < 1) return `${Math.round(ms * 1000)}µs`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  // Beyond a minute, build from the largest non-zero unit and show at most two
  // components so e.g. an even hour reads "1h", not "60m 0s".
  const totalSec = Math.round(ms / 1000);
  const d = Math.floor(totalSec / 86_400);
  const h = Math.floor((totalSec % 86_400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.slice(0, 2).join(" ") || "0s";
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return "—";
  return `${Math.round(fraction * 100)}%`;
}

/** ClickHouse DateTime strings ('YYYY-MM-DD HH:MM:SS', UTC) or ISO → local. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // Always 24-hour, regardless of the viewer's locale default.
    hour12: false,
  });
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(`${value.replace(" ", "T")}Z`);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return String(value);
  // Clamp clock skew: a server timestamp slightly ahead of the client must not
  // render as "-3s ago".
  const sec = Math.max(0, Math.round(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export type Delta = { pct: number; dir: "up" | "down" | "flat" };

/**
 * Period-over-period change as a fraction + direction. `null` when there's no
 * baseline to compare against (previous is null/zero) — the caller renders "—".
 */
export function formatDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): Delta | null {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined || previous === 0) return null;
  const pct = (current - previous) / previous;
  const dir = Math.abs(pct) < 0.0001 ? "flat" : pct > 0 ? "up" : "down";
  return { pct, dir };
}

/** Extrapolate a window's cost to a 30-day run-rate. `null` when cost is unknown. */
export function projectMonthlyCost(
  cost: number | null | undefined,
  windowMs: number,
): number | null {
  if (cost === null || cost === undefined || windowMs <= 0) return null;
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  return (cost / windowMs) * THIRTY_DAYS;
}
