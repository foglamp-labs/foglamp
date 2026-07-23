import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { resolveRange } from "../lib/util";
import { getSessionDetail, getSessionList } from "../services/sessions";

export const sessionsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        // Filters.
        agentName: z.string().optional(),
        customerId: z.string().optional(),
        sessionId: z.string().optional(),
        errorsOnly: z.boolean().optional(),
        sort: z
          .object({
            field: z.enum(["last", "cost", "tokens", "turns"]),
            dir: z.enum(["asc", "desc"]),
          })
          .optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const { from, to } = resolveRange(input.from, input.to);
      return getSessionList(ctx.db, ctx.ch, ctx.session.user.id, {
        projectId: input.projectId,
        from,
        to,
        agentName: input.agentName,
        customerId: input.customerId,
        sessionId: input.sessionId,
        errorsOnly: input.errorsOnly,
        sort: input.sort,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  get: protectedProcedure
    .input(z.object({ projectId: z.string(), sessionId: z.string() }))
    .query(({ ctx, input }) =>
      getSessionDetail(ctx.db, ctx.ch, ctx.session.user.id, {
        projectId: input.projectId,
        sessionId: input.sessionId,
      }),
    ),
});
