import { createRequestLogger } from "evlog";
import type { EvlogVariables } from "evlog/hono";
import { createMiddleware } from "hono/factory";

// Request-scoped wide-event logger for ingest. Unlike apps/server this has no
// better-auth session to resolve — ingest authenticates per request via an
// API key (see apiKey.ts), logged as a non-PII project id on the route itself.
export type AppEnv = {
  Variables: EvlogVariables["Variables"];
};

export const evlog = createMiddleware<AppEnv>(async (c, next) => {
  const log = createRequestLogger({
    method: c.req.method,
    path: c.req.path,
  });
  c.set("log", log);

  try {
    await next();
    log.emit({ status: c.res.status });
  } catch (err) {
    log.error(err instanceof Error ? err : new Error(String(err)));
    log.emit({ status: 500 });
    throw err;
  }
});
