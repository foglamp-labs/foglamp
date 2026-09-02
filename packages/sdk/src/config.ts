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

  // Local HUD overlay. Dev/Node only: never on a serverless/edge runtime (no
  // long-lived process to host the SSE server) and never in production. Opt in
  // via `hud: true` or `FOGLAMP_HUD=1`. It does NOT need an API key — the
  // collector builds traces whenever `active`, but the transport still gates on
  // `enabled`, so HUD-only runs stream locally without POSTing to ingest.
  const nodeRuntime =
    typeof process !== "undefined" && Boolean(process.versions?.node);
  const isProduction = env.NODE_ENV === "production";
  const hudRequested = config.hud === true || isTruthy(env.FOGLAMP_HUD);
  const hud = hudRequested && nodeRuntime && !serverless && !isProduction;
  const hudPort = positive(
    config.hudPort ?? numberOrUndefined(env.FOGLAMP_HUD_PORT),
    8517,
  );
  const active = enabled || hud;

  if (!apiKey && !hud && debug) {
    console.warn("[foglamp] FOGLAMP_API_KEY not set — telemetry disabled (no-op).");
  }
  if (hud && debug) {
    console.warn(
      `[foglamp] HUD enabled — streaming live execution to http://127.0.0.1:${hudPort} (dev only).`,
    );
  }

  return {
    enabled,
    active,
    hud,
    hudPort,
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
    recordSystemPrompt: config.recordSystemPrompt ?? true,
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

function numberOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Env truthiness for opt-in flags: "1"/"true"/"yes"/"on" (case-insensitive).
function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
