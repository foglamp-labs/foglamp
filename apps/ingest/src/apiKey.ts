import { createHash } from "node:crypto";

import { db } from "@foglamp/db";
import { apiKey } from "@foglamp/db/schema/apiKey";
import { project } from "@foglamp/db/schema/project";
import { env } from "@foglamp/env/server";
import { eq } from "drizzle-orm";

// API-key resolution on the ingest hot path. Keys are `fl_…`; only their sha256
// hash is stored in Postgres, so we hash the presented key and look it up by
// `key_hash` (indexed). Results are cached in-memory with a short TTL to keep
// the common case off the database; revocation is honored within that TTL.
//
// This cache is per-instance (no Redis) — acceptable because it only adds up to
// `API_KEY_CACHE_TTL_MS` of staleness to a revoke, and the key store is small.

export type ResolvedKey = { apiKeyId: string; projectId: string; orgId: string };

type CacheEntry = { value: ResolvedKey | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();

// A miss (unknown/revoked key) is cached briefly so a flood of bad keys can't
// hammer Postgres, but not so long that a freshly-created key stays rejected.
const NEGATIVE_TTL_MS = 5_000;

// `last_used_at` is a stat, not correctness — write it at most this often per
// key, fire-and-forget, so heavy traffic doesn't generate an UPDATE per request.
const LAST_USED_THROTTLE_MS = 60_000;
const lastUsedWrites = new Map<string, number>();

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Resolve a presented API key to its project, or null if unknown/revoked. */
export async function resolveApiKey(key: string): Promise<ResolvedKey | null> {
  const hash = hashApiKey(key);
  const now = Date.now();

  const cached = cache.get(hash);
  if (cached && cached.expiresAt > now) {
    if (cached.value) void touchLastUsed(hash, now);
    return cached.value;
  }

  const rows = await db
    .select({
      id: apiKey.id,
      projectId: apiKey.projectId,
      orgId: project.orgId,
      revokedAt: apiKey.revokedAt,
    })
    .from(apiKey)
    .innerJoin(project, eq(project.id, apiKey.projectId))
    .where(eq(apiKey.keyHash, hash))
    .limit(1);

  const row = rows[0];
  const value: ResolvedKey | null =
    row && !row.revokedAt
      ? { apiKeyId: row.id, projectId: row.projectId, orgId: row.orgId }
      : null;

  cache.set(hash, {
    value,
    expiresAt: now + (value ? env.API_KEY_CACHE_TTL_MS : NEGATIVE_TTL_MS),
  });
  if (value) void touchLastUsed(hash, now);
  return value;
}

async function touchLastUsed(hash: string, now: number): Promise<void> {
  const last = lastUsedWrites.get(hash) ?? 0;
  if (now - last < LAST_USED_THROTTLE_MS) return;
  lastUsedWrites.set(hash, now);
  try {
    await db
      .update(apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKey.keyHash, hash));
  } catch {
    // Best-effort: ingest must never fail because a usage stat couldn't write.
  }
}
