import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
	listDigestPreferences,
	setDigestPreference,
} from "../services/weeklyDigest";

export const notificationsRouter = router({
	// Every org the user belongs to with their effective weekly digest setting.
	list: protectedProcedure.query(({ ctx }) =>
		listDigestPreferences(ctx.db, ctx.session.user.id),
	),

	setWeeklyDigest: protectedProcedure
		.input(z.object({ orgId: z.string(), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const ok = await setDigestPreference(
				ctx.db,
				ctx.session.user.id,
				input.orgId,
				input.enabled,
			);
			if (!ok) throw new TRPCError({ code: "NOT_FOUND" });
			return { ok: true };
		}),
});
