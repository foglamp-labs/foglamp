import { sendStorageAlertEmail } from "@foglamp/auth/email";
import { queryClickHouseTableStats } from "@foglamp/clickhouse";
import { env } from "@foglamp/env/server";
import { RedisClient } from "bun";

import type { Ch, Log } from "../types";
import { getPlatformAdminEmails } from "./platform";

// Daily deduplication so a sustained over-threshold condition emails admins at
// most once per UTC day, even though the cron ticks every few hours. Mirrors
// quotaWarn's two-tier approach:
//   Tier 1 — Redis (when REDIS_URL is set): SET <key> 1 NX EX <ttl> claims the
//     day across replicas; only the first claim returns "OK".
//   Tier 2 — in-process (REDIS_URL unset OR Redis errors): one notice per day
//     within the running process. A restart may re-alert once — fine for ops.
const DEDUP_TTL_SECS = 36 * 60 * 60; // 36h — covers a UTC day with headroom
let lastNotifiedDay: string | null = null;
const redis = env.REDIS_URL ? new RedisClient(env.REDIS_URL) : null;

async function claimDailyAlert(dayKey: string): Promise<boolean> {
  if (redis) {
    try {
      const result = await redis.send("SET", [
        `storage:alerted:${dayKey}`,
        "1",
        "NX",
        "EX",
        String(DEDUP_TTL_SECS),
      ]);
      return result === "OK";
    } catch {
      // Redis error → fall through to the in-memory fallback.
    }
  }
  if (lastNotifiedDay === dayKey) return false;
  lastNotifiedDay = dayKey;
  return true;
}

function formatGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/**
 * Check total ClickHouse on-disk size (sum of active parts across the current
 * database — the same number the platform dashboard shows) and email platform
 * admins when it crosses CLICKHOUSE_SIZE_ALERT_BYTES. System task; recipients
 * come from PLATFORM_ADMIN_EMAILS. Deduped to one email per UTC day while over.
 */
export async function evaluateClickHouseStorage(
  ch: Ch,
  log: Log,
): Promise<void> {
  const threshold = env.CLICKHOUSE_SIZE_ALERT_BYTES;
  const tables = await queryClickHouseTableStats(ch);
  const totalBytes = tables.reduce((acc, t) => acc + Number(t.bytes_on_disk), 0);

  if (totalBytes <= threshold) {
    log.info("storage.ok", { totalBytes, threshold });
    return;
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  if (!(await claimDailyAlert(dayKey))) {
    log.info("storage.over_threshold_deduped", { totalBytes, threshold });
    return;
  }

  const recipients = getPlatformAdminEmails();
  if (recipients.length === 0) {
    log.info("storage.no_admins", { totalBytes, threshold });
    return;
  }

  const usedLabel = formatGb(totalBytes);
  const thresholdLabel = formatGb(threshold);
  const url = `${env.CORS_ORIGIN.replace(/\/$/, "")}/platform`;
  await Promise.all(
    recipients.map((to) =>
      sendStorageAlertEmail({ to, usedLabel, thresholdLabel, url }),
    ),
  );
  log.info("storage.alerted", {
    totalBytes,
    threshold,
    recipients: recipients.length,
  });
}
