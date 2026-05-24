import { db } from "@watchtower/db";
import { env } from "@watchtower/env/server";
import { createLogger } from "evlog";

import { ch } from "./clickhouse";
import { evaluateAlerts } from "./services/alertEvaluator";

/**
 * Start the alert evaluator on a fixed interval (a Bun/Node `setInterval`).
 * Lives in apps/server's long-running process; the ingest and web tiers don't
 * run it. Returns a stop handle for graceful shutdown. Each sweep is guarded so
 * a slow run never overlaps the next tick.
 */
export function startAlertEvaluator(): () => void {
  const log = createLogger();
  const intervalMs = env.ALERT_EVAL_INTERVAL_MS;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await evaluateAlerts(db, ch, log);
    } catch (err) {
      log.error("alert.sweep_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      running = false;
    }
  };

  log.info("alert.evaluator_started", { intervalMs });
  const handle = setInterval(tick, intervalMs);
  // Don't keep the process alive solely for the evaluator.
  (handle as { unref?: () => void }).unref?.();
  // Kick off an initial sweep without blocking startup.
  void tick();

  return () => clearInterval(handle);
}
