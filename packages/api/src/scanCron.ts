import { createLogger } from "evlog";

import { db } from "@foglamp/db";

import { startCron } from "./lib/cron";
import { deleteExpiredScans } from "./services/scans";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Periodically delete expired anonymous scans. Sibling of the
 * alert/quota/scoring/storage crons; lives in apps/server's long-running
 * process. Daily is plenty — scans carry a 90-day TTL.
 */
export function startScanCleanup(): () => Promise<void> {
  const log = createLogger();
  log.info("scan.cleanup_started", { intervalMs: DAY_MS });
  return startCron("scan.cleanup", DAY_MS, async () => {
    try {
      const removed = await deleteExpiredScans(db);
      if (removed > 0) log.info("scan.cleanup_swept", { removed });
    } catch (err) {
      log.error("scan.cleanup_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
