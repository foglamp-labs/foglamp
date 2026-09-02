import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";

import { ch } from "./clickhouse";
import { startCron } from "./lib/cron";
import { syncPromptVersions } from "./services/promptVersions";

/**
 * Start the prompt-version job on a fixed interval — a sibling of the scoring
 * worker (scoringCron.ts). Each tick folds newly ingested system prompts into
 * the per-hash table and re-infers versions for the agents that changed.
 * Returns a stop handle for graceful shutdown.
 */
export function startPromptVersionJob(): () => Promise<void> {
  const log = createLogger();
  const intervalMs = env.PROMPT_VERSION_INTERVAL_MS;
  log.info("prompt.job_started", { intervalMs });
  return startCron("prompt.versions", intervalMs, async () => {
    try {
      await syncPromptVersions(db, ch, log);
    } catch (err) {
      log.error("prompt.sync_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
