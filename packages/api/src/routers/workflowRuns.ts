import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  getWorkflowRunDetail,
  getWorkflowRunList,
  renameWorkflowRun,
} from "../services/workflowRuns";

export const workflowRunsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      getWorkflowRunList(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),

  get: protectedProcedure
    .input(z.object({ projectId: z.string(), workflowRunId: z.string() }))
    .query(({ ctx, input }) =>
      getWorkflowRunDetail(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),

  rename: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        workflowRunId: z.string(),
        name: z.string().min(1).max(200),
      }),
    )
    .mutation(({ ctx, input }) =>
      renameWorkflowRun(ctx.db, ctx.session.user.id, input),
    ),
});
