import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { listAccessibleProjects } from "../services/access";
import {
  createApiKey,
  createProject,
  deleteProject,
  listApiKeys,
  revokeApiKey,
  updateProject,
} from "../services/projects";

// Accepts a bare hostname or a full URL; empty string clears it.
const urlField = z
  .string()
  .max(512)
  .transform((v) => v.trim())
  .optional();

export const projectsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    listAccessibleProjects(ctx.db, ctx.session.user.id),
  ),

  create: protectedProcedure
    .input(
      z.object({
        orgId: z.string(),
        name: z.string().min(1).max(100),
        url: urlField,
      }),
    )
    .mutation(({ ctx, input }) =>
      createProject(ctx.db, ctx.session.user.id, input),
    ),

  update: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1).max(100).optional(),
        url: urlField,
      }),
    )
    .mutation(({ ctx, input }) =>
      updateProject(ctx.db, ctx.session.user.id, input),
    ),

  delete: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(({ ctx, input }) =>
      deleteProject(ctx.db, ctx.ch, ctx.session.user.id, input),
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
