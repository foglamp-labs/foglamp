import type { ResolvedConfig, FoglampConfig } from "./types";

// Resolve user config + environment into a fully-defaulted internal config.

const DEFAULT_ENDPOINT = "https://ingest.foglamp.dev/ingest";
// The wire contract caps each input/output blob at 1MB; never exceed it.
const CONTRACT_MAX_PAYLOAD = 1_000_000;

export function resolveConfig(config: FoglampConfig): ResolvedConfig {
  const env: Record<string, string | undefined> =
    typeof process !== "undefined" && process.env ? process.env : {};

  const apiKey = config.apiKey ?? env.FOGLAMP_API_KEY;
  const endpoint = config.endpoint ?? env.FOGLAMP_INGEST_URL ?? DEFAULT_ENDPOINT;
  const debug = config.debug ?? false;

  const fetchImpl =
    config.fetch ??
    (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);

  // A serverless runtime can't rely on a background timer surviving the
  // response, so it flushes per-call. Detect the common platforms, or assume so
  // when the caller threads a `waitUntil` (CF Workers / explicit opt-in).
  const serverless =
    config.waitUntil !== undefined ||
    Boolean(env.VERCEL) ||
    Boolean(env.AWS_LAMBDA_FUNCTION_NAME) ||
    env.NEXT_RUNTIME === "edge";

  const onError =
    config.onError ??
    ((error: unknown) => {
      if (debug) console.error("[foglamp]", error);
    });

  const enabled = Boolean(apiKey) && typeof fetchImpl === "function";

  if (!apiKey && debug) {
    console.warn("[foglamp] FOGLAMP_API_KEY not set — telemetry disabled (no-op).");
  }

  return {
    enabled,
    apiKey,
    endpoint,
    flushIntervalMs: positive(config.flushIntervalMs, 5_000),
    maxBatchTraces: positive(config.maxBatchTraces, 50),
    maxBatchSpans: positive(config.maxBatchSpans, 500),
    maxQueuedSpans: positive(config.maxQueuedSpans, 5_000),
    maxTraceAgeMs: positive(config.maxTraceAgeMs, 600_000),
    maxPayloadChars: Math.min(positive(config.maxPayloadChars, 100_000), CONTRACT_MAX_PAYLOAD),
    recordInputs: config.recordInputs ?? true,
    recordOutputs: config.recordOutputs ?? true,
    fetch: fetchImpl as typeof fetch,
    waitUntil: config.waitUntil,
    serverless,
    debug,
    onError,
  };
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
