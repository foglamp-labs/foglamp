import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";

import { ch } from "./clickhouse";
import { evaluateEvals } from "./services/scoringWorker";

/**
 * Start the eval scoring worker on a fixed interval — the sibling of the alert
 * evaluator (alertCron.ts). Lives in apps/server's long-running process; ingest
 * and web don't run it. Each sweep is guarded so a slow run (judge LLM calls)
 * never overlaps the next tick. Returns a stop handle for graceful shutdown.
 */
export function startScoringWorker(): () => void {
  const log = createLogger();
  const intervalMs = env.SCORING_EVAL_INTERVAL_MS;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await evaluateEvals(db, ch, log);
    } catch (err) {
      log.error("eval.sweep_loop_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      running = false;
    }
  };

  log.info("eval.scoring_started", { intervalMs });
  const handle = setInterval(tick, intervalMs);
  (handle as { unref?: () => void }).unref?.();
  void tick();

  return () => clearInterval(handle);
}
