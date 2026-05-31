import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  deleteProviderKey,
  listProviderKeys,
  upsertProviderKey,
} from "../services/providerKeys";

const providerEnum = z.enum(["google", "openai", "anthropic"]);

export const providerKeysRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ ctx, input }) =>
      listProviderKeys(ctx.db, ctx.session.user.id, input.projectId),
    ),

  upsert: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        provider: providerEnum,
        key: z.string().min(1),
        label: z.string().max(120).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      upsertProviderKey(ctx.db, ctx.session.user.id, input),
    ),

  delete: protectedProcedure
    .input(z.object({ projectId: z.string(), provider: providerEnum }))
    .mutation(({ ctx, input }) =>
      deleteProviderKey(ctx.db, ctx.session.user.id, input),
    ),
});
