import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
	TEST_EMAILS,
	TEST_KINDS,
	ingestTest,
	listEvalJobs,
	listPricing,
	sendTestEmail,
} from "../services/admin";

// Dev tools surfaced behind the (development-only) Admin tab. Procedures stay
// project-access-checked so they remain safe even if reached in production.
export const adminRouter = router({
	// Current in-process OpenRouter pricing table (what ingest prices against).
	pricing: protectedProcedure.query(() => listPricing()),

	// Eval scoring queue snapshot: per-status counts + recent eval_job rows,
	// scoped to the caller's organizations.
	evalJobs: protectedProcedure.query(({ ctx }) =>
		listEvalJobs(ctx.db, ctx.session.user.id),
	),

	// Synthesize + insert test spans for a project (populates the rollup MVs).
	ingestTest: protectedProcedure
		.input(z.object({ projectId: z.string(), kind: z.enum(TEST_KINDS) }))
		.mutation(({ ctx, input }) =>
			ingestTest(ctx.ch, ctx.db, ctx.session.user.id, input),
		),

	// Fire one of the platform's transactional emails with mocked data (dev only).
	sendTestEmail: protectedProcedure
		.input(z.object({ kind: z.enum(TEST_EMAILS), to: z.string().email() }))
		.mutation(({ input }) => sendTestEmail(input)),
});
