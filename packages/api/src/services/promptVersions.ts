import { queryPromptHashActivity } from "@foglamp/clickhouse";
import { promptHash, promptInferState, promptVersion } from "@foglamp/db/schema/prompt";
import { inferVersions, normalizePrompt } from "@foglamp/prompts";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { mapLimit, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db, Log } from "../types";
import { requireProjectAccess } from "./access";

// Prompt versions are inferred, not declared: the job below rolls every new
// (project, agent, prompt hash) ClickHouse has ingested since its watermark
// into `prompt_hash`, then re-runs inference for each touched agent and
// rewrites that agent's `prompt_version` rows. Version ids survive
// re-inference (matched by shared hashes) so links to a version keep working.

const STATE_ID = "global";
// Don't read spans newer than this, so late spans settle first.
const SETTLE_MS = 60_000;
// Max activity rows folded per tick; a backlog drains over several ticks.
const ACTIVITY_LIMIT = 20_000;
// Most an agent's inference reads. Prompts with unnormalized dynamic content
// can spawn thousands of hashes; the newest ones are what a version needs.
const MAX_HASHES_PER_AGENT = 2000;
// Per-hash sample text kept for the template (Postgres, not the span store).
const SAMPLE_CHARS = 50_000;
const INFER_CONCURRENCY = 4;

/** One sweep: fold new prompt activity and re-infer touched agents. */
export async function syncPromptVersions(db: Db, ch: Ch, log: Log): Promise<void> {
  const until = new Date(Date.now() - SETTLE_MS);
  const since = await db.transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${`prompt_versions:${STATE_ID}`})) AS locked`,
    );
    if (!lock.rows[0]?.locked) return null;
    const state = await tx.query.promptInferState.findFirst({
      where: eq(promptInferState.id, STATE_ID),
    });
    if (state) return state.watermark;
    // First run: start from the beginning of time — the backfill drains over
    // successive ticks (bounded by ACTIVITY_LIMIT).
    const epoch = new Date(0);
    await tx.insert(promptInferState).values({ id: STATE_ID, watermark: epoch });
    return epoch;
  });
  if (since === null) {
    log.info("prompt.sync_skipped_concurrent");
    return;
  }
  if (since >= until) return;

  // Read the window; if it holds more distinct (project, agent, hash) rows
  // than one tick folds, halve it until it fits so nothing is skipped and no
  // row is folded twice (the fold adds run counts, so it must not repeat).
  let windowUntil = until;
  let activity = await queryPromptHashActivity(ch, {
    since: toClickHouseDateTime(since),
    until: toClickHouseDateTime(windowUntil),
    limit: ACTIVITY_LIMIT,
  });
  while (activity.length >= ACTIVITY_LIMIT) {
    const span = windowUntil.getTime() - since.getTime();
    if (span <= 60_000) {
      log.warn("prompt.sync_window_truncated", { since, until: windowUntil, rows: activity.length });
      break;
    }
    windowUntil = new Date(since.getTime() + Math.floor(span / 2));
    activity = await queryPromptHashActivity(ch, {
      since: toClickHouseDateTime(since),
      until: toClickHouseDateTime(windowUntil),
      limit: ACTIVITY_LIMIT,
    });
  }

  const touched = new Map<string, { projectId: string; agentName: string }>();
  await db.transaction(async (tx) => {
    for (const row of activity) {
      const runs = Number(row.runs) || 0;
      const firstSeen = fromClickHouse(row.first_seen);
      const lastSeen = fromClickHouse(row.last_seen);
      await tx
        .insert(promptHash)
        .values({
          projectId: row.project_id,
          agentName: row.agent_name,
          hash: row.prompt_hash,
          text: normalizePrompt(row.sample).slice(0, SAMPLE_CHARS),
          firstSeen,
          lastSeen,
          runCount: runs,
        })
        .onConflictDoUpdate({
          target: [promptHash.projectId, promptHash.agentName, promptHash.hash],
          set: {
            firstSeen: sql`LEAST(${promptHash.firstSeen}, EXCLUDED.first_seen)`,
            lastSeen: sql`GREATEST(${promptHash.lastSeen}, EXCLUDED.last_seen)`,
            runCount: sql`${promptHash.runCount} + EXCLUDED.run_count`,
          },
        });
      touched.set(`${row.project_id}\n${row.agent_name}`, {
        projectId: row.project_id,
        agentName: row.agent_name,
      });
    }
    await tx
      .update(promptInferState)
      .set({ watermark: windowUntil, lastError: null })
      .where(eq(promptInferState.id, STATE_ID));
  });

  await mapLimit([...touched.values()], INFER_CONCURRENCY, async (agent) => {
    try {
      await reinferAgent(db, agent.projectId, agent.agentName);
    } catch (err) {
      log.error("prompt.infer_failed", {
        projectId: agent.projectId,
        agentName: agent.agentName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
  if (touched.size > 0) {
    log.info("prompt.synced", { rows: activity.length, agents: touched.size });
  }
}

/**
 * Re-infer one agent's versions from its prompt_hash rows and reconcile with
 * the stored versions: an inferred version keeps the id of the stored version
 * it shares the most hashes with; the rest are inserted; stored versions
 * nothing maps to are deleted (their hashes' version_id nulls out).
 */
export async function reinferAgent(db: Db, projectId: string, agentName: string): Promise<void> {
  const hashes = await db.query.promptHash.findMany({
    where: and(eq(promptHash.projectId, projectId), eq(promptHash.agentName, agentName)),
    orderBy: [desc(promptHash.lastSeen)],
    limit: MAX_HASHES_PER_AGENT,
  });
  if (hashes.length === 0) return;
  const inferred = inferVersions(
    hashes.map((h) => ({
      hash: h.hash,
      text: h.text,
      firstSeen: h.firstSeen,
      lastSeen: h.lastSeen,
      runs: h.runCount,
    })),
  );

  await db.transaction(async (tx) => {
    // Serialize per agent so two ticks can't interleave their rewrites.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`prompt_agent:${projectId}:${agentName}`}))`,
    );
    const existing = await tx.query.promptVersion.findMany({
      where: and(eq(promptVersion.projectId, projectId), eq(promptVersion.agentName, agentName)),
    });
    const versionByHash = new Map(hashes.map((h) => [h.hash, h.versionId]));

    // Match inferred → existing by hash overlap: the pairs with the most
    // shared hashes claim first, each side at most once.
    const pairs: { i: number; id: string; overlap: number }[] = [];
    inferred.forEach((v, i) => {
      const overlap = new Map<string, number>();
      for (const h of v.hashes) {
        const id = versionByHash.get(h);
        if (id) overlap.set(id, (overlap.get(id) ?? 0) + 1);
      }
      for (const [id, n] of overlap) pairs.push({ i, id, overlap: n });
    });
    pairs.sort((a, b) => b.overlap - a.overlap);
    const claimed = new Set<string>();
    const ids: (string | null)[] = new Array(inferred.length).fill(null);
    for (const p of pairs) {
      if (ids[p.i] !== null || claimed.has(p.id)) continue;
      ids[p.i] = p.id;
      claimed.add(p.id);
    }

    // Numbers follow first appearance.
    const rows = inferred.map((v, i) => ({
      id: ids[i],
      number: i + 1,
      template: v.template,
      slotCount: v.slotCount,
      hashCount: v.hashes.length,
      runCount: v.runs,
      firstSeen: v.firstSeen,
      lastSeen: v.lastSeen,
      hashes: v.hashes,
    }));

    const stale = existing.filter((e) => !claimed.has(e.id)).map((e) => e.id);
    if (stale.length > 0) {
      await tx.delete(promptVersion).where(inArray(promptVersion.id, stale));
    }
    for (const row of rows) {
      let id = row.id;
      if (id) {
        await tx
          .update(promptVersion)
          .set({
            number: row.number,
            template: row.template,
            slotCount: row.slotCount,
            hashCount: row.hashCount,
            runCount: row.runCount,
            firstSeen: row.firstSeen,
            lastSeen: row.lastSeen,
          })
          .where(eq(promptVersion.id, id));
      } else {
        const inserted = await tx
          .insert(promptVersion)
          .values({
            projectId,
            agentName,
            number: row.number,
            template: row.template,
            slotCount: row.slotCount,
            hashCount: row.hashCount,
            runCount: row.runCount,
            firstSeen: row.firstSeen,
            lastSeen: row.lastSeen,
          })
          .returning({ id: promptVersion.id });
        id = inserted[0]?.id ?? null;
      }
      if (!id) continue;
      // Only rewrite hashes whose assignment changed.
      const moved = row.hashes.filter((h) => versionByHash.get(h) !== id);
      if (moved.length > 0) {
        await tx
          .update(promptHash)
          .set({ versionId: id })
          .where(
            and(
              eq(promptHash.projectId, projectId),
              eq(promptHash.agentName, agentName),
              inArray(promptHash.hash, moved),
            ),
          );
      }
    }
  });
}

/** An agent's inferred prompt versions, newest first, for the agent page. */
export async function listPromptVersions(
  db: Db,
  userId: string,
  input: { projectId: string; agentName: string },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const [versions, state] = await Promise.all([
    db.query.promptVersion.findMany({
      where: and(
        eq(promptVersion.projectId, input.projectId),
        eq(promptVersion.agentName, input.agentName),
      ),
      orderBy: [asc(promptVersion.number)],
    }),
    db.query.promptInferState.findFirst({ where: eq(promptInferState.id, STATE_ID) }),
  ]);
  // "Current" = the version with the most recent run. Several can be live at
  // once (a canary), so the flag is per version, not a single index.
  const latest = versions.reduce<number>((max, v) => Math.max(max, v.lastSeen.getTime()), 0);
  return {
    versions: versions.map((v) => ({
      id: v.id,
      number: v.number,
      template: v.template,
      slotCount: v.slotCount,
      hashCount: v.hashCount,
      runCount: v.runCount,
      firstSeen: v.firstSeen,
      lastSeen: v.lastSeen,
      current: v.lastSeen.getTime() === latest,
    })),
    // How far the job has read; runs newer than this aren't versioned yet.
    watermark: state?.watermark ?? null,
  };
}

/** The version a root span's prompt hash belongs to, if inferred yet. */
export async function promptVersionForHash(
  db: Db,
  input: { projectId: string; agentName: string; hash: string },
): Promise<{ id: string; number: number } | null> {
  const row = await db
    .select({ id: promptVersion.id, number: promptVersion.number })
    .from(promptHash)
    .innerJoin(promptVersion, eq(promptVersion.id, promptHash.versionId))
    .where(
      and(
        eq(promptHash.projectId, input.projectId),
        eq(promptHash.agentName, input.agentName),
        eq(promptHash.hash, input.hash),
      ),
    )
    .limit(1);
  return row[0] ?? null;
}

/**
 * The hashes behind a version, for filters that resolve a version to its
 * runs. `null` when the version doesn't exist (deleted by re-inference).
 */
export async function promptVersionHashes(
  db: Db,
  input: { projectId: string; versionId: string },
): Promise<{ agentName: string; hashes: string[] } | null> {
  const version = await db.query.promptVersion.findFirst({
    where: and(eq(promptVersion.id, input.versionId), eq(promptVersion.projectId, input.projectId)),
  });
  if (!version) return null;
  const rows = await db
    .select({ hash: promptHash.hash })
    .from(promptHash)
    .where(eq(promptHash.versionId, version.id));
  return { agentName: version.agentName, hashes: rows.map((r) => r.hash) };
}

/**
 * Versions for many (agent, prompt hash) pairs at once — one query for a page
 * of runs. Keyed by `hashKey`; pairs the job hasn't folded yet are absent.
 */
export async function promptVersionsForHashes(
  db: Db,
  input: { projectId: string; pairs: { agentName: string; hash: string }[] },
): Promise<Map<string, { id: string; number: number }>> {
  const out = new Map<string, { id: string; number: number }>();
  const hashes = [...new Set(input.pairs.map((p) => p.hash).filter(Boolean))];
  if (hashes.length === 0) return out;
  const rows = await db
    .select({
      agentName: promptHash.agentName,
      hash: promptHash.hash,
      id: promptVersion.id,
      number: promptVersion.number,
    })
    .from(promptHash)
    .innerJoin(promptVersion, eq(promptVersion.id, promptHash.versionId))
    .where(and(eq(promptHash.projectId, input.projectId), inArray(promptHash.hash, hashes)));
  for (const r of rows) out.set(hashKey(r.agentName, r.hash), { id: r.id, number: r.number });
  return out;
}

export function hashKey(agentName: string, hash: string): string {
  return `${agentName}\u0000${hash}`;
}

function fromClickHouse(s: string): Date {
  // ClickHouse returns "YYYY-MM-DD HH:MM:SS.mmm" in UTC.
  return new Date(`${s.replace(" ", "T")}Z`);
}
