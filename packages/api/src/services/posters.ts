import { randomBytes } from "node:crypto";

import { type PosterData, validatePoster } from "@foglamp/contracts/poster";
import { poster } from "@foglamp/db/schema/poster";
import { eq, lt, sql } from "drizzle-orm";

import { hashApiKey, slugify } from "../lib/util";
import type { Db } from "../types";

// Anonymous posters self-destruct after this long (no account to own them).
const POSTER_TTL_DAYS = 90;
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

export interface CreatePosterResult {
  slug: string;
  editToken: string;
  expiresAt: Date;
  updated: boolean;
}

export type CreatePosterOutcome =
  | { ok: true; result: CreatePosterResult }
  | { ok: false; errors: string[] };

/**
 * Create a new poster (allocating a unique `slugify(name)-<random>` slug), or —
 * if a valid `editToken` is supplied — update the existing poster it owns in
 * place (keeping the same slug/URL). Re-validates the payload server-side; never
 * trusts the client's copy.
 */
export async function createOrUpdatePoster(
  db: Db,
  input: { data: unknown; editToken?: string | null },
): Promise<CreatePosterOutcome> {
  const parsed = validatePoster(input.data);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const data = parsed.data;
  const expiresAt = new Date(Date.now() + POSTER_TTL_DAYS * 86_400_000);

  // Update path: a holder of the raw edit token can refresh their poster.
  if (input.editToken) {
    const hash = hashApiKey(input.editToken);
    const existing = await db
      .select({ slug: poster.slug })
      .from(poster)
      .where(eq(poster.editTokenHash, hash))
      .limit(1);
    if (existing[0]) {
      await db.update(poster).set({ data, expiresAt }).where(eq(poster.editTokenHash, hash));
      return {
        ok: true,
        result: { slug: existing[0].slug, editToken: input.editToken, expiresAt, updated: true },
      };
    }
    // Token didn't match anything — fall through and mint a fresh poster.
  }

  const base = slugify(data.project.name);
  const editToken = generateEditToken();
  const editTokenHash = hashApiKey(editToken);
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = `${base}-${randomSuffix()}`;
    try {
      await db.insert(poster).values({ slug, data, editTokenHash, expiresAt });
      return { ok: true, result: { slug, editToken, expiresAt, updated: false } };
    } catch (err) {
      if (isUniqueViolation(err) && attempt < SLUG_ATTEMPTS - 1) continue;
      throw err;
    }
  }
  throw new Error("could not allocate a unique poster slug");
}

/** Fetch a poster's data by slug; null if missing or expired. Bumps view count. */
export async function getPosterBySlug(db: Db, slug: string): Promise<PosterData | null> {
  const rows = await db
    .select({ data: poster.data, expiresAt: poster.expiresAt })
    .from(poster)
    .where(eq(poster.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  // Fire-and-forget view bump — never block or fail the read on it.
  void (async () => {
    try {
      await db
        .update(poster)
        .set({ viewCount: sql`${poster.viewCount} + 1` })
        .where(eq(poster.slug, slug));
    } catch {
      // best effort
    }
  })();

  return row.data;
}

/** Delete posters whose expiry has passed. Returns the number removed. */
export async function deleteExpiredPosters(db: Db): Promise<number> {
  const removed = await db
    .delete(poster)
    .where(lt(poster.expiresAt, new Date()))
    .returning({ id: poster.id });
  return removed.length;
}
