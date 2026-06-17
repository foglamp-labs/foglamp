import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  createEval,
  deleteEval,
  getEvalScore,
  getEvalTimeseries,
  getTraceScores,
  listEvals,
  listPresets,
  listRecentScores,
  updateEval,
} from "../services/evals";

const providerEnum = z.enum(["google", "openai", "anthropic"]);
const levelEnum = z.enum(["trace", "span"]);

const filtersSchema = z
  .object({
    agentName: z.string().optional(),
    workflowName: z.string().optional(),
    traceName: z.string().optional(),
    modelId: z.string().optional(),
    spanType: z.string().optional(),
    status: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .optional();

const modelSchema = z.object({ provider: providerEnum, modelId: z.string().min(1) });
const configSchema = z
  .object({
    promptOverride: z.string().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    contextSpec: z.record(z.string(), z.unknown()).optional(),
  })
  .optional();

export const evalsRouter = router({
  presets: protectedProcedure.query(() => listPresets()),

  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }),
    )
    .query(({ ctx, input }) =>
      listEvals(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(200),
        presetId: z.string(),
        targetLevel: levelEnum,
        filters: filtersSchema,
        sampleRate: z.number().min(0).max(1).optional(),
        model: modelSchema.optional(),
        config: configSchema,
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => createEval(ctx.db, ctx.session.user.id, input)),

  update: protectedProcedure
    .input(
      z.object({
        evalId: z.string(),
        name: z.string().min(1).max(200).optional(),
        targetLevel: levelEnum.optional(),
        filters: filtersSchema,
        sampleRate: z.number().min(0).max(1).optional(),
        model: modelSchema.optional(),
        config: configSchema,
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => updateEval(ctx.db, ctx.session.user.id, input)),

  delete: protectedProcedure
    .input(z.object({ evalId: z.string() }))
    .mutation(({ ctx, input }) => deleteEval(ctx.db, ctx.session.user.id, input)),

  timeseries: protectedProcedure
    .input(z.object({ evalId: z.string(), from: z.coerce.date(), to: z.coerce.date() }))
    .query(({ ctx, input }) =>
      getEvalTimeseries(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),

  recentScores: protectedProcedure
    .input(
      z.object({
        evalId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        sort: z
          .object({
            field: z.literal("score"),
            dir: z.enum(["asc", "desc"]),
          })
          .optional(),
      }),
    )
    .query(({ ctx, input }) =>
      listRecentScores(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),

  traceScores: protectedProcedure
    .input(z.object({ projectId: z.string(), traceId: z.string() }))
    .query(({ ctx, input }) =>
      getTraceScores(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),

  score: protectedProcedure
    .input(z.object({ evalId: z.string(), scoreId: z.string() }))
    .query(({ ctx, input }) =>
      getEvalScore(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),
});
