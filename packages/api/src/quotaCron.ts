import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";

import { ch } from "./clickhouse";
import { evaluateQuotaWarnings } from "./services/quotaWarn";

/**
 * Periodically email owners/admins of orgs nearing their span quota. Sibling of
 * the alert + scoring crons; lives in apps/server's long-running process. Hourly
 * by default — quota warnings don't need finer cadence.
 */
export function startQuotaWarnSweep(): () => void {
  const log = createLogger();
  const intervalMs = env.QUOTA_WARN_INTERVAL_MS;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await evaluateQuotaWarnings(db, ch, log);
    } catch (err) {
      log.error("quota.sweep_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      running = false;
    }
  };

  log.info("quota.warn_started", { intervalMs });
  const handle = setInterval(tick, intervalMs);
  (handle as { unref?: () => void }).unref?.();
  void tick();

  return () => clearInterval(handle);
}
