import { getOrgPlan } from "@foglamp/billing";
import {
  getTraceScores as chGetTraceScores,
  countEvalScores,
  evalListSummary,
  getEvalScore as chGetEvalScore,
  listEvalScores,
  queryScoreTimeseries,
} from "@foglamp/clickhouse";
import { TRPCError } from "@trpc/server";
import {
  evalDefinition,
  evalState,
  type EvalConfig,
  type EvalFilters,
  type EvalModel,
} from "@foglamp/db/schema/eval";
import { project } from "@foglamp/db/schema/project";
import { count, desc, eq } from "drizzle-orm";

import { decimalOrNull, num, toClickHouseDateTime } from "../lib/util";
import { getPreset, PRESETS } from "../evals/presets";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";

export type EvalInput = {
  projectId: string;
  name: string;
  presetId: string;
  targetLevel: "trace" | "span";
  filters?: EvalFilters;
  sampleRate?: number;
  model?: EvalModel;
  config?: EvalConfig;
  enabled?: boolean;
};

export async function requireEvalAccess(db: Db, userId: string, evalId: string) {
  const rows = await db
    .select({ id: evalDefinition.id, projectId: evalDefinition.projectId })
    .from(evalDefinition)
    .where(eq(evalDefinition.id, evalId))
    .limit(1);
  const ev = rows[0];
  if (!ev) throw new TRPCError({ code: "NOT_FOUND", message: "Eval not found" });
  await requireProjectAccess(db, userId, ev.projectId);
  return ev;
}

/** The static preset catalog — drives the create wizard. */
export function listPresets() {
  return PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    source: p.source,
    level: p.level,
    emitsScore: p.emitsScore,
    emitsPassed: p.emitsPassed,
    needsContext: p.needsContext ?? false,
    needsReference: p.needsReference ?? false,
    defaultModel: p.defaultModel ?? null,
    defaultParams: p.defaultParams ?? null,
    // The judge template, so the edit/create UI can prefill the prompt editor
    // with the preset default (null for code presets).
    prompt: p.prompt ?? null,
  }));
}

export async function listEvals(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; from?: Date; to?: Date },
) {
  await requireProjectAccess(db, userId, input.projectId);
  // Definitions (Postgres) + per-eval score rollups for the window (ClickHouse),
  // in parallel. The rollup feeds the list's scored/pass-rate/avg/spend columns
  // and stat strip — date-windowed, mirroring the single eval page's cards.
  const [rows, summaryRows] = await Promise.all([
    db
      .select({ ev: evalDefinition, st: evalState })
      .from(evalDefinition)
      .leftJoin(evalState, eq(evalState.evalId, evalDefinition.id))
      .where(eq(evalDefinition.projectId, input.projectId))
      .orderBy(desc(evalDefinition.createdAt)),
    input.from && input.to
      ? evalListSummary(ch, {
          projectId: input.projectId,
          from: toClickHouseDateTime(input.from),
          to: toClickHouseDateTime(input.to),
        })
      : Promise.resolve([]),
  ]);

  const byEval = new Map(summaryRows.map((s) => [s.eval_id, s]));

  return rows.map(({ ev, st }) => {
    const s = byEval.get(ev.id);
    const scoreCount = s ? num(s.score_count) : 0;
    const verdictCount = s ? num(s.verdict_count) : 0;
    const passCount = s ? num(s.pass_count) : 0;
    return {
      id: ev.id,
      name: ev.name,
      presetId: ev.presetId,
      scorerSource: ev.scorerSource,
      targetLevel: ev.targetLevel,
      filters: ev.filters ?? null,
      sampleRate: Number(ev.sampleRate),
      model: ev.model ?? null,
      config: ev.config ?? null,
      enabled: ev.enabled,
      status: st?.status ?? "ok",
      lastScoredAt: st?.lastScoredAt ?? null,
      lastError: st?.lastError ?? null,
      createdAt: ev.createdAt,
      // Windowed score metrics (0 / null when the eval didn't score in range).
      scoreCount,
      // Rate only over rows with a verdict; numeric-only judges (score, no
      // pass/fail) show "—" rather than a misleading 0%.
      passRate: verdictCount > 0 ? passCount / verdictCount : null,
      // Average only over non-null scores; null means "not scorable", not 0.
      avgScore:
        s && num(s.scored_count) > 0
          ? num(s.score_sum) / num(s.scored_count)
          : null,
      cost: s ? num(s.cost) : 0,
    };
  });
}

export async function createEval(db: Db, userId: string, input: EvalInput) {
  const proj = await requireProjectAccess(db, userId, input.projectId);

  // Plan limit: cap evals per org, counted across all its projects.
  const { limits } = await getOrgPlan(proj.orgId);
  if (limits.evals !== null) {
    const rows = await db
      .select({ n: count() })
      .from(evalDefinition)
      .innerJoin(project, eq(project.id, evalDefinition.projectId))
      .where(eq(project.orgId, proj.orgId));
    if ((rows[0]?.n ?? 0) >= limits.evals) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Your plan allows ${limits.evals} eval${limits.evals === 1 ? "" : "s"}. Upgrade to add more.`,
      });
    }
  }

  const preset = getPreset(input.presetId);
  if (!preset) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown preset" });
  }
  if (preset.source === "llm" && !input.model) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A judge model is required for this preset",
    });
  }
  const rows = await db
    .insert(evalDefinition)
    .values({
      projectId: input.projectId,
      name: input.name,
      presetId: input.presetId,
      scorerSource: preset.source,
      targetLevel: input.targetLevel,
      filters: input.filters,
      sampleRate: String(input.sampleRate ?? 0.1),
      model: preset.source === "llm" ? input.model : null,
      config: input.config,
      enabled: input.enabled ?? true,
    })
    .returning({ id: evalDefinition.id });
  const id = rows[0]!.id;
  // State row with watermark = now() → future-only scoring.
  await db.insert(evalState).values({ evalId: id, status: "ok" });
  return { id };
}

export async function updateEval(
  db: Db,
  userId: string,
  input: { evalId: string } & Partial<Omit<EvalInput, "projectId" | "presetId">>,
) {
  await requireEvalAccess(db, userId, input.evalId);
  await db
    .update(evalDefinition)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.targetLevel !== undefined ? { targetLevel: input.targetLevel } : {}),
      ...(input.filters !== undefined ? { filters: input.filters } : {}),
      ...(input.sampleRate !== undefined
        ? { sampleRate: String(input.sampleRate) }
        : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.config !== undefined ? { config: input.config } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    })
    .where(eq(evalDefinition.id, input.evalId));
  return { id: input.evalId };
}

export async function deleteEval(db: Db, userId: string, input: { evalId: string }) {
  await requireEvalAccess(db, userId, input.evalId);
  await db.delete(evalDefinition).where(eq(evalDefinition.id, input.evalId));
  return { id: input.evalId };
}

export async function getEvalTimeseries(
  db: Db,
  ch: Ch,
  userId: string,
  input: { evalId: string; from: Date; to: Date },
) {
  const ev = await requireEvalAccess(db, userId, input.evalId);
  const rows = await queryScoreTimeseries(ch, {
    projectId: ev.projectId,
    evalId: input.evalId,
    from: toClickHouseDateTime(input.from),
    to: toClickHouseDateTime(input.to),
  });
  return rows.map((r) => {
    const count = num(r.score_count);
    const scored = num(r.scored_count);
    const verdicts = num(r.verdict_count);
    return {
      bucket: r.bucket,
      scoreCount: count,
      // Rows with a non-null score — the avgScore denominator. Lets clients
      // re-aggregate avgScore across buckets without skew from unscored rows.
      scoredCount: scored,
      // Rows with a non-null verdict — the passRate denominator, for the same
      // reason (numeric-only judges emit score-only rows with no verdict).
      verdictCount: verdicts,
      passCount: num(r.pass_count),
      failCount: num(r.fail_count),
      avgScore: scored > 0 ? num(r.score_sum) / scored : null,
      passRate: verdicts > 0 ? num(r.pass_count) / verdicts : null,
      cost: decimalOrNull(r.cost),
      scoreQuantiles: r.score_quantiles ?? [0, 0, 0],
    };
  });
}

export async function listRecentScores(
  db: Db,
  ch: Ch,
  userId: string,
  input: {
    evalId: string;
    limit?: number;
    offset?: number;
    from?: Date;
    to?: Date;
    sort?: { field: "score"; dir: "asc" | "desc" };
  },
) {
  const ev = await requireEvalAccess(db, userId, input.evalId);
  const from = input.from ? toClickHouseDateTime(input.from) : undefined;
  const to = input.to ? toClickHouseDateTime(input.to) : undefined;
  const [rows, total] = await Promise.all([
    listEvalScores(ch, {
      projectId: ev.projectId,
      evalId: input.evalId,
      limit: input.limit,
      offset: input.offset,
      from,
      to,
      sort: input.sort,
    }),
    countEvalScores(ch, {
      projectId: ev.projectId,
      evalId: input.evalId,
      from,
      to,
    }),
  ]);
  return { scores: rows.map(mapScore), total };
}

/** Scores for a single trace and its spans — for the trace detail view. */
export async function getTraceScores(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; traceId: string },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await chGetTraceScores(ch, input);
  return rows.map(mapScore);
}

/** A single score by its id — backs the eval-page deep link so a targeted run
 * renders regardless of the active range or page. */
export async function getEvalScore(
  db: Db,
  ch: Ch,
  userId: string,
  input: { evalId: string; scoreId: string },
) {
  const ev = await requireEvalAccess(db, userId, input.evalId);
  const row = await chGetEvalScore(ch, {
    projectId: ev.projectId,
    evalId: input.evalId,
    scoreId: input.scoreId,
  });
  return row ? mapScore(row) : null;
}

function mapScore(s: {
  score_id: string;
  eval_id: string;
  target_type: string;
  target_id: string;
  trace_id: string;
  scorer: string;
  label: string;
  score: number | null;
  passed: number | null;
  reason: string;
  model_id: string;
  cost: string | null;
  scored_at: string;
}) {
  return {
    scoreId: s.score_id,
    evalId: s.eval_id,
    targetType: s.target_type,
    targetId: s.target_id,
    traceId: s.trace_id,
    scorer: s.scorer,
    label: s.label,
    score: s.score === null ? null : Number(s.score),
    passed: s.passed === null ? null : s.passed === 1,
    reason: s.reason,
    modelId: s.model_id || null,
    cost: decimalOrNull(s.cost),
    scoredAt: s.scored_at,
  };
}

