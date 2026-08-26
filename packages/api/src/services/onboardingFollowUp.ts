import { sendOnboardingFollowUpEmail } from "@foglamp/auth/email";
import { hasOrgSpanUsage } from "@foglamp/clickhouse";
import { user } from "@foglamp/db/schema/auth";
import { onboardingEmail } from "@foglamp/db/schema/onboardingEmail";
import { and, eq, lt, lte, or } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { mapLimit } from "../lib/util";
import type { Ch, Db, Log } from "../types";

const BATCH_SIZE = 100;
const CONCURRENCY = 8;
const CLAIM_LEASE_MS = 15 * 60 * 1000;

type Candidate = {
  id: string;
  userId: string;
  orgId: string;
  milestoneDays: 1 | 3 | 7;
  email: string;
  name: string;
};

export type OnboardingFollowUpResult = {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
};

function claimable(now: Date) {
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
  return or(
    eq(onboardingEmail.status, "pending"),
    and(
      eq(onboardingEmail.status, "claimed"),
      lt(onboardingEmail.claimedAt, staleBefore),
    ),
  );
}

/**
 * Send due personal onboarding notes. Every row is claimed in Postgres before
 * external work, and Resend receives a deterministic idempotency key so a
 * process crash between delivery and acknowledgement does not duplicate mail.
 */
export async function evaluateOnboardingFollowUps(
  db: Db,
  ch: Ch,
  log: Log,
  now = new Date(),
): Promise<OnboardingFollowUpResult> {
  const candidates: Candidate[] = await db
    .select({
      id: onboardingEmail.id,
      userId: onboardingEmail.userId,
      orgId: onboardingEmail.orgId,
      milestoneDays: onboardingEmail.milestoneDays,
      email: user.email,
      name: user.name,
    })
    .from(onboardingEmail)
    .innerJoin(user, eq(user.id, onboardingEmail.userId))
    .where(and(lte(onboardingEmail.scheduledAt, now), claimable(now)))
    .orderBy(onboardingEmail.scheduledAt)
    .limit(BATCH_SIZE);

  const result: OnboardingFollowUpResult = {
    considered: candidates.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  await mapLimit(candidates, CONCURRENCY, async (candidate) => {
    const claimToken = uuidv7();
    const claimed = await db
      .update(onboardingEmail)
      .set({ status: "claimed", claimToken, claimedAt: now })
      .where(
        and(
          eq(onboardingEmail.id, candidate.id),
          lte(onboardingEmail.scheduledAt, now),
          claimable(now),
        ),
      )
      .returning({ id: onboardingEmail.id });

    if (!claimed[0]) return;

    try {
      if (await hasOrgSpanUsage(ch, candidate.orgId)) {
        await db
          .update(onboardingEmail)
          .set({
            status: "skipped",
            claimToken: null,
            claimedAt: null,
          })
          .where(
            and(
              eq(onboardingEmail.id, candidate.id),
              eq(onboardingEmail.claimToken, claimToken),
            ),
          );
        result.skipped += 1;
        return;
      }

      await sendOnboardingFollowUpEmail({
        to: candidate.email,
        name: candidate.name,
        milestoneDays: candidate.milestoneDays,
        idempotencyKey: `onboarding-follow-up-${candidate.id}`,
      });

      await db
        .update(onboardingEmail)
        .set({
          status: "sent",
          sentAt: new Date(),
          claimToken: null,
          claimedAt: null,
        })
        .where(
          and(
            eq(onboardingEmail.id, candidate.id),
            eq(onboardingEmail.claimToken, claimToken),
          ),
        );
      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      await db
        .update(onboardingEmail)
        .set({ status: "pending", claimToken: null, claimedAt: null })
        .where(
          and(
            eq(onboardingEmail.id, candidate.id),
            eq(onboardingEmail.claimToken, claimToken),
          ),
        );
      log.error("onboarding.follow_up_failed", {
        onboardingEmailId: candidate.id,
        userId: candidate.userId,
        milestoneDays: candidate.milestoneDays,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  log.info("onboarding.follow_up_sweep", result);
  return result;
}
