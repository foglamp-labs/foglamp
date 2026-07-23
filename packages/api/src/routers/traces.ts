import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { getTraceDetail, getTraceList } from "../services/traces";

export const tracesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        // Optional time window — omitted by the live feed (latest, unfiltered).
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        // Filters.
        agentName: z.string().optional(),
        traceName: z.string().optional(),
        workflowName: z.string().optional(),
        customerId: z.string().optional(),
        modelId: z.string().optional(),
        errorsOnly: z.boolean().optional(),
        sort: z
          .object({
            field: z.enum(["when", "cost", "duration", "tokens", "spans"]),
            dir: z.enum(["asc", "desc"]),
          })
          .optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      getTraceList(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),

  get: protectedProcedure
    .input(z.object({ projectId: z.string(), traceId: z.string() }))
    .query(({ ctx, input }) =>
      getTraceDetail(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),
});
