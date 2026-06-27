import { trpcServer } from "@hono/trpc-server";
import { startAlertEvaluator } from "@foglamp/api/alertCron";
import { startPosterCleanup } from "@foglamp/api/posterCron";
import { startQuotaWarnSweep } from "@foglamp/api/quotaCron";
import { startScoringWorker } from "@foglamp/api/scoringCron";
import { startStorageWatchSweep } from "@foglamp/api/storageCron";
import { createContext } from "@foglamp/api/context";
import { appRouter } from "@foglamp/api/routers/index";
import { provisionCliKey } from "@foglamp/api/services/projects";
import { auth, getAuthMethods } from "@foglamp/auth";
import { db } from "@foglamp/db";
import { env, getTrustedAppOrigins } from "@foglamp/env/server";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { createLogger } from "evlog";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";

import { evlog, type AppEnv } from "./evlog";
import { handleFoggy } from "./foggy";
import { pruneFoggyRateLimits } from "./foggyRateLimit";
import { handlePosterCreate, handlePosterGet } from "./poster";
import { prunePosterRateLimits } from "./rateLimit";

const app = new Hono<AppEnv>();
const trustedAppOrigins = getTrustedAppOrigins(
  env.CORS_ORIGIN,
  env.CORS_EXTRA_ORIGINS
);

app.use(evlog);
app.use(
  "/*",
  cors({
    origin: trustedAppOrigins,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Public: which sign-in methods this deployment offers (derived from env, no
// secrets). The login page reads this to render only what will actually work.
app.get("/api/auth-methods", (c) => c.json(getAuthMethods()));

// CLI key provisioning for `npx foglamp login`. Once the user approves the
// device-auth request in the browser, the CLI exchanges its device code for a
// session token and calls this with `Authorization: Bearer <token>` (the
// bearer plugin maps it to a session, which the evlog middleware resolves into
// `c.get("session")`). We mint a key against the user's default project so the
// CLI can write FOGLAMP_API_KEY and the agent can start instrumenting.
app.post("/api/cli/provision-key", async (c) => {
  const session = c.get("session");
  if (!session?.user?.id) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  try {
    const result = await provisionCliKey(db, session.user.id);
    return c.json(result);
  } catch (err) {
    // Surface curated TRPCError messages (e.g. "Requires owner or admin role",
    // "No project found"); keep anything else generic so we don't leak internals.
    if (err instanceof TRPCError) {
      return c.json({ error: err.message }, getHTTPStatusCodeFromError(err) as 400);
    }
    c.get("log").error(err instanceof Error ? err : new Error(String(err)));
    return c.json({ error: "Failed to provision key" }, 500);
  }
});

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  })
);

// Foggy — in-app AI assistant. Streams a UI message response; auth + project
// access + rate limiting are enforced inside the handler.
app.post(
  "/foggy",
  bodyLimit({
    maxSize: env.FOGGY_MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "payload too large" }, 413),
  }),
  handleFoggy,
);

// Codebase poster — public, anonymous. An agent uploads its poster JSON and
// gets back a shareable foglamp.dev/poster/<slug> URL. Rate-limited by IP inside
// the handler; bodyLimit guards payload size.
app.post(
  "/poster",
  bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) => c.json({ error: "payload too large" }, 413),
  }),
  handlePosterCreate,
);
app.get("/poster/:slug", handlePosterGet);

app.get("/", (c) => {
  return c.text("OK");
});

// Alert evaluator: sweep enabled rules on an interval, transition state, and
// email on fired/resolved. apps/server is the long-running tier that owns it.
const stopAlertEvaluator = startAlertEvaluator();
// Eval scoring worker: score new traces/spans against enabled evals on an
// interval (BYOK judges + code scorers), writing to the scores table.
const stopScoringWorker = startScoringWorker();
// Quota warning sweep: email owners/admins when an org nears its span quota.
const stopQuotaWarnSweep = startQuotaWarnSweep();
// ClickHouse storage watch: email platform admins when the DB grows past the
// configured size threshold (every 4h by default).
const stopStorageWatchSweep = startStorageWatchSweep();
// Poster cleanup: delete expired anonymous codebase posters (daily).
const stopPosterCleanup = startPosterCleanup();

// Periodically shed stale in-memory rate-limit entries (foggy + poster).
const pruneTimer = setInterval(() => {
  pruneFoggyRateLimits();
  prunePosterRateLimits();
}, 60_000);
pruneTimer.unref?.();

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const log = createLogger({ service: "server" });
  try {
    log.emit({ outcome: "shutdown_start", signal });
    clearInterval(pruneTimer);
    await Promise.all([
      stopAlertEvaluator(),
      stopScoringWorker(),
      stopQuotaWarnSweep(),
      stopStorageWatchSweep(),
      stopPosterCleanup(),
    ]);
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

// Bun serves a default export with `{ port, fetch }`. The host (Cloud Run,
// Railway, Fly.io, …) injects PORT; falls back to 3000 for local dev.
export default {
  port: env.PORT,
  fetch: app.fetch,
};
