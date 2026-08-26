import { z } from "zod";
import {
  ALERT_COMPARISONS,
  CREATABLE_ALERT_METRICS,
} from "@foglamp/contracts/alerts";

import { protectedProcedure, router } from "../index";
import {
  createAlert,
  deleteAlert,
  getAlertHistory,
  listAlerts,
  updateAlert,
} from "../services/alerts";

const metricEnum = z.enum(CREATABLE_ALERT_METRICS);
const comparisonEnum = z.enum(ALERT_COMPARISONS);

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
        metric: metricEnum,
        evalId: z.string().optional(),
        filters: filtersSchema,
        windowSeconds: z.number().int().min(60).max(86_400),
        // Every metric is non-negative (cost, ms, counts, 0–1 rates), so a
        // negative threshold can only be a typo.
        threshold: z.number().finite().nonnegative(),
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
        automaticName: z.boolean().optional(),
        metric: metricEnum.optional(),
        evalId: z.string().nullable().optional(),
        filters: filtersSchema,
        windowSeconds: z.number().int().min(60).max(86_400).optional(),
        threshold: z.number().finite().nonnegative().optional(),
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
