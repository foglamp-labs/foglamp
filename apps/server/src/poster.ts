import { env } from "@foglamp/env/server";
import { db } from "@foglamp/db";
import type { Context } from "hono";

import { createOrUpdatePoster, getPosterBySlug } from "@foglamp/api/services/posters";

import type { AppEnv } from "./evlog";
import { checkPosterRateLimit } from "./rateLimit";

const APP_BASE = env.CORS_ORIGIN.replace(/\/+$/, "");

function clientIp(c: Context<AppEnv>): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "anon";
  return c.req.header("x-real-ip") || "anon";
}

// POST /poster — anonymous create (or update with a matching editToken). The
// agent curls its `.foglamp/poster.json` here and gets back a shareable URL.
export async function handlePosterCreate(c: Context<AppEnv>): Promise<Response> {
  const ip = clientIp(c);
  const limit = await checkPosterRateLimit(ip);
  if (!limit.allowed) {
    c.header("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000)));
    return c.json({ error: "rate limited — try again later" }, 429);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  // Accept either the bare PosterData or { data, editToken }.
  const wrapped =
    body && typeof body === "object" && "data" in body
      ? (body as { data: unknown; editToken?: string })
      : { data: body };

  const outcome = await createOrUpdatePoster(db, {
    data: wrapped.data,
    editToken: wrapped.editToken ?? null,
  });

  if (!outcome.ok) {
    return c.json({ error: "poster data is invalid", details: outcome.errors }, 422);
  }

  const { slug, editToken, expiresAt, updated } = outcome.result;
  return c.json(
    {
      slug,
      url: `${APP_BASE}/poster/${slug}`,
      editToken,
      expiresAt: expiresAt.toISOString(),
      updated,
    },
    updated ? 200 : 201,
  );
}

// GET /poster/:slug — returns the poster JSON (consumed by the web page + OG
// image). Public; null/expired → 404.
export async function handlePosterGet(c: Context<AppEnv>): Promise<Response> {
  const slug = c.req.param("slug");
  if (!slug) return c.json({ error: "not found" }, 404);
  const data = await getPosterBySlug(db, slug);
  if (!data) return c.json({ error: "not found" }, 404);
  return c.json(data);
}
