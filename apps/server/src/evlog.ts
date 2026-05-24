import { auth } from "@watchtower/auth";
import { createRequestLogger } from "evlog";
import { maskEmail } from "evlog/better-auth";
import type { EvlogVariables } from "evlog/hono";
import { createMiddleware } from "hono/factory";

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

export type AppEnv = {
  Variables: EvlogVariables["Variables"] & { session: SessionResult };
};

const SKIP_IDENTIFY_PREFIXES = ["/api/auth/", "/queue/"];

export const evlog = createMiddleware<AppEnv>(async (c, next) => {
  const log = createRequestLogger({
    method: c.req.method,
    path: c.req.path,
  });
  c.set("log", log);

  if (!SKIP_IDENTIFY_PREFIXES.some((p) => c.req.path.startsWith(p))) {
    let session: SessionResult = null;
    try {
      session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
    } catch (err) {
      // never let session resolution break the request, but leave a
      // breadcrumb so a broken auth/DB layer isn't invisible in logs
      log.set({
        sessionError: err instanceof Error ? err.message : String(err),
      });
    }
    // Stash for tRPC createContext so it doesn't re-query the session.
    c.set("session", session);

    const sessionUser = session?.user as
      | { id?: string; name?: string; email?: string }
      | undefined;
    if (sessionUser?.id) {
      const user: Record<string, string> = { id: sessionUser.id };
      if (sessionUser.name) user.name = sessionUser.name;
      if (sessionUser.email) user.email = maskEmail(sessionUser.email);
      log.set({ user });
    }
  }

  try {
    await next();
    log.emit({ status: c.res.status });
  } catch (err) {
    log.error(err instanceof Error ? err : new Error(String(err)));
    log.emit({ status: 500 });
    throw err;
  }
});
