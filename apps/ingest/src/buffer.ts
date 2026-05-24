import { type ClickHouseClient, insertSpans, type SpanRow } from "@watchtower/clickhouse";

// In-memory write buffer. Spans are accumulated from accepted requests and
// flushed to ClickHouse in bulk on an interval or once a row cap is reached,
// and once more on shutdown (see main.ts SIGTERM handling). The buffer is
// volatile by design — the SDK retries, and a crash loses at most one window.

export type BufferHooks = {
  /** Called after a successful flush with the number of rows written. */
  onFlush?: (count: number) => void;
  /** Called when a flush fails; `attempted` rows were re-buffered if possible. */
  onError?: (err: unknown, attempted: number, requeued: boolean) => void;
};

export class WriteBuffer {
  private rows: SpanRow[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(
    private readonly client: ClickHouseClient,
    private readonly opts: {
      intervalMs: number;
      maxRows: number;
      hooks?: BufferHooks;
    },
  ) {}

  /** Begin periodic flushing. Idempotent. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.opts.intervalMs);
    // Don't keep the process alive solely for the flush timer.
    this.timer.unref?.();
  }

  size(): number {
    return this.rows.length;
  }

  /** Enqueue rows; triggers an immediate flush once the row cap is reached. */
  push(rows: SpanRow[]): void {
    if (rows.length === 0) return;
    for (const row of rows) this.rows.push(row);
    if (this.rows.length >= this.opts.maxRows) void this.flush();
  }

  /**
   * Flush the current batch. Never throws (errors go to the onError hook). A
   * single concurrent flush runs at a time; a failed insert re-buffers the
   * batch up to a bounded ceiling so a transient ClickHouse blip doesn't drop
   * spans, while a sustained outage sheds load instead of growing unbounded.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.rows.length === 0) return;
    this.flushing = true;
    const batch = this.rows;
    this.rows = [];
    try {
      await insertSpans(this.client, batch);
      this.opts.hooks?.onFlush?.(batch.length);
    } catch (err) {
      const ceiling = this.opts.maxRows * 10;
      const requeued = this.rows.length + batch.length <= ceiling;
      if (requeued) this.rows = batch.concat(this.rows);
      this.opts.hooks?.onError?.(err, batch.length, requeued);
    } finally {
      this.flushing = false;
    }
  }

  /** Stop the timer and flush whatever remains (called on shutdown). */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // A flush may be in flight; wait it out, then drain the remainder.
    while (this.flushing) await new Promise((r) => setTimeout(r, 10));
    await this.flush();
  }
}
