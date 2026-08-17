import { createLogger } from "evlog";

import { db } from "@foglamp/db";

import { startCron } from "./lib/cron";
import { expireStalePlans } from "./services/instrumentationPlans";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Expire instrumentation plans nobody acted on. Sibling of the scan cleanup
 * cron. Hourly rather than daily because the plan TTL is 24h — a user who
 * comes back to a dead link should see "this plan expired" promptly, not
 * a stale "waiting for your coding agent" spinner for most of a day.
 */
export function startInstrumentationPlanExpiry(): () => Promise<void> {
  const log = createLogger();
  log.info("instrumentation.expiry_started", { intervalMs: HOUR_MS });
  return startCron("instrumentation.expiry", HOUR_MS, async () => {
    try {
      const expired = await expireStalePlans(db);
      if (expired > 0) log.info("instrumentation.expiry_swept", { expired });
    } catch (err) {
      log.error("instrumentation.expiry_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
