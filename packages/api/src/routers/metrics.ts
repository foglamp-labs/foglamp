import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { resolveRange } from "../lib/util";
import {
  getCostTimeseriesByModel,
  getModelBreakdown,
  getSummary,
  getTimeseries,
} from "../services/metrics";

const rangeInput = z.object({
  projectId: z.string(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const metricsRouter = router({
  summary: protectedProcedure.input(rangeInput).query(({ ctx, input }) => {
    const { from, to } = resolveRange(input.from, input.to);
    return getSummary(ctx.db, ctx.ch, ctx.session.user.id, {
      projectId: input.projectId,
      from,
      to,
    });
  }),

  timeseries: protectedProcedure
    .input(
      rangeInput.extend({
        spanType: z.string().optional(),
        modelId: z.string().optional(),
        agentName: z.string().optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const { from, to } = resolveRange(input.from, input.to);
      return getTimeseries(ctx.db, ctx.ch, ctx.session.user.id, {
        projectId: input.projectId,
        from,
        to,
        spanType: input.spanType,
        modelId: input.modelId,
        agentName: input.agentName,
      });
    }),

  models: protectedProcedure.input(rangeInput).query(({ ctx, input }) => {
    const { from, to } = resolveRange(input.from, input.to);
    return getModelBreakdown(ctx.db, ctx.ch, ctx.session.user.id, {
      projectId: input.projectId,
      from,
      to,
    });
  }),

  costByModel: protectedProcedure.input(rangeInput).query(({ ctx, input }) => {
    const { from, to } = resolveRange(input.from, input.to);
    return getCostTimeseriesByModel(ctx.db, ctx.ch, ctx.session.user.id, {
      projectId: input.projectId,
      from,
      to,
    });
  }),

});
