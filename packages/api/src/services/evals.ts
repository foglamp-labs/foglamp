import { getOrgPlan } from "@foglamp/billing";
import {
  getEvalScore as chGetEvalScore,
  getTraceScores as chGetTraceScores,
  countEvalScores,
  evalListSummary,
  getTraceRootInputs,
  listEvalScores,
  queryScoreTimeseries,
} from "@foglamp/clickhouse";
  queryEvalCandidates,
import {
  type EvalConfig,
  queryTraceSiblings,
  toClickHouseDateTime64,
  type EvalFilters,
  type EvalModel,
  evalDefinition,
  evalState,
} from "@foglamp/db/schema/eval";
import { project } from "@foglamp/db/schema/project";
import { TRPCError } from "@trpc/server";
import { count, desc, eq } from "drizzle-orm";

import { PRESETS, getPreset } from "../evals/presets";
import { userMessageSnippet } from "../lib/user-message";
import { decimalOrNull, num, toClickHouseDateTime } from "../lib/util";

import { buildContext, type ContextSpec } from "../evals/context";
import { renderPrompt, splitTemplate, truncateExtracted } from "../evals/judge";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";
import type { SiblingSpan } from "../evals/types";
import { skipReason } from "./scoringWorker";

export type EvalInput = {
  projectId: string;
  name?: string;
  presetId: string;
  targetLevel: "trace" | "span";
  filters?: EvalFilters;
  sampleRate?: number;
  model?: EvalModel;
  config?: EvalConfig;
  enabled?: boolean;
};

export async function requireEvalAccess(
  db: Db,
  userId: string,
  evalId: string,
) {
  const rows = await db
    .select({
      id: evalDefinition.id,
      projectId: evalDefinition.projectId,
      presetId: evalDefinition.presetId,
    })
    .from(evalDefinition)
    .where(eq(evalDefinition.id, evalId))
    .limit(1);
  const ev = rows[0];
  if (!ev)
    throw new TRPCError({ code: "NOT_FOUND", message: "Eval not found" });
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

// Mirrors alerts: the name is derived from the definition (preset + target +
// agent filter) so lists read uniformly. Users can rename after creation.
function generateEvalName(preset: { name: string }, input: EvalInput) {
  const parts = [
    preset.name,
    input.targetLevel === "span" ? "spans" : "traces",
  ];
  if (input.filters?.agentName) parts.push(input.filters.agentName);
  return parts.join(" · ");
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
  // Presets without a default template (the custom judge) must ship their own
  // prompt — otherwise the runner would silently score a bare "{output}".
  if (
    preset.source === "llm" &&
    !preset.prompt &&
    !input.config?.promptOverride?.trim()
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A judge prompt is required for this preset",
    });
  }
  // Definition + its 1:1 state row must land atomically — a crash between the
  // two inserts leaves a stateless eval the scoring planner can't pick up.
  const id = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(evalDefinition)
      .values({
        projectId: input.projectId,
        name: input.name?.trim() || generateEvalName(preset, input),
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
    const evalId = rows[0]!.id;
    // State row with watermark = now() → future-only scoring.
    await tx.insert(evalState).values({ evalId, status: "ok" });
    return evalId;
  });
  return { id };
}

export async function updateEval(
  db: Db,
  userId: string,
  input: { evalId: string } & Partial<
    Omit<EvalInput, "projectId" | "presetId">
  >,
) {
  const ev = await requireEvalAccess(db, userId, input.evalId);
  // Same rule as create: a prompt-less judge preset needs a custom prompt.
  if (input.config !== undefined) {
    const preset = getPreset(ev.presetId);
    if (
      preset?.source === "llm" &&
      !preset.prompt &&
      !input.config?.promptOverride?.trim()
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A judge prompt is required for this preset",
      });
    }
  }
  await db
    .update(evalDefinition)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.targetLevel !== undefined
        ? { targetLevel: input.targetLevel }
        : {}),
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

export async function deleteEval(
  db: Db,
  userId: string,
  input: { evalId: string },
) {
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

// Cap on the per-run headline snippet (matches the traces list).
const USER_MESSAGE_SNIPPET_CAP = 300;

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
  // Headline per run: the scored trace's user message (same snippet the
  // traces list leads with), so rows read as content rather than raw ids.
  const rootInputs = await getTraceRootInputs(ch, {
    projectId: ev.projectId,
    traceIds: [...new Set(rows.map((r) => r.trace_id))],
  });
  const snippetByTrace = new Map(
    rootInputs.map((r) => [
      r.trace_id,
      userMessageSnippet(r.input, USER_MESSAGE_SNIPPET_CAP),
    ]),
  );
  return {
    scores: rows.map((r) => ({
      ...mapScore(r),
      userMessage: snippetByTrace.get(r.trace_id) ?? null,
    })),
    total,
  };
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

// How far back the create-wizard preflight samples matching traffic.
const PREFLIGHT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const PREFLIGHT_SAMPLE = 100;

function toSiblings(
  rows: {
    span_id: string;
    span_type: string;
    output: string;
    start_time_ms: number;
    tool_catalog: string;
  }[],
): SiblingSpan[] {
  return rows.map((r) => ({
    spanId: r.span_id,
    spanType: r.span_type,
    output: r.output,
    startTimeMs: r.start_time_ms,
    toolCatalog: r.tool_catalog,
  }));
}

/**
 * Dry run for the create wizard: sample recent traffic that matches the
 * would-be eval and report how many targets the scorer could actually grade.
 * Surfaces "this judge will skip everything" (no reference in metadata, no
 * retrieved context, runs without output) before the eval exists.
 */
export async function preflightEval(
  db: Db,
  ch: Ch,
  userId: string,
  input: {
    projectId: string;
    presetId: string;
    targetLevel: "trace" | "span";
    filters?: EvalFilters;
    contextSpec?: ContextSpec;
  },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const preset = getPreset(input.presetId);
  if (!preset) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown preset" });
  }
  const filters = { ...(input.filters ?? {}) } as EvalFilters;
  if (preset.spanType && !filters.spanType) filters.spanType = preset.spanType;
  const now = Date.now();
  const candidates = await queryEvalCandidates(ch, {
    projectId: input.projectId,
    level: input.targetLevel,
    filters,
    since: toClickHouseDateTime64(now - PREFLIGHT_LOOKBACK_MS),
    until: toClickHouseDateTime64(now),
    sampleThousandths: 1000,
    limit: PREFLIGHT_SAMPLE,
  });

  const siblingCache = new Map<string, SiblingSpan[]>();
  const needsSiblings = preset.needsContext || preset.needsTools;
  const reasons = new Map<string, number>();
  for (const c of candidates) {
    let siblings: SiblingSpan[] = [];
    if (needsSiblings) {
      const cached = siblingCache.get(c.trace_id);
      if (cached) {
        siblings = cached;
      } else {
        siblings = toSiblings(
          await queryTraceSiblings(ch, {
            projectId: input.projectId,
            traceId: c.trace_id,
          }),
        );
        siblingCache.set(c.trace_id, siblings);
      }
    }
    const extracted = buildContext(
      {
        level: input.targetLevel,
        targetId: c.target_id,
        traceId: c.trace_id,
        spanType: c.span_type,
        startTimeMs: c.start_time_ms,
        input: c.input,
        output: c.output,
        metadata: c.metadata ?? {},
        siblings,
      },
      preset,
      input.contextSpec ?? {},
    );
    const skip = skipReason(preset, extracted);
    if (skip) reasons.set(skip, (reasons.get(skip) ?? 0) + 1);
  }
  const skipped = [...reasons.values()].reduce((a, b) => a + b, 0);
  return {
    sampled: candidates.length,
    gradable: candidates.length - skipped,
    // Most common skip reason first, so the wizard can lead with it.
    skips: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

