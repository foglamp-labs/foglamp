export type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * User-supplied metadata. Values are coerced to strings (the wire contract is
 * a `Record<string, string>`, mirroring ClickHouse `Map(String, String)`).
 */
export type MetadataInput = Record<string, string | number | boolean>;

/**
 * The end-customer a trace is serving, for per-customer cost attribution. Only
 * `id` is required (the stable grouping key); `name`/`imageUrl` are optional
 * display fields surfaced in the dashboard.
 */
export interface CustomerInput {
  id: string;
  name?: string;
  imageUrl?: string;
}

/** Options for `foglamp(config)`. Every field is optional. */
export interface FoglampConfig {
  /** API key. Defaults to `process.env.FOGLAMP_API_KEY`. Unset ⇒ no-op. */
  apiKey?: string;
  /**
   * Ingest endpoint. Defaults to `process.env.FOGLAMP_INGEST_URL`, then the
   * hosted endpoint. Self-hosters point this at their own `apps/ingest`.
   */
  endpoint?: string;
  /** Flush cadence for long-running runtimes (ms). Default 5000. */
  flushIntervalMs?: number;
  /** Flush early once this many traces are buffered. Default 50. */
  maxBatchTraces?: number;
  /** Flush early once this many spans are buffered. Default 500. */
  maxBatchSpans?: number;
  /**
   * Hard cap on spans buffered in memory (e.g. when the ingest endpoint is
   * down). Past it, the oldest traces are dropped and `onError` is called.
   * Default 5000.
   */
  maxQueuedSpans?: number;
  /**
   * Traces still open after this long are finalized with an "abandoned" error
   * the next time a call starts, so a crashed/never-finished generation can't
   * leak its builder (and its spans) forever. Default 600_000 (10 min).
   */
  maxTraceAgeMs?: number;
  /** Per-blob cap for serialized inputs/outputs (chars). Default 100_000. */
  maxPayloadChars?: number;
  /** Capture prompt/messages as span `input`. Default true. */
  recordInputs?: boolean;
  /** Capture model/tool results as span `output`. Default true. */
  recordOutputs?: boolean;
  /**
   * Capture the system prompt (`system` / agent `instructions`) on the run's
   * root span, so the dashboard can show it and group runs by prompt version.
   * Also off whenever `recordInputs` is false. Default true.
   */
  recordSystemPrompt?: boolean;
  /** Serverless keep-alive (e.g. Vercel/CF `waitUntil`). Enables flush-per-call. */
  waitUntil?: WaitUntil;
  /** Override the `fetch` used to POST batches. Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Log internal warnings/errors to the console. Default false. */
  debug?: boolean;
  /** Called for transport/handler errors. Telemetry never throws into your app. */
  onError?: (error: unknown) => void;
  /**
   * Stream live agent execution to a local Foglamp HUD overlay (`foglamp/hud`).
   * Dev/localhost only — ignored in production, on edge, and on serverless
   * runtimes. Also enableable via `FOGLAMP_HUD=1`. Works without an API key:
   * with HUD on but no `apiKey`, traces stream to the HUD but aren't sent to
   * ingest. Default false.
   */
  hud?: boolean;
  /**
   * Port for the in-process HUD broker (a localhost-only Server-Sent-Events
   * server the `<FoglampHUD/>` component connects to). Also `FOGLAMP_HUD_PORT`.
   * Default 8517.
   */
  hudPort?: number;
}



/**
 * Per-call context bound via `fog.integration(ctx)`. These become first-class,
 * indexed trace fields; everything else goes in `metadata`.
 */
export interface IntegrationContext {
  traceName?: string;
  agentName?: string;
  workflowName?: string;
  workflowRunId?: string;
  sessionId?: string;
  customer?: CustomerInput;
  metadata?: MetadataInput;
}

/**
 * Public parameter type for `fog.integration(ctx)`. Both trace rules are
 * enforced at the type level:
 *  - Every trace must be identifiable, so exactly one of `traceName` /
 *    `agentName` is required (both may be passed).
 *  - `workflowName` and `workflowRunId` are both-or-neither — passing one
 *    without the other is a compile-time error.
 * Both rules are rechecked at runtime (for JS callers) and again at ingest.
 */
export type IntegrationInput = IntegrationIdentity &
  IntegrationWorkflow &
  IntegrationContextExtras;

type IntegrationIdentity =
  | { traceName: string; agentName?: string }
  | { traceName?: string; agentName: string };

// Both-or-neither: supply a name + run id together, or omit both entirely.
type IntegrationWorkflow =
  | { workflowName: string; workflowRunId: string }
  | { workflowName?: undefined; workflowRunId?: undefined };

type IntegrationContextExtras = {
  sessionId?: string;
  customer?: CustomerInput;
  metadata?: MetadataInput;
};

/** Fully-resolved config used internally (no optionals). */
export interface ResolvedConfig {
  /** Ingest is configured (apiKey + fetch): traces are POSTed to the endpoint. */
  enabled: boolean;
  /**
   * The collector should build traces at all — true when ingest is enabled OR
   * the local HUD is on. Gates the lifecycle handlers; `enabled` alone still
   * gates the transport, so HUD-only (no key) builds and streams without POSTing.
   */
  active: boolean;
  /** Stream live execution to the local HUD broker. Dev/Node only. */
  hud: boolean;
  /** Localhost port for the HUD SSE broker. */
  hudPort: number;
  apiKey: string | undefined;
  endpoint: string;
  flushIntervalMs: number;
  maxBatchTraces: number;
  maxBatchSpans: number;
  maxQueuedSpans: number;
  maxTraceAgeMs: number;
  maxPayloadChars: number;
  recordInputs: boolean;
  recordOutputs: boolean;
  recordSystemPrompt: boolean;
  fetch: typeof fetch;
  waitUntil: WaitUntil | undefined;
  serverless: boolean;
  debug: boolean;
  onError: (error: unknown) => void;
}
