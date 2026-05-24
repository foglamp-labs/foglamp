import { createHash, randomBytes } from "node:crypto";

// --- API keys --------------------------------------------------------------
// Format `wt_…`; only the sha256 hash is stored (must match the ingest resolver
// in apps/ingest/src/apiKey.ts). `keyPrefix` is a short non-secret fragment.

export function generateApiKey(): string {
  return `wt_${randomBytes(32).toString("base64url")}`;
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
