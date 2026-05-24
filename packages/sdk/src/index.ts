// @watchtower/sdk — two-line observability for the Vercel AI SDK (v7).
//
// Global (instruments every generateText/streamText in the app):
//
//   import { registerTelemetry } from "ai";
//   import { watchtower } from "@watchtower/sdk";
//   registerTelemetry(watchtower());
//
// Per-call (typed, wins over global; attaches first-class context):
//
//   const wt = watchtower();
//   await generateText({
//     model, prompt,
//     telemetry: { integrations: [wt.integration({ agentName: "support" })] },
//   });
//
// Silent no-op when WATCHTOWER_API_KEY is unset; never throws, never adds
// latency. On Vercel/Lambda it flushes per-call via waitUntil; elsewhere it
// batches on a timer — call `await wt.flush()` before a short-lived process
// exits, or `wt.shutdown()` to stop and drain.

import { Collector } from "./collector";
import { resolveConfig } from "./config";
import { Transport } from "./transport";
import type { WatchtowerConfig } from "./types";

/**
 * Create a Watchtower collector. The returned object is both an AI SDK
 * `Telemetry` integration (pass to `registerTelemetry`) and a factory for
 * per-call, context-bound integrations via `.integration(ctx)`.
 */
export function watchtower(config: WatchtowerConfig = {}): Collector {
  const resolved = resolveConfig(config);
  const transport = new Transport(resolved);
  return new Collector(transport, resolved);
}

export { Collector } from "./collector";
export type {
  IntegrationContext,
  MetadataInput,
  WaitUntil,
  WatchtowerConfig,
} from "./types";
export type { IngestPayload, Metadata, Span, SpanType, Trace, Usage } from "./wire";
