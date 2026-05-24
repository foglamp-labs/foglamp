import type { ResolvedConfig, WaitUntil } from "./types";
import type { IngestPayload, Trace } from "./wire";

// The wire version is pinned by the contract's `IngestPayload["version"]`; using
// the literal (rather than importing the runtime `INGEST_VERSION` const) keeps
// zod out of the published SDK bundle. A contract bump would fail this type.
const WIRE_VERSION: IngestPayload["version"] = "v1";

// In-memory batch + flush. Runtime-aware:
//  • long-running (Node/Bun): a periodic timer plus size thresholds.
//  • serverless (Vercel/Lambda/edge): flush per tick, kept alive via `waitUntil`
//    so the invocation doesn't freeze before the POST lands.
// Never throws; transport failures route to `config.onError` and are dropped
// (telemetry must not take the host app down or add latency to it).

export class Transport {
  private readonly config: ResolvedConfig;
  private queue: Trace[] = [];
  private queuedSpans = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private flushing: Promise<void> | undefined;
  private scheduled = false;
  private vercelWaitUntil: WaitUntil | undefined;
  private vercelLoad: Promise<void> | undefined;

  constructor(config: ResolvedConfig) {
    this.config = config;
    if (config.enabled && !config.serverless) {
      this.timer = setInterval(() => void this.flush(), config.flushIntervalMs);
      // Don't keep the process alive just for the flush timer.
      this.timer.unref?.();
    }
  }

  /** Buffer a finished trace. No-op when disabled. */
  enqueue(trace: Trace): void {
    if (!this.config.enabled) return;
    this.queue.push(trace);
    this.queuedSpans += trace.spans.length;

    if (this.config.serverless) {
      this.scheduleServerlessFlush();
    } else if (
      this.queue.length >= this.config.maxBatchTraces ||
      this.queuedSpans >= this.config.maxBatchSpans
    ) {
      void this.flush();
    }
  }

  /** Flush all buffered traces. Concurrent calls coalesce. Never throws. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.queue.length === 0) return Promise.resolve();

    const batch = this.queue;
    this.queue = [];
    this.queuedSpans = 0;

    const p = this.send(batch).finally(() => {
      if (this.flushing === p) this.flushing = undefined;
    });
    this.flushing = p;
    return p;
  }

  /** Stop the timer and drain everything, including traces queued mid-flush. */
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    while (this.flushing || this.queue.length > 0) {
      if (this.flushing) await this.flushing;
      if (this.queue.length > 0) await this.flush();
    }
  }

  /** Number of traces currently buffered. */
  size(): number {
    return this.queue.length;
  }

  // Batch a synchronous burst into one flush, then keep the serverless
  // invocation alive until it settles.
  private scheduleServerlessFlush(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    const p = Promise.resolve().then(() => {
      this.scheduled = false;
      return this.flush();
    });
    this.keepAlive(p);
  }

  private keepAlive(p: Promise<void>): void {
    const direct = this.config.waitUntil;
    if (direct) {
      try {
        direct(p);
      } catch {
        /* host waitUntil rejected the call — the promise still runs */
      }
      return;
    }
    if (this.vercelWaitUntil) {
      this.vercelWaitUntil(p);
      return;
    }
    // Lazily probe for `@vercel/functions`. `p` runs regardless; registering it
    // late still tells the runtime to wait (as long as it hasn't settled).
    void this.loadVercelWaitUntil().then((wu) => {
      if (wu) {
        try {
          wu(p);
        } catch {
          /* ignore */
        }
      }
    });
  }

  private async loadVercelWaitUntil(): Promise<WaitUntil | undefined> {
    if (this.vercelWaitUntil) return this.vercelWaitUntil;
    if (!this.vercelLoad) {
      this.vercelLoad = import("@vercel/functions")
        .then((mod) => {
          this.vercelWaitUntil = mod.waitUntil as WaitUntil;
        })
        .catch(() => {
          /* not running on Vercel; rely on explicit wt.flush() */
        });
    }
    await this.vercelLoad;
    return this.vercelWaitUntil;
  }

  private async send(traces: Trace[]): Promise<void> {
    const payload: IngestPayload = { version: WIRE_VERSION, traces };
    try {
      const res = await this.config.fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey ?? ""}`,
        },
        body: JSON.stringify(payload),
        // Improves delivery odds when a serverless/browser context is unloading.
        keepalive: true,
      });
      if (!res.ok) {
        this.config.onError(
          new Error(`watchtower ingest responded ${res.status} ${res.statusText}`),
        );
      }
    } catch (error) {
      this.config.onError(error);
    }
  }
}
