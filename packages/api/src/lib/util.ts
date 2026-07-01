import { createHash, randomBytes } from "node:crypto";

// --- API keys --------------------------------------------------------------
// Format `fl_…`; only the sha256 hash is stored (must match the ingest resolver
// in apps/ingest/src/apiKey.ts). `keyPrefix` is a short non-secret fragment.

export function generateApiKey(): string {
  return `fl_${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function keyPrefix(key: string): string {
  return key.slice(0, 11);
}

// --- Slugs -----------------------------------------------------------------

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "project";
}

// --- ClickHouse datetime ---------------------------------------------------
// CH `DateTime` params want 'YYYY-MM-DD HH:MM:SS' in UTC.

export function toClickHouseDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Default a missing window to the last 24h, with `to` = now. */
export function resolveRange(from?: Date, to?: Date): { from: Date; to: Date } {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { from: start, to: end };
}

/** Bucket width (seconds) for ~50 points across the window, snapped to a
 * friendly interval (1m … 1d) so bucket edges land on round times. Keeps the
 * time-series charts readable instead of one noisy point per minute. */
export function pickBucketSec(windowMs: number): number {
  const target = windowMs / 1000 / 50;
  const steps = [
    60, 120, 300, 600, 900, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400,
  ];
  return steps.find((s) => s >= target) ?? 86_400;
}

// --- Numeric coercion ------------------------------------------------------
// ClickHouse returns UInt64/Decimal as strings in JSONEachRow. Parse for DTOs;
// display precision is sufficient for the dashboard.

export function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** A cost-like decimal string → number, or null when unpriced. */
export function decimalOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** p50/p95/p99 from a ClickHouse quantiles array (3 elements). */
export function quantiles(q: number[] | undefined) {
  return { p50: num(q?.[0]), p95: num(q?.[1]), p99: num(q?.[2]) };
}

/** Keep only finite numbers from an array (filters NaN/Infinity). */
export function finite(xs: number[] | undefined): number[] {
  return (xs ?? []).map(Number).filter(Number.isFinite);
}

/** Format a Date as 'YYYY-MM-DD' (UTC). */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Map `fn` over `items` with at most `limit` in flight, preserving order.
 * Used by the cron sweeps to run per-rule / per-org work concurrently instead
 * of serially, without unbounded fan-out against ClickHouse.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
  return out;
}
