import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  createAlert,
  deleteAlert,
  getAlertHistory,
  listAlerts,
  updateAlert,
} from "../services/alerts";

const metricEnum = z.enum([
  "cost",
  "latency_p50",
  "latency_p95",
  "latency_p99",
  "ttft_p95",
  "error_rate",
  "token_usage",
  "request_count",
  "eval_avg_score",
  "eval_pass_rate",
]);
const comparisonEnum = z.enum(["gt", "gte", "lt", "lte"]);

const filtersSchema = z
  .object({
    modelId: z.string().optional(),
    agentName: z.string().optional(),
    workflowName: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .optional();

const channelsSchema = z.array(
  z.object({ type: z.literal("email"), to: z.string().email() }),
);

export const alertsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ ctx, input }) =>
      listAlerts(ctx.db, ctx.session.user.id, input.projectId),
    ),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(200),
        metric: metricEnum,
        evalId: z.string().optional(),
        filters: filtersSchema,
        windowSeconds: z.number().int().min(60).max(86_400),
        threshold: z.number(),
        comparison: comparisonEnum,
        enabled: z.boolean().optional(),
        channels: channelsSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      createAlert(ctx.db, ctx.session.user.id, input),
    ),

  update: protectedProcedure
    .input(
      z.object({
        ruleId: z.string(),
        name: z.string().min(1).max(200).optional(),
        metric: metricEnum.optional(),
        evalId: z.string().optional(),
        filters: filtersSchema,
        windowSeconds: z.number().int().min(60).max(86_400).optional(),
        threshold: z.number().optional(),
        comparison: comparisonEnum.optional(),
        enabled: z.boolean().optional(),
        channels: channelsSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      updateAlert(ctx.db, ctx.session.user.id, input),
    ),

  delete: protectedProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(({ ctx, input }) =>
      deleteAlert(ctx.db, ctx.session.user.id, input),
    ),

  history: protectedProcedure
    .input(
      z.object({
        ruleId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      getAlertHistory(ctx.db, ctx.session.user.id, input),
    ),
});
