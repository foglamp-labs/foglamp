import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { resolveRange } from "../lib/util";
import {
	getWorkflowRunDetail,
	getWorkflowRunList,
	getWorkflowRunSummary,
	getWorkflowRunTimeseries,
} from "../services/workflowRuns";

const runSort = z
	.object({
		field: z.enum(["when", "duration", "traces", "errors", "cost"]),
		dir: z.enum(["asc", "desc"]),
	})
	.optional();

export const workflowRunsRouter = router({
	list: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				// Empty string selects the "Ungrouped" bucket; omit for all runs.
				workflowName: z.string().optional(),
				from: z.coerce.date().optional(),
				to: z.coerce.date().optional(),
				errorsOnly: z.boolean().optional(),
				sort: runSort,
				limit: z.number().int().min(1).max(200).optional(),
				offset: z.number().int().min(0).optional(),
			}),
		)
		.query(({ ctx, input }) => {
			const { from, to } = resolveRange(input.from, input.to);
			return getWorkflowRunList(ctx.db, ctx.ch, ctx.session.user.id, {
				...input,
				from,
				to,
			});
		}),

	summary: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				workflowName: z.string().optional(),
				from: z.coerce.date().optional(),
				to: z.coerce.date().optional(),
				errorsOnly: z.boolean().optional(),
			}),
		)
		.query(({ ctx, input }) => {
			const { from, to } = resolveRange(input.from, input.to);
			return getWorkflowRunSummary(ctx.db, ctx.ch, ctx.session.user.id, {
				...input,
				from,
				to,
			});
		}),

	timeseries: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				workflowName: z.string().optional(),
				from: z.coerce.date(),
				to: z.coerce.date(),
				errorsOnly: z.boolean().optional(),
			}),
		)
		.query(({ ctx, input }) =>
			getWorkflowRunTimeseries(ctx.db, ctx.ch, ctx.session.user.id, input),
		),

	get: protectedProcedure
		.input(z.object({ projectId: z.string(), workflowRunId: z.string() }))
		.query(({ ctx, input }) =>
			getWorkflowRunDetail(ctx.db, ctx.ch, ctx.session.user.id, input),
		),
});
