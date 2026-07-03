// Serves the built Vite app (dist/) and runs the mock agents. Importing
// ./server/run constructs foglamp({ hud: true, hudPort: 8518 }), which starts
// the local HUD broker (loopback). The browser can't reach that loopback when
// this is hosted, so we proxy the broker's SSE onto THIS server's own origin at
// /hud/events — and the client connects there via <FoglampHUD url="/hud/events" />.
//
//   bun run start   (= vite build && bun run src/server.ts)
//
// Hosted: runs on Cloud Run as a single always-on instance. `hud: true` is gated
// to non-production, so the runtime image must NOT set NODE_ENV=production.

import { AGENTS } from "./agents";
import { runAgent, runStorm } from "./server/run";

const PORT = Number(process.env.PORT ?? 3344);
const BROKER_SSE = "http://127.0.0.1:8518/events";
const DIST = new URL("../dist/", import.meta.url);

// Light per-IP rate limit on the manual trigger endpoints. The models are mocked
// (no token cost), so this only guards CPU against a hot loop / abuse.
const HITS = new Map<string, number[]>();
const LIMIT = 12;
const WINDOW_MS = 15_000;
function allow(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  return recent.length <= LIMIT;
}
function clientIp(req: Request, server: { requestIP(r: Request): { address: string } | null }) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    server.requestIP(req)?.address ||
    "anon"
  );
}

// The stream and triggers are consumed cross-origin by foglamp.dev/hud (the
// marketing playground). Public, read-only, no credentials — a wildcard is fine.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

Bun.serve({
  port: PORT,
  idleTimeout: 0, // don't drop the long-lived SSE proxy connection
  async fetch(req, server) {
    const url = new URL(req.url);

    // CORS preflight for the cross-origin POSTs from foglamp.dev/hud.
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    // Proxy the broker's SSE onto this origin so the browser can subscribe.
    // Same host → the loopback broker is reachable; Bun streams the response.
    if (req.method === "GET" && url.pathname === "/hud/events") {
      const upstream = await fetch(BROKER_SSE, { signal: req.signal });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...Object.fromEntries(upstream.headers),
          ...CORS,
        },
      });
    }

    if (req.method === "POST" && (url.pathname === "/api/run" || url.pathname === "/api/storm")) {
      if (!allow(clientIp(req, server)))
        return new Response("slow down", { status: 429, headers: CORS });
      if (url.pathname === "/api/storm") runStorm();
      else {
        const id = url.searchParams.get("agent");
        if (id) runAgent(id).catch((e) => console.error("run failed:", e));
      }
      return new Response("ok", { headers: CORS });
    }

    // The canonical marketing page for the HUD lives on the main site now;
    // the standalone demo root just points there. The SSE + API routes above
    // keep serving on this origin.
    if (req.method === "GET" && url.pathname === "/") {
      return Response.redirect("https://foglamp.dev/hud", 302);
    }

    // Static assets from the Vite build; SPA fallback to index.html.
    const rel = url.pathname.replace(/^\//, "");
    const file = Bun.file(new URL(rel, DIST));
    if (await file.exists()) return new Response(file);
    return new Response(Bun.file(new URL("index.html", DIST)), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

// Keep the hosted demo alive: a steady trickle of runs so a fresh visitor always
// lands on live activity (the broker replays its recent ring buffer on connect)
// instead of the empty "listening" state. Everyone shares the one broker, so any
// visitor's clicks already show up for all — this just guarantees motion when
// nobody is clicking. Disable with HUD_DEMO_HEARTBEAT=0.
const ids = AGENTS.map((a) => a.id);
function heartbeat() {
  const id = ids[Math.floor(Math.random() * ids.length)]!;
  runAgent(id).catch(() => {});
  setTimeout(heartbeat, 50_000 + Math.floor(Math.random() * 20_000)); // ~1min, jittered
}
if (process.env.HUD_DEMO_HEARTBEAT !== "0") setTimeout(heartbeat, 3_000);

console.log(`\n  Foglamp HUD demo → http://localhost:${PORT}`);
console.log(`  HUD stream (proxied) → /hud/events  ←  127.0.0.1:8518 (SSE)\n`);
console.log("  Open the page, then click a “Run” button (or “Run storm”).\n");
