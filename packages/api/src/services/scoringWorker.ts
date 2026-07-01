import {
  insertScores,
  queryEvalCandidates,
  queryTraceSiblings,
  toClickHouseDateTime64,
  type EvalCandidateRow,
  type ScoreRow,
} from "@foglamp/clickhouse";
import {
  evalDefinition,
  evalJob,
  evalState,
  providerCredential,
  type EvalConfig,
  type EvalFilters,
  type EvalModel,
} from "@foglamp/db/schema/eval";
import { env } from "@foglamp/env/server";
import { and, eq, lt, sql } from "drizzle-orm";

import { buildContext, type ContextSpec } from "../evals/context";
import { runCodeScorer } from "../evals/codeScorers";
import { runJudge } from "../evals/judge";
import { getPreset, type Preset } from "../evals/presets";
import { decryptSecret } from "../lib/crypto";
import { mapLimit } from "../lib/util";
import type { Ch, Db, Log } from "../types";
import type { ScoringTarget, SiblingSpan } from "../evals/types";

// The transaction handle drizzle hands to `db.transaction(async (tx) => …)`.
// Derived from Db so it tracks the schema without importing drizzle internals.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The scoring worker, split planner/executor around a durable `eval_job` queue:
//
//   planner  (evaluateEvals → planOneEval) — per enabled eval, claims the next
//            watermark window (advisory lock + CAS) and, when the window has
//            candidates, INSERTs an eval_job row in the same transaction. No
//            LLM calls; each plan tx is milliseconds.
//   executor (executeJobs) — leases pending (or lease-expired running) jobs
//            with FOR UPDATE SKIP LOCKED, re-queries the window's candidates
//            from ClickHouse, runs the code/judge scorer, writes scores, and
//            marks the job done — or pending again for retry, or dead after
//            max_attempts.
//
// The job row is the durable record of the claimed window: a crash after the
// watermark advances no longer silently skips the window (the job survives and
// is retried), and re-scoring a window is idempotent because scores collapse in
// ClickHouse (ReplacingMergeTree on score_id = eval_id:target_id).

function toScore(passed: boolean | null): number | null {
  return passed === null ? null : passed ? 1 : 0;
}

// How long an executor may hold a claimed job before another instance may
// reclaim it. Must comfortably exceed the slowest realistic batch (judge calls
// included) or two executors will score the same window concurrently — safe
// (idempotent) but double-billed.
const JOB_LEASE_MS = 10 * 60 * 1000;
const DONE_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Planner sweep: claim the next window for each enabled eval and enqueue jobs. */
export async function evaluateEvals(db: Db, ch: Ch, log: Log): Promise<void> {
  const evals = await db
    .select({ ev: evalDefinition, st: evalState })
    .from(evalDefinition)
    .leftJoin(evalState, eq(evalState.evalId, evalDefinition.id))
    .where(eq(evalDefinition.enabled, true));

  for (const { ev, st } of evals) {
    try {
      await planOneEval(db, ch, log, ev, st?.watermark ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("eval.plan_failed", { evalId: ev.id, error: message });
      await db
        .insert(evalState)
        .values({ evalId: ev.id, status: "error", lastError: message })
        .onConflictDoUpdate({
          target: evalState.evalId,
          set: { status: "error", lastError: message },
        });
    }
  }

  // Done jobs are kept a week for the admin observability page, then dropped.
  await db
    .delete(evalJob)
    .where(
      and(
        eq(evalJob.status, "done"),
        lt(evalJob.updatedAt, new Date(Date.now() - DONE_JOB_RETENTION_MS)),
      ),
    );
}

async function planOneEval(
  db: Db,
  ch: Ch,
  log: Log,
  ev: typeof evalDefinition.$inferSelect,
  watermark: Date | null,
): Promise<void> {
  const preset = getPreset(ev.presetId);
  if (!preset) throw new Error(`unknown preset: ${ev.presetId}`);

  // Check the BYOK judge key exists up front; pause (don't error) if missing.
  // The executor decrypts it at run time.
  const model = ev.model as EvalModel | null;
  if (preset.source === "llm") {
    if (!model) throw new Error("llm eval has no model configured");
    const cred = await db.query.providerCredential.findFirst({
      where: and(
        eq(providerCredential.projectId, ev.projectId),
        eq(providerCredential.provider, model.provider),
      ),
    });
    if (!cred) {
      await setState(db, ev.id, watermark, "paused_no_key", `no ${model.provider} key`);
      return;
    }
  }

  const until = new Date(Date.now() - env.SCORING_SETTLE_MS);
  const since = watermark ?? until; // no state yet → start now (future-only)
  if (since >= until) {
    await setState(db, ev.id, until, "ok", null);
    return;
  }

  const filters = { ...(ev.filters ?? {}) } as EvalFilters;
  // Scope tool presets to tool spans unless the eval set its own span-type
  // filter — otherwise they'd fire on every span (e.g. flagging an LLM span's
  // message-array input as "not a JSON object").
  if (preset.spanType && !filters.spanType) filters.spanType = preset.spanType;
  const sampleRate = Number(ev.sampleRate);

  // Claim the [since, newWatermark) window. The worker has no cross-process
  // lock — the `running` guard in scoringCron is per-process only — so multiple
  // instances (replicas, or dev hot-reloads each firing an immediate tick) read
  // the same watermark and would each plan the same window.
  //
  // Two layers, both inside one short Postgres transaction (no LLM calls here):
  //   1. A per-eval advisory lock (fast path). A concurrent sweep that can't grab
  //      it bails immediately — skipping even the candidate read. The lock is
  //      transaction-scoped so the pool can't unlock it on the wrong connection,
  //      and it auto-releases at commit.
  //   2. A compare-and-swap on the watermark (correctness). Even if two sweeps
  //      somehow both reach the CAS, only one advances the watermark and wins.
  // The eval_job INSERT rides the same transaction as the CAS, so a claimed
  // window and its job row are atomic: either both exist or neither does.
  const planned = await db.transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${ev.id})) AS locked`,
    );
    if (!lock.rows[0]?.locked) return null;

    const candidates = await queryEvalCandidates(ch, {
      projectId: ev.projectId,
      level: ev.targetLevel,
      filters,
      since: toClickHouseDateTime64(since.getTime()),
      until: toClickHouseDateTime64(until.getTime()),
      sampleThousandths: Math.max(0, Math.min(1000, Math.round(sampleRate * 1000))),
      limit: env.EVAL_SCORING_BATCH,
    });

    // When the batch is capped, trim trailing rows that share the last row's
    // ingested_at so we never end mid-millisecond: the watermark lands on a clean
    // boundary and strict `ingested_at > watermark` re-fetches the trimmed ties
    // next sweep — no skipped spans, no re-scored (re-judged) spans. If the whole
    // batch is one millisecond (pathological), score it all and advance past it.
    let batch = candidates;
    let newWatermark = until;
    if (candidates.length === env.EVAL_SCORING_BATCH) {
      const lastTs = candidates[candidates.length - 1]!.ingested_at;
      const trimmed = candidates.filter((c) => c.ingested_at !== lastTs);
      if (trimmed.length > 0) {
        batch = trimmed;
        newWatermark = new Date(trimmed[trimmed.length - 1]!.ingested_at + "Z");
      } else {
        newWatermark = new Date(lastTs + "Z");
      }
      // Degenerate guard: if the boundary rounds back to `since` (sub-ms
      // ingested_at truncation), force 1ms of progress or the planner would
      // re-read the identical batch every sweep forever.
      if (newWatermark.getTime() <= since.getTime()) {
        newWatermark = new Date(since.getTime() + 1);
      }
    }

    if (!(await claimScoringWindow(tx, ev.id, since, newWatermark))) return null;

    // Empty windows advance the watermark but enqueue nothing.
    if (batch.length > 0) {
      await tx.insert(evalJob).values({
        evalId: ev.id,
        windowStart: since,
        windowEnd: newWatermark,
      });
    }
    return { candidates: batch.length };
  });

  if (!planned) {
    log.info("eval.plan_skipped_concurrent", { evalId: ev.id, since });
    return;
  }
  if (planned.candidates > 0) {
    log.info("eval.planned", { evalId: ev.id, candidates: planned.candidates });
  }
}

// Shape of an eval_job row as returned by the raw claim query (snake_case).
type ClaimedJob = {
  id: string;
  eval_id: string;
  window_start: Date;
  window_end: Date;
  attempts: number;
  max_attempts: number;
};

/**
 * Executor sweep: lease up to EVAL_EXECUTOR_BATCH jobs and run them. Claims use
 * FOR UPDATE SKIP LOCKED so concurrent executors never grab the same row, and a
 * lease (`leased_until`) so a job whose executor crashed mid-run is reclaimed
 * after it expires instead of sticking in `running` forever.
 */
export async function executeJobs(db: Db, ch: Ch, log: Log): Promise<void> {
  const claimed = await db.execute<ClaimedJob>(sql`
    UPDATE eval_job SET
      status = 'running',
      attempts = attempts + 1,
      leased_until = now() + make_interval(secs => ${JOB_LEASE_MS / 1000}),
      updated_at = now()
    WHERE id IN (
      SELECT id FROM eval_job
      WHERE status = 'pending' OR (status = 'running' AND leased_until < now())
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${env.EVAL_EXECUTOR_BATCH}
    )
    RETURNING id, eval_id, window_start, window_end, attempts, max_attempts
  `);

  for (const job of claimed.rows) {
    // Every status write below is guarded by `attempts = job.attempts`: if this
    // executor outlived its lease and another instance reclaimed the job
    // (bumping attempts), the stale write no-ops instead of clobbering the
    // reclaiming worker's state.
    const stillOurs = and(
      eq(evalJob.id, job.id),
      eq(evalJob.attempts, job.attempts),
    );
    try {
      const scored = await executeOneJob(db, ch, log, job);
      await db
        .update(evalJob)
        .set({ status: "done", leasedUntil: null, lastError: null })
        .where(stillOurs);
      if (scored === null) {
        // Eval deleted/disabled mid-job: eval_state is cascade-deleted with the
        // eval, so writing it would hit an FK violation. Nothing to record.
        log.info("eval.job_skipped_gone", { evalId: job.eval_id, jobId: job.id });
        continue;
      }
      await setState(db, job.eval_id, null, "ok", null);
      log.info("eval.scored", { evalId: job.eval_id, jobId: job.id, scored });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const dead = job.attempts >= job.max_attempts;
      log.error("eval.job_failed", {
        evalId: job.eval_id,
        jobId: job.id,
        attempt: job.attempts,
        dead,
        error: message,
      });
      try {
        await db
          .update(evalJob)
          .set({
            status: dead ? "dead" : "pending",
            leasedUntil: null,
            lastError: message,
          })
          .where(stillOurs);
        if (dead) await setState(db, job.eval_id, null, "error", message);
      } catch (stateErr) {
        // e.g. the eval (and its cascade-deleted state row) vanished between
        // the failure and this write — never abort the remaining claimed jobs.
        log.error("eval.job_state_write_failed", {
          evalId: job.eval_id,
          jobId: job.id,
          error: stateErr instanceof Error ? stateErr.message : String(stateErr),
        });
      }
    }
  }
}

// Returns the number of scores written, or null when the eval was deleted or
// disabled since planning — the caller must then skip eval_state writes (the
// state row cascade-deletes with the eval).
async function executeOneJob(
  db: Db,
  ch: Ch,
  log: Log,
  job: ClaimedJob,
): Promise<number | null> {
  const ev = await db.query.evalDefinition.findFirst({
    where: eq(evalDefinition.id, job.eval_id),
  });
  // Eval deleted (FK would have cascaded) or disabled since planning — drop the
  // work, not an error.
  if (!ev || !ev.enabled) return null;

  const preset = getPreset(ev.presetId);
  if (!preset) throw new Error(`unknown preset: ${ev.presetId}`);

  let apiKey: string | null = null;
  const model = ev.model as EvalModel | null;
  if (preset.source === "llm") {
    if (!model) throw new Error("llm eval has no model configured");
    const cred = await db.query.providerCredential.findFirst({
      where: and(
        eq(providerCredential.projectId, ev.projectId),
        eq(providerCredential.provider, model.provider),
      ),
    });
    if (!cred) throw new Error(`no ${model.provider} key`);
    apiKey = decryptSecret(cred);
  }

  const filters = { ...(ev.filters ?? {}) } as EvalFilters;
  if (preset.spanType && !filters.spanType) filters.spanType = preset.spanType;
  const sampleRate = Number(ev.sampleRate);

  // Re-query the window's candidates rather than persisting them in the job:
  // the query is deterministic over an immutable (settled) window, and the row
  // stays small. Bounds are (window_start, window_end], matching the planner.
  const batch = await queryEvalCandidates(ch, {
    projectId: ev.projectId,
    level: ev.targetLevel,
    filters,
    since: toClickHouseDateTime64(new Date(job.window_start).getTime()),
    until: toClickHouseDateTime64(new Date(job.window_end).getTime()),
    sampleThousandths: Math.max(0, Math.min(1000, Math.round(sampleRate * 1000))),
    limit: env.EVAL_SCORING_BATCH,
  });
  if (batch.length === 0) return 0;

  const config = (ev.config ?? {}) as EvalConfig;
  const contextSpec = (config.contextSpec ?? {}) as ContextSpec;
  const params = config.params ?? preset.defaultParams ?? {};
  const siblingCache = new Map<string, SiblingSpan[]>();
  const now = Date.now();

  const results = await mapLimit(
    batch,
    env.EVAL_JUDGE_CONCURRENCY,
    async (c): Promise<ScoreRow | null> => {
      try {
        const target = await buildTarget(ch, ev, c, preset, siblingCache);
        const extracted = buildContext(target, preset, contextSpec);
        const { result, cost, truncated } =
          preset.source === "code"
            ? {
                result: runCodeScorer(preset.id, extracted, params),
                cost: null,
                truncated: false,
              }
            : await runJudge({
                provider: model!.provider,
                apiKey: apiKey!,
                modelId: model!.modelId,
                preset,
                extracted,
                maxInputChars: env.EVAL_JUDGE_MAX_INPUT_CHARS,
                promptOverride: config.promptOverride,
              });
        return {
          project_id: ev.projectId,
          eval_id: ev.id,
          score_id: `${ev.id}:${c.target_id}`,
          target_type: ev.targetLevel,
          target_id: c.target_id,
          trace_id: c.trace_id,
          scorer: preset.source,
          label: "",
          score: result.score,
          passed: toScore(result.passed),
          reason: truncated
            ? `[judged on truncated payload] ${result.reason}`
            : result.reason,
          model_id: preset.source === "llm" ? model!.modelId : "",
          cost,
          scored_at: now,
        };
      } catch (err) {
        log.error("eval.score_failed", {
          evalId: ev.id,
          targetId: c.target_id,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
  );

  const rows = results.filter((r): r is ScoreRow => r !== null);
  // If every target errored, surface it as a job failure so it retries instead
  // of silently marking the window done with zero scores.
  if (rows.length === 0) {
    throw new Error("all targets failed to score");
  }
  await insertScores(ch, rows);
  return rows.length;
}

async function buildTarget(
  ch: Ch,
  ev: typeof evalDefinition.$inferSelect,
  c: EvalCandidateRow,
  preset: Preset,
  siblingCache: Map<string, SiblingSpan[]>,
): Promise<ScoringTarget> {
  let siblings: SiblingSpan[] = [];
  if (preset.needsContext || preset.needsTools) {
    siblings = siblingCache.get(c.trace_id) ?? [];
    if (!siblingCache.has(c.trace_id)) {
      const rows = await queryTraceSiblings(ch, {
        projectId: ev.projectId,
        traceId: c.trace_id,
      });
      siblings = rows.map((r) => ({
        spanId: r.span_id,
        spanType: r.span_type,
        output: r.output,
        startTimeMs: r.start_time_ms,
        toolCatalog: r.tool_catalog,
      }));
      siblingCache.set(c.trace_id, siblings);
    }
  }
  return {
    level: ev.targetLevel,
    targetId: c.target_id,
    traceId: c.trace_id,
    spanType: c.span_type,
    startTimeMs: c.start_time_ms,
    input: c.input,
    output: c.output,
    metadata: c.metadata ?? {},
    siblings,
  };
}

/**
 * Atomically advance the watermark from its observed value (`since`) to
 * `newWatermark`, claiming the window for this sweep. Returns false when a
 * concurrent sweep already advanced it — the caller then skips planning. This
 * plus the advisory lock is the planner's cross-process mutual exclusion:
 * a single conditional UPDATE, serialized by Postgres row locking.
 *
 * The compare is `date_trunc('milliseconds', watermark) = since` rather than a
 * plain equality because `eval_state.watermark` defaults to `now()` (microsecond
 * precision) while every value we read/write round-trips through a JS `Date`
 * (millisecond precision). A raw `=` would never match a microsecond-tailed
 * default, silently wedging the eval so it never scores.
 */
async function claimScoringWindow(
  db: Db | Tx,
  evalId: string,
  since: Date,
  newWatermark: Date,
): Promise<boolean> {
  const claimed = await db
    .update(evalState)
    .set({
      watermark: newWatermark,
      status: "ok",
      lastError: null,
    })
    .where(
      and(
        eq(evalState.evalId, evalId),
        sql`date_trunc('milliseconds', ${evalState.watermark}) = ${since}`,
      ),
    )
    .returning({ evalId: evalState.evalId });
  return claimed.length > 0;
}

async function setState(
  db: Db,
  evalId: string,
  watermark: Date | null,
  status: "ok" | "paused_no_key" | "error",
  lastError: string | null,
): Promise<void> {
  const set = {
    status,
    lastError,
    ...(watermark ? { watermark } : {}),
    ...(status === "ok" ? { lastScoredAt: new Date() } : {}),
  };
  await db
    .insert(evalState)
    .values({ evalId, ...(watermark ? { watermark } : {}), status, lastError })
    .onConflictDoUpdate({ target: evalState.evalId, set });
}
