import { randomBytes } from "node:crypto";

import { type ScanData, validateScan } from "@foglamp/contracts/scan";
import { scan } from "@foglamp/db/schema/scan";
import { eq, lt, sql } from "drizzle-orm";

import { hashApiKey, slugify } from "../lib/util";
import type { Db } from "../types";

// Anonymous scans self-destruct after this long (no account to own them).
const SCAN_TTL_DAYS = 90;
const SLUG_SUFFIX_LEN = 6;
const SLUG_ATTEMPTS = 6;

/** Short, URL-safe, unguessable suffix appended to the human-readable slug. */
function randomSuffix(len = SLUG_SUFFIX_LEN): string {
  return randomBytes(16)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, len)
    .toLowerCase();
}

/** Raw edit token handed back to the creator; only its sha256 is stored. */
function generateEditToken(): string {
  return randomBytes(24).toString("base64url");
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

export interface CreateScanResult {
  slug: string;
  editToken: string;
  expiresAt: Date;
  updated: boolean;
}

export type CreateScanOutcome =
  | { ok: true; result: CreateScanResult }
  | { ok: false; errors: string[] };

/**
 * Create a new scan (allocating a unique `slugify(name)-<random>` slug), or —
 * if a valid `editToken` is supplied — update the existing scan it owns in
 * place (keeping the same slug/URL). Re-validates the payload server-side; never
 * trusts the client's copy.
 */
export async function createOrUpdateScan(
  db: Db,
  input: { data: unknown; editToken?: string | null },
): Promise<CreateScanOutcome> {
  const parsed = validateScan(input.data);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const data = parsed.data;
  const expiresAt = new Date(Date.now() + SCAN_TTL_DAYS * 86_400_000);

  // Update path: a holder of the raw edit token can refresh their scan. The
  // outgoing data is kept as previousData so the viewer can diff versions.
  if (input.editToken) {
    const hash = hashApiKey(input.editToken);
    const existing = await db
      .select({ slug: scan.slug, data: scan.data, claimedByUserId: scan.claimedByUserId })
      .from(scan)
      .where(eq(scan.editTokenHash, hash))
      .limit(1);
    if (existing[0]) {
      const claimed = existing[0].claimedByUserId !== null;
      await db
        .update(scan)
        .set({
          data,
          previousData: existing[0].data,
          // Claimed scans never expire; anonymous updates refresh the TTL.
          ...(claimed ? {} : { expiresAt }),
        })
        .where(eq(scan.editTokenHash, hash));
      return {
        ok: true,
        result: { slug: existing[0].slug, editToken: input.editToken, expiresAt, updated: true },
      };
    }
    // Token didn't match anything — fall through and mint a fresh scan.
  }

  const base = slugify(data.project.name);
  const editToken = generateEditToken();
  const editTokenHash = hashApiKey(editToken);
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = `${base}-${randomSuffix()}`;
    try {
      await db.insert(scan).values({ slug, data, editTokenHash, expiresAt });
      return { ok: true, result: { slug, editToken, expiresAt, updated: false } };
    } catch (err) {
      if (isUniqueViolation(err) && attempt < SLUG_ATTEMPTS - 1) continue;
      throw err;
    }
  }
  throw new Error("could not allocate a unique scan slug");
}

/** Fetch a scan's data by slug; null if missing or expired. Bumps view count. */
export async function getScanBySlug(db: Db, slug: string): Promise<ScanData | null> {
  const rows = await db
    .select({ data: scan.data, expiresAt: scan.expiresAt })
    .from(scan)
    .where(eq(scan.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  // Fire-and-forget view bump — never block or fail the read on it.
  void (async () => {
    try {
      await db
        .update(scan)
        .set({ viewCount: sql`${scan.viewCount} + 1` })
        .where(eq(scan.slug, slug));
    } catch {
      // best effort
    }
  })();

  return row.data;
}

/**
 * The scan's previous version (the data as it was before its last update);
 * null if the scan is missing/expired or has never been updated.
 */
export async function getPreviousScanBySlug(
  db: Db,
  slug: string,
): Promise<ScanData | null> {
  const rows = await db
    .select({ previousData: scan.previousData, expiresAt: scan.expiresAt })
    .from(scan)
    .where(eq(scan.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  return row.previousData;
}

export type ClaimScanOutcome =
  | { ok: true }
  | { ok: false; reason: "not_found" | "bad_token" };

/**
 * Claim a scan for a signed-in user: proves ownership via the raw edit token,
 * then records the user and clears the expiry so the scan no longer
 * self-destructs (the cleanup cron only sweeps rows with a past expiresAt).
 */
export async function claimScan(
  db: Db,
  input: { slug: string; editToken: string; userId: string },
): Promise<ClaimScanOutcome> {
  const rows = await db
    .select({ editTokenHash: scan.editTokenHash, expiresAt: scan.expiresAt })
    .from(scan)
    .where(eq(scan.slug, input.slug))
    .limit(1);
  const row = rows[0];
  if (!row || (row.expiresAt && row.expiresAt.getTime() < Date.now())) {
    return { ok: false, reason: "not_found" };
  }
  if (row.editTokenHash !== hashApiKey(input.editToken)) {
    return { ok: false, reason: "bad_token" };
  }
  await db
    .update(scan)
    .set({ claimedByUserId: input.userId, expiresAt: null })
    .where(eq(scan.slug, input.slug));
  return { ok: true };
}

/** Delete scans whose expiry has passed. Returns the number removed. */
export async function deleteExpiredScans(db: Db): Promise<number> {
  const removed = await db
    .delete(scan)
    .where(lt(scan.expiresAt, new Date()))
    .returning({ id: scan.id });
  return removed.length;
}
