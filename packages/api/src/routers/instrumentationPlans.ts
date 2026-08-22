import { PlanEdits } from "@foglamp/contracts/instrumentation";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
  approvePlan,
  effectiveStatus,
  getPlanForUser,
  rejectPlan,
  verifyFirstTrace,
} from "../services/instrumentationPlans";
import { claimScan, createOrUpdateScan } from "../services/scans";

// The browser half of the onboarding approval loop. The agent half is a set of
// API-key-authed REST routes in apps/server/src/instrumentation.ts — the two
// never share an auth path.
//
// Every procedure funnels through getPlanForUser, which calls
// requireProjectAccess: a plan belonging to another org is never returned.

export const instrumentationPlansRouter = router({
  /**
   * Everything the review page renders, in one call. It also runs the
   * first-trace check when the plan is waiting on one, so verification needs no
   * second round-trip and — importantly — no coupling from ingest back into
   * onboarding.
   */
  get: protectedProcedure
    .input(z.object({ planId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const plan = await getPlanForUser(ctx.db, ctx.session.user.id, input.planId);
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }

      const verification = await verifyFirstTrace(ctx.db, ctx.ch, plan);

      return {
        id: plan.id,
        projectId: plan.projectId,
        // `verifyFirstTrace` may have just advanced the plan, so trust its view
        // — then project expiry on top, so a plan the hourly sweep hasn't
        // reached yet still reads as expired to whoever is looking at it.
        status: effectiveStatus({
          status: verification.status,
          expiresAt: plan.expiresAt,
        }),
        detected: plan.detected,
        // The decisions that were actually agreed to (detected + user edits).
        // Post-approval surfaces render these, not the detected originals.
        approved: plan.approved,
        applied: plan.applied,
        failureStage: plan.failureStage,
        expiresAt: plan.expiresAt,
        createdAt: plan.createdAt,
        approvedAt: plan.approvedAt,
        appliedAt: plan.appliedAt,
        firstTraceId: verification.firstTraceId,
        verifiedAt: verification.verifiedAt,
        spanCount: verification.spanCount,
        secondsToFirstTrace: verification.secondsToFirstTrace,
      };
    }),

  approve: protectedProcedure
    // `edits` is the Stage 2 review surface: renames and source tweaks, merged
    // onto the DETECTED decisions server-side (see applyPlanEdits).
    .input(
      z.object({
        planId: z.string().min(1).max(64),
        edits: PlanEdits.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const res = await approvePlan(
        ctx.db,
        ctx.session.user.id,
        input.planId,
        input.edits
      );
      if (!res.ok) {
        if (res.reason === "invalid") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `These edits can't be applied: ${res.errors.join("; ")}`,
          });
        }
        throw new TRPCError({
          code: res.reason === "not_found" ? "NOT_FOUND" : "CONFLICT",
          message:
            res.reason === "not_found"
              ? "Plan not found"
              : "This plan can no longer be approved",
        });
      }
      return { status: res.row.status };
    }),

  /**
   * The explicit, opt-in public share (Stage 3, part 2). Publishes the agent's
   * after-scan — already a validated, sanitized `ScanData`, the exact contract
   * the anonymous /scan lead magnet uses, so nothing beyond structured
   * metadata can leave — as a public scan page. Re-sharing with the editToken
   * from a previous share updates the same slug instead of minting a new URL.
   */
  share: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1).max(64),
        editToken: z.string().min(1).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await getPlanForUser(
        ctx.db,
        ctx.session.user.id,
        input.planId
      );
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }
      if (!plan.applied) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "There's nothing to share until your agent applies the plan",
        });
      }
      const outcome = await createOrUpdateScan(ctx.db, {
        data: plan.applied.scan,
        editToken: input.editToken,
      });
      if (!outcome.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This map can't be shared: ${outcome.errors.join("; ")}`,
        });
      }
      // Claim it for the sharer right away: a map published from a signed-in
      // setup shouldn't self-destruct on the anonymous 90-day TTL. Best-effort
      // — the share itself already succeeded.
      await claimScan(ctx.db, {
        slug: outcome.result.slug,
        editToken: outcome.result.editToken,
        userId: ctx.session.user.id,
      });
      return {
        slug: outcome.result.slug,
        editToken: outcome.result.editToken,
        updated: outcome.result.updated,
      };
    }),

  reject: protectedProcedure
    .input(z.object({ planId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const res = await rejectPlan(ctx.db, ctx.session.user.id, input.planId);
      if (!res.ok) {
        throw new TRPCError({
          code: res.reason === "not_found" ? "NOT_FOUND" : "CONFLICT",
          message:
            res.reason === "not_found"
              ? "Plan not found"
              : "This plan can no longer be changed",
        });
      }
      return { status: res.row.status };
    }),
});
