import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";

import { ch } from "./clickhouse";
import { startCron } from "./lib/cron";
import { evaluateOnboardingFollowUps } from "./services/onboardingFollowUp";

/** Sweep the durable onboarding queue from the long-running server process. */
export function startOnboardingFollowUpSweep(): () => Promise<void> {
  const log = createLogger();
  const intervalMs = env.ONBOARDING_EMAIL_INTERVAL_MS;
  log.info("onboarding.follow_up_started", { intervalMs });
  return startCron("onboarding.follow_up", intervalMs, async () => {
    try {
      await evaluateOnboardingFollowUps(db, ch, log);
    } catch (err) {
      log.error("onboarding.follow_up_sweep_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
