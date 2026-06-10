import { trpcServer } from "@hono/trpc-server";
import { startAlertEvaluator } from "@foglamp/api/alertCron";
import { startQuotaWarnSweep } from "@foglamp/api/quotaCron";
import { startScoringWorker } from "@foglamp/api/scoringCron";
import { createContext } from "@foglamp/api/context";
import { appRouter } from "@foglamp/api/routers/index";
import { auth, getAuthMethods } from "@foglamp/auth";
import { env, getTrustedAppOrigins } from "@foglamp/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { evlog, type AppEnv } from "./evlog";
import { handleFoggy } from "./foggy";

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
app.post("/foggy", handleFoggy);

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
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopAlertEvaluator();
    stopScoringWorker();
    stopQuotaWarnSweep();
  });
}

// Bun serves a default export with `{ port, fetch }`. The host (Cloud Run,
// Railway, Fly.io, …) injects PORT; falls back to 3000 for local dev.
export default {
  port: env.PORT,
  fetch: app.fetch,
};
