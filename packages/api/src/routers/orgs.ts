import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { getOrgUsage } from "../services/orgs";

export const orgsRouter = router({
  usage: protectedProcedure
    .input(z.object({ orgId: z.string() }))
    .query(({ ctx, input }) =>
      getOrgUsage(ctx.db, ctx.ch, ctx.session.user.id, input),
    ),
});
