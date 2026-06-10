import {
  applySpansRetention,
  clickHouseConfigFromEnv,
  createClickHouseClient,
  runMigrations,
} from "@foglamp/clickhouse";
import { ingestPayloadSchema } from "@foglamp/contracts";
import { getPricingTable } from "@foglamp/cost";
import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { resolveApiKey } from "./apiKey";
import { WriteBuffer } from "./buffer";
import { getProjectPricing } from "./customPricing";
import { evlog, type AppEnv } from "./evlog";
import { checkOrgQuota, pruneOrgLimits } from "./orgLimits";
import { checkRateLimit, pruneRateLimits } from "./rateLimit";
import { buildSpanRows } from "./transform";

// apps/ingest — write-heavy span ingestion. Per request: authenticate the API
// key (→ project), rate-limit per key, validate the wire payload, price each
// llm span, and enqueue rows to the in-memory buffer that bulk-inserts into
// ClickHouse. Scales independently from the read-heavy dashboard (apps/server).

const boot = createLogger({ service: "ingest", phase: "boot" });

// --- Boot: ClickHouse client, schema, retention, pricing warmup -----------
const client = createClickHouseClient(await clickHouseConfigFromEnv());
const applied = await runMigrations(client);
await applySpansRetention(client);
// Prime the pricing cache so the first requests don't all race the fetch. Never
// throws; an empty table just means early spans land with null cost.
void getPricingTable();
boot.emit({ migrationsApplied: applied });

const buffer = new WriteBuffer(client, {
  intervalMs: env.INGEST_FLUSH_INTERVAL_MS,
  maxRows: env.INGEST_FLUSH_MAX_ROWS,
  hooks: {
    onError: (err, attempted, requeued) => {
      const log = createLogger({ service: "ingest" });
      log.error(err instanceof Error ? err : new Error(String(err)), {
        op: "flush",
        attempted,
        requeued,
      });
      log.emit({ outcome: "flush_failed" });
    },
  },
});
buffer.start();

// Periodically shed idle rate-limit + org-limit cache entries (in-memory).
const pruneTimer = setInterval(() => {
  pruneRateLimits();
  pruneOrgLimits();
}, 60_000);
pruneTimer.unref?.();

// --- HTTP -----------------------------------------------------------------
const app = new Hono<AppEnv>();
app.use(evlog);

app.get("/health", (c) => c.json({ status: "ok", buffered: buffer.size() }));

function bearerKey(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

app.post(
  "/ingest",
  // Reject oversized bodies before buffering/parsing the whole payload.
  bodyLimit({
    maxSize: env.INGEST_MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "payload too large" }, 413),
  }),
  async (c) => {
  const log = c.get("log");

  // Refuse new work once shutdown began: rows accepted after the final buffer
  // drain would be silently lost at process.exit. The SDK retries on 503.
  if (shuttingDown) return c.json({ error: "shutting down" }, 503);

  // 1. Authenticate. Accept `Authorization: Bearer fl_…` or `x-api-key`.
  const key =
    bearerKey(c.req.header("authorization")) ?? c.req.header("x-api-key") ?? null;
  if (!key) return c.json({ error: "missing API key" }, 401);

  const resolved = await resolveApiKey(key);
  if (!resolved) return c.json({ error: "invalid or revoked API key" }, 401);
  log.set({ projectId: resolved.projectId });

  // 2. Validate the wire payload. (INGEST_MAX_BODY_BYTES already rejected
  // oversized bodies before they were buffered.)
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid payload", issues: parsed.error.issues.slice(0, 20) },
      400,
    );
  }

  // 3. Rate limit per key, costed by span count so one request carrying a huge
  // batch can't amplify past the limit (shared via Redis when configured).
  const incoming = parsed.data.traces.reduce((n, t) => n + t.spans.length, 0);
  const rl = await checkRateLimit(resolved.apiKeyId, Math.max(1, incoming));
  if (!rl.allowed) {
    c.header("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    return c.json({ error: "rate limit exceeded" }, 429);
  }

  // 4. Plan quota: reject over the hard cap (110%); also gives the per-org
  // retention to stamp. Warn (90%) is surfaced in-app via the usage endpoint.
  const quota = await checkOrgQuota(client, resolved.orgId, incoming);
  if (quota.reject) {
    log.set({ quotaUsed: quota.used, quotaLimit: quota.limit });
    return c.json(
      { error: "Monthly span quota exceeded — upgrade your plan to keep ingesting." },
      429,
    );
  }

  // 5. Price + flatten to span rows (stamped with org + retention), then enqueue.
  const [table, rules] = await Promise.all([
    getPricingTable(),
    getProjectPricing(resolved.projectId),
  ]);
  const rows = buildSpanRows({
    payload: parsed.data,
    projectId: resolved.projectId,
    orgId: resolved.orgId,
    retentionDays: quota.retentionDays,
    table,
    rules,
    now: Date.now(),
  });
  buffer.push(rows);

  log.set({ traceCount: parsed.data.traces.length, spanCount: rows.length });
  return c.json({ accepted: rows.length }, 202);
});

// OTLP ingest is a deferred follow-up (see plan); advertise it as unimplemented
// rather than 404 so clients can detect intent.
app.post("/v1/traces", (c) =>
  c.json({ error: "OTLP ingest not yet implemented; use POST /ingest" }, 501),
);

app.get("/", (c) => c.text("foglamp ingest"));

// --- Graceful shutdown: flush the volatile buffer before exiting ----------
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const log = createLogger({ service: "ingest" });
  try {
    clearInterval(pruneTimer);
    // New /ingest requests now get 503; give handlers already past that guard
    // a beat to finish pushing before the drain (which also re-checks for
    // late rows on every pass).
    await new Promise((r) => setTimeout(r, 100));
    await buffer.stop();
    await client.close();
    log.emit({ outcome: "shutdown", signal });
  } catch (err) {
    log.error(err instanceof Error ? err : new Error(String(err)), { signal });
    log.emit({ outcome: "shutdown_error" });
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Bun serves a default export `{ port, fetch }`; INGEST_PORT defaults to 4000.
export default {
  port: env.INGEST_PORT,
  fetch: app.fetch,
};
