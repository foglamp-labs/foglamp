import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type { HudEvent } from "./events";

const GLOBAL_KEY = Symbol.for("foglamp.hud.broker.v1");
// How many recent events to replay to a client that connects mid-run. One busy
// trace is well under this; older events age out so memory stays bounded.
const RING_SIZE = 1000;

interface BrokerState {
  port: number;
  server: Server | null;
  clients: Set<ServerResponse>;
  ring: HudEvent[];
  /** True once the server is listening (or has permanently failed to bind). */
  settled: boolean;
}

type Registry = Map<number, BrokerState>;

function registry(): Registry {
  const g = globalThis as unknown as { [GLOBAL_KEY]?: Registry };
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map();
  return g[GLOBAL_KEY];
}

export interface HudBroker {
  emit(event: HudEvent): void;
}

/**
 * Close every broker server and clear the registry. For tests and clean process
 * shutdown — the listening server otherwise keeps the event loop alive (Node's
 * `unref` isn't always honored under Bun). Not part of the public SDK surface.
 */
export function closeAllBrokers(): void {
  const reg = registry();
  for (const state of reg.values()) {
    for (const res of state.clients) {
      try {
        res.end();
      } catch {
        // already gone
      }
    }
    state.clients.clear();
    state.server?.close();
    state.server = null;
  }
  reg.clear();
}

/**
 * Get (creating + starting on first call) the broker for `port`. Always returns
 * a usable emitter: if the port is already taken — typically another dev worker
 * in the same project already running a broker — this process's emit() becomes a
 * no-op (the other server serves the HUD) rather than throwing.
 */
export function getBroker(port: number, onError: (error: unknown) => void): HudBroker {
  const reg = registry();
  let state = reg.get(port);
  if (!state) {
    state = { port, server: null, clients: new Set(), ring: [], settled: false };
    reg.set(port, state);
    start(state, onError);
  }
  const s = state;
  return {
    emit(event: HudEvent) {
      try {
        s.ring.push(event);
        if (s.ring.length > RING_SIZE) s.ring.shift();
        if (s.clients.size === 0) return;
        const frame = `data:${JSON.stringify(event)}\n\n`;
        for (const res of s.clients) {
          // A slow/broken client must not stall the agent: best-effort write,
          // and drop it on failure.
          try {
            res.write(frame);
          } catch {
            s.clients.delete(res);
          }
        }
      } catch (error) {
        onError(error);
      }
    },
  };
}

function start(state: BrokerState, onError: (error: unknown) => void): void {
  let server: Server;
  try {
    server = createServer((req, res) => handle(state, req, res));
  } catch (error) {
    state.settled = true;
    onError(error);
    return;
  }

  server.on("error", (error: NodeJS.ErrnoException) => {
    state.settled = true;
    // EADDRINUSE: another worker/process already owns the port and is serving
    // the HUD. Not fatal — this process just won't broadcast. Surface anything
    // else through onError.
    if (error.code !== "EADDRINUSE") onError(error);
    state.server = null;
  });

  server.on("listening", () => {
    state.settled = true;
  });

  // Don't keep the dev process alive solely for the HUD server.
  server.listen(state.port, "127.0.0.1", () => {
    server.unref?.();
  });
  state.server = server;
}

function handle(state: BrokerState, req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? "/";

  // CORS preflight / headers — the HUD runs on the app's origin (e.g.
  // localhost:3000) and connects cross-origin to the broker port.
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  // Liveness probe so the HUD can detect "is a broker up?" without opening SSE.
  if (url.startsWith("/health")) {
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: state.clients.size }));
    return;
  }

  if (!url.startsWith("/events")) {
    res.writeHead(404, cors);
    res.end();
    return;
  }

  // SSE stream.
  res.writeHead(200, {
    ...cors,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Defeat proxy buffering (e.g. when fronted by nginx in some dev setups).
    "X-Accel-Buffering": "no",
  });
  // Initial comment flushes headers and opens the stream immediately.
  res.write(":ok\n\n");

  // Backfill: replay the recent ring so a HUD opened mid-run still sees the
  // whole trace so far.
  for (const event of state.ring) {
    res.write(`data:${JSON.stringify(event)}\n\n`);
  }

  state.clients.add(res);
  const drop = () => state.clients.delete(res);
  req.on("close", drop);
  req.on("error", drop);
  res.on("error", drop);
}
