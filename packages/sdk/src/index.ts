// foglamp — two-line observability for the Vercel AI SDK (v7).
//
// Global (instruments every generateText/streamText in the app):
//
//   import { registerTelemetry } from "ai";
//   import { foglamp } from "foglamp";
//   registerTelemetry(foglamp());
//
// Per-call (typed, wins over global; attaches first-class context):
//
//   const fog = foglamp();
//   await generateText({
//     model, prompt,
//     telemetry: { integrations: [fog.integration({ agentName: "support" })] },
//   });
//
// Silent no-op when FOGLAMP_API_KEY is unset; never throws, never adds
// latency. On Vercel/Lambda it flushes per-call via waitUntil; elsewhere it
// batches on a timer — call `await fog.flush()` before a short-lived process
// exits, or `fog.shutdown()` to stop and drain.

import { Collector } from "./collector";
import { resolveConfig } from "./config";
import { Transport } from "./transport";
import type { FoglampConfig } from "./types";

/**
 * Create a Foglamp collector. The returned object is both an AI SDK
 * `Telemetry` integration (pass to `registerTelemetry`) and a factory for
 * per-call, context-bound integrations via `.integration(ctx)`.
 */
export function foglamp(config: FoglampConfig = {}): Collector {
  const resolved = resolveConfig(config);
  const transport = new Transport(resolved);
  return new Collector(transport, resolved);
}

export { Collector } from "./collector";
export type {
  IntegrationContext,
  IntegrationInput,
  MetadataInput,
  WaitUntil,
  FoglampConfig,
} from "./types";
export type { IngestPayload, Metadata, Span, SpanType, Trace, Usage } from "./wire";
