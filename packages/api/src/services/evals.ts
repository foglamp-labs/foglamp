import { getOrgPlan } from "@foglamp/billing";
import {
  getEvalScore as chGetEvalScore,
  getTraceScores as chGetTraceScores,
  countEvalScores,
  DEFAULT_PASS_THRESHOLD,
  evalListSummary,
  type PassThresholds,
  getTraceRootInputs,
  listEvalScores,
  queryEvalCandidates,
  queryEvalTarget,
  queryScoreTimeseries,
  queryTraceSiblings,
  toClickHouseDateTime64,
} from "@foglamp/clickhouse";
import {
  type EvalConfig,
  type EvalFilters,
  type EvalModel,
  evalDefinition,
  evalState,
} from "@foglamp/db/schema/eval";
import { project } from "@foglamp/db/schema/project";
import { TRPCError } from "@trpc/server";
import { count, desc, eq } from "drizzle-orm";

import { env } from "@foglamp/env/server";

import { buildContext, type ContextSpec } from "../evals/context";
import { renderPrompt, splitTemplate, truncateExtracted } from "../evals/judge";
import { PRESETS, getPreset } from "../evals/presets";
import type { SiblingSpan } from "../evals/types";
import { skipReason } from "./scoringWorker";
import { userMessageSnippet } from "../lib/user-message";
import { decimalOrNull, num, toClickHouseDateTime } from "../lib/util";
import type { Ch, Db } from "../types";
import { requireProjectAccess } from "./access";
import { hashKey, promptVersionsForHashes } from "./promptVersions";

export type EvalInput = {
  projectId: string;
  name?: string;
  presetId: string;
  targetLevel: "trace" | "span";
  filters?: EvalFilters;
  sampleRate?: number;
  // Scored judges pass at score >= this (0..1). Ignored for code checks.
  passThreshold?: number;
  model?: EvalModel;
  config?: EvalConfig;
  enabled?: boolean;
};

/** Every eval's pass threshold in a project, for the project-wide score
 * queries that derive pass/fail at read time. */
export async function evalPassThresholds(
  db: Db,
  projectId: string,
): Promise<PassThresholds> {
  const rows = await db
    .select({
      id: evalDefinition.id,
      passThreshold: evalDefinition.passThreshold,
    })
    .from(evalDefinition)
    .where(eq(evalDefinition.projectId, projectId));
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.passThreshold)]));
}

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
      passThreshold: evalDefinition.passThreshold,
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
  // Definitions first: the rollup derives pass/fail from each eval's
  // threshold, so it needs them before it can run.
  const rows = await db
    .select({ ev: evalDefinition, st: evalState })
    .from(evalDefinition)
    .leftJoin(evalState, eq(evalState.evalId, evalDefinition.id))
    .where(eq(evalDefinition.projectId, input.projectId))
    .orderBy(desc(evalDefinition.createdAt));
  const summaryRows =
    input.from && input.to
      ? await evalListSummary(ch, {
          projectId: input.projectId,
          from: toClickHouseDateTime(input.from),
          to: toClickHouseDateTime(input.to),
          thresholds: Object.fromEntries(
            rows.map(({ ev }) => [ev.id, Number(ev.passThreshold)]),
          ),
        })
      : [];

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
      passThreshold: Number(ev.passThreshold),
      model: ev.model ?? null,
      config: ev.config ?? null,
      enabled: ev.enabled,
      status: st?.status ?? "ok",
      lastScoredAt: st?.lastScoredAt ?? null,
      lastError: st?.lastError ?? null,
      createdAt: ev.createdAt,
      // Windowed score metrics (0 / null when the eval didn't score in range).
      scoreCount,
      // Rate over rows with a verdict (stored, or derived from the score via
      // the eval's threshold); null when nothing gradable scored in range.
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
        passThreshold: String(input.passThreshold ?? DEFAULT_PASS_THRESHOLD),
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
      ...(input.passThreshold !== undefined
        ? { passThreshold: String(input.passThreshold) }
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
    threshold: Number(ev.passThreshold),
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
      // Rows with a verdict (stored or derived from the score) — the passRate
      // denominator, for the same reason.
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
      threshold: Number(ev.passThreshold),
    }),
    countEvalScores(ch, {
      projectId: ev.projectId,
      evalId: input.evalId,
      from,
      to,
    }),
  ]);
  const runs = await scoredRuns(db, ch, ev.projectId, rows.map((r) => r.trace_id));
  return {
    scores: rows.map((r) => ({ ...mapScore(r), ...runOf(runs, r.trace_id) })),
    total,
  };
}

type ScoredRun = {
  /** Headline: the run's user message (same snippet the traces list leads with). */
  userMessage: string | null;
  agentName: string | null;
  /** Which inferred prompt version the run used; null until the prompt job
   * has folded it, or when no system prompt was recorded. */
  promptVersion: { id: string; number: number } | null;
};

const NO_RUN: ScoredRun = { userMessage: null, agentName: null, promptVersion: null };

function runOf(runs: Map<string, ScoredRun>, traceId: string): ScoredRun {
  return runs.get(traceId) ?? NO_RUN;
}

/** Per-trace context for a page of scores: headline snippet and prompt version. */
async function scoredRuns(
  db: Db,
  ch: Ch,
  projectId: string,
  traceIds: string[],
): Promise<Map<string, ScoredRun>> {
  const roots = await getTraceRootInputs(ch, {
    projectId,
    traceIds: [...new Set(traceIds)],
  });
  const versions = await promptVersionsForHashes(db, {
    projectId,
    pairs: roots
      .filter((r) => r.agent_name && r.prompt_hash)
      .map((r) => ({ agentName: r.agent_name, hash: r.prompt_hash })),
  });
  return new Map(
    roots.map((r) => [
      r.trace_id,
      {
        userMessage: userMessageSnippet(r.input, USER_MESSAGE_SNIPPET_CAP),
        agentName: r.agent_name || null,
        promptVersion: versions.get(hashKey(r.agent_name, r.prompt_hash)) ?? null,
      },
    ]),
  );
}

/** Scores for a single trace and its spans — for the trace detail view. */
export async function getTraceScores(
  db: Db,
  ch: Ch,
  userId: string,
  input: { projectId: string; traceId: string },
) {
  await requireProjectAccess(db, userId, input.projectId);
  const rows = await chGetTraceScores(ch, {
    ...input,
    thresholds: await evalPassThresholds(db, input.projectId),
  });
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
    threshold: Number(ev.passThreshold),
  });
  if (!row) return null;
  const runs = await scoredRuns(db, ch, ev.projectId, [row.trace_id]);
  return { ...mapScore(row), ...runOf(runs, row.trace_id) };
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

/**
 * Rebuild exactly what the judge was sent for one score row: the extracted
 * fields and the rendered prompt (same extraction + template + truncation the
 * worker used). Reconstructed from the trace rather than stored, so it drifts
 * only if the eval's prompt was edited after the run.
 */
export async function getJudgeInput(
  db: Db,
  ch: Ch,
  userId: string,
  input: { evalId: string; scoreId: string },
) {
  const ev = await requireEvalAccess(db, userId, input.evalId);
  const full = await db.query.evalDefinition.findFirst({
    where: eq(evalDefinition.id, input.evalId),
  });
  const preset = getPreset(ev.presetId);
  if (!full || !preset) return null;
  const score = await chGetEvalScore(ch, {
    projectId: ev.projectId,
    evalId: input.evalId,
    scoreId: input.scoreId,
    threshold: Number(ev.passThreshold),
  });
  if (!score) return null;
  const level = score.target_type === "span" ? "span" : "trace";
  const row = await queryEvalTarget(ch, {
    projectId: ev.projectId,
    level,
    traceId: score.trace_id,
    targetId: score.target_id,
  });
  if (!row) return null;

  let siblings: SiblingSpan[] = [];
  if (preset.needsContext || preset.needsTools) {
    siblings = toSiblings(
      await queryTraceSiblings(ch, {
        projectId: ev.projectId,
        traceId: score.trace_id,
      }),
    );
  }
  const config = (full.config ?? {}) as EvalConfig;
  const extracted = buildContext(
    {
      level,
      targetId: row.target_id,
      traceId: row.trace_id,
      spanType: row.span_type,
      startTimeMs: row.start_time_ms,
      input: row.input,
      output: row.output,
      metadata: row.metadata ?? {},
      siblings,
    },
    preset,
    (config.contextSpec ?? {}) as ContextSpec,
  );
  const { extracted: bounded, truncated } = truncateExtracted(
    extracted,
    env.EVAL_JUDGE_MAX_INPUT_CHARS,
  );
  const template =
    config.promptOverride?.trim() || preset.prompt || "{output}";
  return {
    preset: { id: preset.id, name: preset.name },
    prompt: preset.source === "llm" ? renderPrompt(template, bounded) : null,
    segments: splitTemplate(template),
    fields: bounded,
    truncated,
    skipped: skipReason(preset, extracted),
  };
}
