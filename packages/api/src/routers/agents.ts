import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { resolveRange } from "../lib/util";
import {
  getAgentDetail,
  getAgentList,
  getAgentNames,
} from "../services/agents";

export const agentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        // Filters.
        agentName: z.string().optional(),
        errorsOnly: z.boolean().optional(),
        sort: z
          .object({
            field: z.enum([
              "name",
              "spans",
              "llm",
              "tokens",
              "latency",
              "errors",
              "cost",
            ]),
            dir: z.enum(["asc", "desc"]),
          })
          .optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const { from, to } = resolveRange(input.from, input.to);
      return getAgentList(ctx.db, ctx.ch, ctx.session.user.id, {
        ...input,
        from,
        to,
      });
    }),

  // Distinct agent names in a window — for the agent-filter dropdowns.
  names: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const { from, to } = resolveRange(input.from, input.to);
      return getAgentNames(ctx.db, ctx.ch, ctx.session.user.id, {
        projectId: input.projectId,
        from,
        to,
      });
    }),

  get: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        agentName: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }),
    )
    .query(({ ctx, input }) => {
      const { from, to } = resolveRange(input.from, input.to);
      return getAgentDetail(ctx.db, ctx.ch, ctx.session.user.id, {
        projectId: input.projectId,
        agentName: input.agentName,
        from,
        to,
      });
    }),
});
