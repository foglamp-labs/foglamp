// Public configuration + context types for the Watchtower SDK. Kept dependency-
// free (only the bundled wire contract) so the published package has zero
// workspace runtime deps and `ai` stays a peer dependency.

/**
 * Keeps a serverless invocation alive until the given promise settles. On
 * Vercel this is `waitUntil` from `@vercel/functions`; on Cloudflare Workers
 * pass `ctx.waitUntil`. Without it, a serverless function may freeze before a
 * fire-and-forget flush completes.
 */
export type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * User-supplied metadata. Values are coerced to strings (the wire contract is
 * a `Record<string, string>`, mirroring ClickHouse `Map(String, String)`).
 */
export type MetadataInput = Record<string, string | number | boolean>;

/** Options for `watchtower(config)`. Every field is optional. */
export interface WatchtowerConfig {
  /** API key. Defaults to `process.env.WATCHTOWER_API_KEY`. Unset ⇒ no-op. */
  apiKey?: string;
  /**
   * Ingest endpoint. Defaults to `process.env.WATCHTOWER_INGEST_URL`, then the
   * hosted endpoint. Self-hosters point this at their own `apps/ingest`.
   */
  endpoint?: string;
  /** Flush cadence for long-running runtimes (ms). Default 5000. */
  flushIntervalMs?: number;
  /** Flush early once this many traces are buffered. Default 50. */
  maxBatchTraces?: number;
  /** Flush early once this many spans are buffered. Default 500. */
  maxBatchSpans?: number;
  /** Per-blob cap for serialized inputs/outputs (chars). Default 100_000. */
  maxPayloadChars?: number;
  /** Capture prompt/messages as span `input`. Default true. */
  recordInputs?: boolean;
  /** Capture model/tool results as span `output`. Default true. */
  recordOutputs?: boolean;
  /** Serverless keep-alive (e.g. Vercel/CF `waitUntil`). Enables flush-per-call. */
  waitUntil?: WaitUntil;
  /** Override the `fetch` used to POST batches. Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Log internal warnings/errors to the console. Default false. */
  debug?: boolean;
  /** Called for transport/handler errors. Telemetry never throws into your app. */
  onError?: (error: unknown) => void;
}



/**
 * Per-call context bound via `wt.integration(ctx)`. These become first-class,
 * indexed trace fields; everything else goes in `metadata`.
 */
export interface IntegrationContext {
  agentName?: string;
  workflowName?: string;
  workflowRunId?: string;
  sessionId?: string;
  metadata?: MetadataInput;
}

/** Fully-resolved config used internally (no optionals). */
export interface ResolvedConfig {
  enabled: boolean;
  apiKey: string | undefined;
  endpoint: string;
  flushIntervalMs: number;
  maxBatchTraces: number;
  maxBatchSpans: number;
  maxPayloadChars: number;
  recordInputs: boolean;
  recordOutputs: boolean;
  fetch: typeof fetch;
  waitUntil: WaitUntil | undefined;
  serverless: boolean;
  debug: boolean;
  onError: (error: unknown) => void;
}
