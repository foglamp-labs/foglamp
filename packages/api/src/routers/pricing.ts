import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  createCustomPricing,
  deleteCustomPricing,
  listCustomPricing,
  updateCustomPricing,
} from "../services/pricing";

// Each dimension is a per-token price; `null` explicitly clears an override so
// the resolved OpenRouter price applies, `undefined` leaves it untouched.
const priceDim = z.number().nonnegative().nullable().optional();
const priceDims = {
  promptPrice: priceDim,
  completionPrice: priceDim,
  requestPrice: priceDim,
  imagePrice: priceDim,
  webSearchPrice: priceDim,
  internalReasoningPrice: priceDim,
  cacheReadPrice: priceDim,
  cacheWritePrice: priceDim,
};

export const pricingRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ ctx, input }) =>
      listCustomPricing(ctx.db, ctx.session.user.id, input.projectId),
    ),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        modelPattern: z.string().min(1).max(200),
        effectiveFrom: z.coerce.date().optional(),
        ...priceDims,
      }),
    )
    .mutation(({ ctx, input }) =>
      createCustomPricing(ctx.db, ctx.session.user.id, input),
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
        modelPattern: z.string().min(1).max(200).optional(),
        ...priceDims,
      }),
    )
    .mutation(({ ctx, input }) =>
      updateCustomPricing(ctx.db, ctx.session.user.id, input),
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(({ ctx, input }) =>
      deleteCustomPricing(ctx.db, ctx.session.user.id, input),
    ),
});
