import {
  applySpansRetention,
  clickHouseConfigFromEnv,
  createClickHouseClient,
  runMigrations,
} from "@watchtower/clickhouse";
import { ingestPayloadSchema } from "@watchtower/contracts";
import { getPricingTable } from "@watchtower/cost";
import { env } from "@watchtower/env/server";
import { createLogger } from "evlog";
import { Hono } from "hono";

import { resolveApiKey } from "./apiKey";
import { WriteBuffer } from "./buffer";
import { getProjectPricing } from "./customPricing";
import { evlog, type AppEnv } from "./evlog";
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
await applySpansRetention(client, env.WATCHTOWER_SPANS_RETENTION_DAYS);
// Prime the pricing cache so the first requests don't all race the fetch. Never
// throws; an empty table just means early spans land with null cost.
void getPricingTable();
boot.emit({ migrationsApplied: applied, retentionDays: env.WATCHTOWER_SPANS_RETENTION_DAYS });

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

// Periodically shed idle rate-limit buckets (in-memory, per-instance).
const pruneTimer = setInterval(pruneRateLimits, 60_000);
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

app.post("/ingest", async (c) => {
  const log = c.get("log");

  // 1. Authenticate. Accept `Authorization: Bearer wt_…` or `x-api-key`.
  const key =
    bearerKey(c.req.header("authorization")) ?? c.req.header("x-api-key") ?? null;
  if (!key) return c.json({ error: "missing API key" }, 401);

  const resolved = await resolveApiKey(key);
  if (!resolved) return c.json({ error: "invalid or revoked API key" }, 401);
  log.set({ projectId: resolved.projectId });

  // 2. Rate limit per key (in-memory, per-instance/approximate).
  const rl = checkRateLimit(resolved.apiKeyId);
  if (!rl.allowed) {
    c.header("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    return c.json({ error: "rate limit exceeded" }, 429);
  }

  // 3. Validate the wire payload.
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

  // 4. Price + flatten to span rows, then enqueue.
  const [table, rules] = await Promise.all([
    getPricingTable(),
    getProjectPricing(resolved.projectId),
  ]);
  const rows = buildSpanRows({
    payload: parsed.data,
    projectId: resolved.projectId,
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

app.get("/", (c) => c.text("watchtower ingest"));

// --- Graceful shutdown: flush the volatile buffer before exiting ----------
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const log = createLogger({ service: "ingest" });
  try {
    clearInterval(pruneTimer);
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
