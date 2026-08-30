import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";

import { ch } from "./clickhouse";
import { startCron } from "./lib/cron";
import { evaluateWeeklyDigests } from "./services/weeklyDigest";

/** Enqueue and send the Monday weekly digest from the long-running server. */
export function startWeeklyDigestSweep(): () => Promise<void> {
	const log = createLogger();
	const intervalMs = env.WEEKLY_DIGEST_INTERVAL_MS;
	log.info("digest.sweep_started", { intervalMs });
	return startCron("digest.weekly", intervalMs, async () => {
		try {
			await evaluateWeeklyDigests(db, ch, log);
		} catch (err) {
			log.error("digest.sweep_failed", {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	});
}
