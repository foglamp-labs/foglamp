import { createLogger } from "evlog";

import { db } from "@foglamp/db";

import { startCron } from "./lib/cron";
import { deleteExpiredPosters } from "./services/posters";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Periodically delete expired anonymous posters. Sibling of the
 * alert/quota/scoring/storage crons; lives in apps/server's long-running
 * process. Daily is plenty — posters carry a 90-day TTL.
 */
export function startPosterCleanup(): () => Promise<void> {
  const log = createLogger();
  log.info("poster.cleanup_started", { intervalMs: DAY_MS });
  return startCron("poster.cleanup", DAY_MS, async () => {
    try {
      const removed = await deleteExpiredPosters(db);
      if (removed > 0) log.info("poster.cleanup_swept", { removed });
    } catch (err) {
      log.error("poster.cleanup_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
