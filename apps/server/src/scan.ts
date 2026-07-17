import { env } from "@foglamp/env/server";
import { db } from "@foglamp/db";
import type { Context } from "hono";
import { getConnInfo } from "hono/bun";

import {
  claimScan,
  createOrUpdateScan,
  getPreviousScanBySlug,
  getScanBySlug,
} from "@foglamp/api/services/scans";

import type { AppEnv } from "./evlog";
import { checkScanRateLimit } from "./rateLimit";

const APP_BASE = env.CORS_ORIGIN.replace(/\/+$/, "");

// Loopback / RFC1918 / link-local / CGNAT / ULA — i.e. "the direct peer is
// local infrastructure (a proxy), not the client itself".
function isPrivateIp(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return (
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(v4) ||
    v4 === "::1" ||
    /^f[cde]/i.test(v4) ||
    /^fe[89ab]/i.test(v4)
  );
}

/**
 * Client IP for rate limiting. Forwarding headers are client-controlled, so
 * they're only consulted when the socket peer is a private address (i.e. we're
 * actually behind a proxy) — a directly-connected client could otherwise spoof
 * a fresh X-Forwarded-For per request and dodge the limiter entirely. Within
 * X-Forwarded-For, the rightmost public entry wins: it's the one appended by
 * the nearest trusted proxy, while leftmost entries are caller-supplied.
 */
function clientIp(c: Context<AppEnv>): string {
  let sock: string | null = null;
  try {
    sock = getConnInfo(c).remote.address ?? null;
  } catch {
    // Not running under Bun's serve (e.g. tests) — fall through to headers.
  }
  if (sock && !isPrivateIp(sock)) return sock;
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    for (let i = hops.length - 1; i >= 0; i--) {
      if (!isPrivateIp(hops[i]!)) return hops[i]!;
    }
  }
  return c.req.header("x-real-ip") || sock || "anon";
}

// POST /scan — anonymous create (or update with a matching editToken). The
// agent curls its `.foglamp/scan.json` here and gets back a shareable URL.
export async function handleScanCreate(c: Context<AppEnv>): Promise<Response> {
  const ip = clientIp(c);
  const limit = await checkScanRateLimit(ip);
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

  // Accept either the bare ScanData or { data, editToken }.
  const wrapped =
    body && typeof body === "object" && "data" in body
      ? (body as { data: unknown; editToken?: string })
      : { data: body };

  const outcome = await createOrUpdateScan(db, {
    data: wrapped.data,
    editToken: wrapped.editToken ?? null,
  });

  if (!outcome.ok) {
    return c.json({ error: "scan data is invalid", details: outcome.errors }, 422);
  }

  const { slug, editToken, expiresAt, updated } = outcome.result;
  return c.json(
    {
      slug,
      url: `${APP_BASE}/scan/${slug}`,
      editToken,
      expiresAt: expiresAt.toISOString(),
      updated,
    },
    updated ? 200 : 201,
  );
}

// GET /scan/:slug — returns the scan JSON (consumed by the web page + OG
// image). Public; null/expired → 404.
export async function handleScanGet(c: Context<AppEnv>): Promise<Response> {
  const slug = c.req.param("slug");
  if (!slug) return c.json({ error: "not found" }, 404);
  const data = await getScanBySlug(db, slug);
  if (!data) return c.json({ error: "not found" }, 404);
  return c.json(data);
}

// GET /scan/:slug/previous — the version before the scan's last update, for
// the "what changed" diff. 404 when the scan is missing or never updated.
export async function handleScanGetPrevious(c: Context<AppEnv>): Promise<Response> {
  const slug = c.req.param("slug");
  if (!slug) return c.json({ error: "not found" }, 404);
  const data = await getPreviousScanBySlug(db, slug);
  if (!data) return c.json({ error: "not found" }, 404);
  return c.json(data);
}

// POST /scan/:slug/claim — a signed-in user proves ownership with the raw
// edit token; the scan is tied to their account and stops expiring.
export async function handleScanClaim(c: Context<AppEnv>): Promise<Response> {
  const session = c.get("session");
  if (!session?.user?.id) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  const slug = c.req.param("slug");
  if (!slug) return c.json({ error: "not found" }, 404);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const editToken =
    body && typeof body === "object" && "editToken" in body
      ? (body as { editToken?: unknown }).editToken
      : undefined;
  if (typeof editToken !== "string" || editToken.length === 0) {
    return c.json({ error: "editToken required" }, 400);
  }

  const outcome = await claimScan(db, { slug, editToken, userId: session.user.id });
  if (!outcome.ok) {
    return outcome.reason === "not_found"
      ? c.json({ error: "not found" }, 404)
      : c.json({ error: "invalid edit token" }, 403);
  }
  return c.json({ ok: true, slug });
}
