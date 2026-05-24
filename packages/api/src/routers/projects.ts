import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { listAccessibleProjects } from "../services/access";
import {
  createApiKey,
  createProject,
  listApiKeys,
  revokeApiKey,
} from "../services/projects";

export const projectsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    listAccessibleProjects(ctx.db, ctx.session.user.id),
  ),

  create: protectedProcedure
    .input(z.object({ orgId: z.string(), name: z.string().min(1).max(100) }))
    .mutation(({ ctx, input }) =>
      createProject(ctx.db, ctx.session.user.id, input),
    ),

  keys: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.string() }))
      .query(({ ctx, input }) =>
        listApiKeys(ctx.db, ctx.session.user.id, input.projectId),
      ),

    create: protectedProcedure
      .input(
        z.object({ projectId: z.string(), name: z.string().min(1).max(100) }),
      )
      .mutation(({ ctx, input }) =>
        createApiKey(ctx.db, ctx.session.user.id, input),
      ),

    revoke: protectedProcedure
      .input(z.object({ projectId: z.string(), keyId: z.string() }))
      .mutation(({ ctx, input }) =>
        revokeApiKey(ctx.db, ctx.session.user.id, input),
      ),
  }),
});
