import { resolveApiKeyForRequest } from "@foglamp/api/services/apiKeys";
import { db } from "@foglamp/db";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "./evlog";

// Bearer-token auth for the routes a user's coding agent calls during
// onboarding. The credential is the project's existing FOGLAMP_API_KEY — the
// agent already has it in .env, so the loop needs no second secret and no
// token lifecycle of its own.
//
// The key is project-scoped by construction: everything downstream reads
// `apiKey.projectId` from here rather than from the request, so an agent can
// only ever touch its own project's plans.

/** Extract a `fl_…` key from `Authorization: Bearer …`. */
function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export const requireApiKey = createMiddleware<AppEnv>(async (c, next) => {
  const raw = bearer(c.req.header("authorization"));
  if (!raw) {
    return c.json({ error: "missing API key" }, 401);
  }

  const resolved = await resolveApiKeyForRequest(db, raw);
  if (!resolved) {
    // Deliberately identical to the missing-key response: never confirm that a
    // key exists but is revoked, or belongs to some other project.
    return c.json({ error: "invalid API key" }, 401);
  }

  c.set("apiKey", resolved);
  // The key id is a safe, non-secret correlation handle for logs. The key
  // itself never gets logged.
  c.get("log")?.set({ apiKeyId: resolved.apiKeyId, projectId: resolved.projectId });
  await next();
});
