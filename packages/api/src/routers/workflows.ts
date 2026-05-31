import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { getWorkflowList } from "../services/workflowRuns";

// Workflows grouped by name (the Workflows grid). A single workflow's runs are
// read through `workflowRuns.list` with a `workflowName` filter; its node graph
// reuses `workflowRuns.get` on the selected run.
export const workflowsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      getWorkflowList(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),
});
