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
  evalState,
  providerCredential,
  type EvalConfig,
  type EvalFilters,
  type EvalModel,
} from "@foglamp/db/schema/eval";
import { env } from "@foglamp/env/server";
import { and, eq } from "drizzle-orm";

import { buildContext, type ContextSpec } from "../evals/context";
import { runCodeScorer } from "../evals/codeScorers";
import { runJudge } from "../evals/judge";
import { getPreset, type Preset } from "../evals/presets";
import { decryptSecret } from "../lib/crypto";
import type { Ch, Db, Log } from "../types";
import type { ScoringTarget, SiblingSpan } from "../evals/types";

// The scoring worker: the eval-side sibling of the alert evaluator. Each sweep
// finds new traces/spans matching each enabled eval (since its watermark),
// samples them, runs the code/judge scorer, writes scores, and advances the
// watermark. Out of band from ingest — never blocks span writes.

async function mapLimit<T, R>(
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

function toScore(passed: boolean | null): number | null {
  return passed === null ? null : passed ? 1 : 0;
}

export async function evaluateEvals(db: Db, ch: Ch, log: Log): Promise<void> {
  const evals = await db
    .select({ ev: evalDefinition, st: evalState })
    .from(evalDefinition)
    .leftJoin(evalState, eq(evalState.evalId, evalDefinition.id))
    .where(eq(evalDefinition.enabled, true));

  for (const { ev, st } of evals) {
    try {
      await scoreOneEval(db, ch, log, ev, st?.watermark ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("eval.sweep_failed", { evalId: ev.id, error: message });
      await db
        .insert(evalState)
        .values({ evalId: ev.id, status: "error", lastError: message })
        .onConflictDoUpdate({
          target: evalState.evalId,
          set: { status: "error", lastError: message },
        });
    }
  }
}

async function scoreOneEval(
  db: Db,
  ch: Ch,
  log: Log,
  ev: typeof evalDefinition.$inferSelect,
  watermark: Date | null,
): Promise<void> {
  const preset = getPreset(ev.presetId);
  if (!preset) throw new Error(`unknown preset: ${ev.presetId}`);

  // Resolve the BYOK judge key up front; pause (don't error) if it's missing.
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
    if (!cred) {
      await setState(db, ev.id, watermark, "paused_no_key", `no ${model.provider} key`);
      return;
    }
    apiKey = decryptSecret(cred);
  }

  const until = new Date(Date.now() - env.SCORING_SETTLE_MS);
  const since = watermark ?? until; // no state yet → start now (future-only)
  if (since >= until) {
    await setState(db, ev.id, until, "ok", null);
    return;
  }

  const filters = (ev.filters ?? {}) as EvalFilters;
  const sampleRate = Number(ev.sampleRate);
  const candidates = await queryEvalCandidates(ch, {
    projectId: ev.projectId,
    level: ev.targetLevel,
    filters,
    since: toClickHouseDateTime64(since.getTime()),
    until: toClickHouseDateTime64(until.getTime()),
    sampleThousandths: Math.max(0, Math.min(1000, Math.round(sampleRate * 1000))),
    limit: env.EVAL_SCORING_BATCH,
  });

  if (candidates.length > 0) {
    const config = (ev.config ?? {}) as EvalConfig;
    const contextSpec = (config.contextSpec ?? {}) as ContextSpec;
    const params = config.params ?? preset.defaultParams ?? {};
    const siblingCache = new Map<string, SiblingSpan[]>();
    const now = Date.now();

    const results = await mapLimit(
      candidates,
      env.EVAL_JUDGE_CONCURRENCY,
      async (c): Promise<ScoreRow | null> => {
        try {
          const target = await buildTarget(ch, ev, c, preset, siblingCache);
          const extracted = buildContext(target, preset, contextSpec);
          const { result, cost } =
            preset.source === "code"
              ? { result: runCodeScorer(preset.id, extracted, params), cost: null }
              : await runJudge({
                  provider: model!.provider,
                  apiKey: apiKey!,
                  modelId: model!.modelId,
                  preset,
                  extracted,
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
            reason: result.reason,
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

    await insertScores(ch, results.filter((r): r is ScoreRow => r !== null));
  }

  // Advance the watermark: to the last candidate's ingest time if we hit the
  // batch cap (more may remain), otherwise to the end of the scanned window.
  const capped = candidates.length === env.EVAL_SCORING_BATCH;
  const newWatermark =
    capped && candidates.length > 0
      ? new Date(candidates[candidates.length - 1]!.ingested_at + "Z")
      : until;
  await setState(db, ev.id, newWatermark, "ok", null);
  log.info("eval.scored", { evalId: ev.id, scored: candidates.length });
}

async function buildTarget(
  ch: Ch,
  ev: typeof evalDefinition.$inferSelect,
  c: EvalCandidateRow,
  preset: Preset,
  siblingCache: Map<string, SiblingSpan[]>,
): Promise<ScoringTarget> {
  let siblings: SiblingSpan[] = [];
  if (preset.needsContext) {
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
