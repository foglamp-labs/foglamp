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
