import { Collector, prewarmHud } from "./collector";
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
  // Start the local HUD broker eagerly (dev only; no-op otherwise) so the
  // <FoglampHUD/> overlay can connect before the first trace.
  prewarmHud(resolved);
  return new Collector(transport, resolved);
}

export { Collector } from "./collector";
export type {
  CustomerInput,
  IntegrationContext,
  IntegrationInput,
  MetadataInput,
  WaitUntil,
  FoglampConfig,
} from "./types";
export type { IngestPayload, Metadata, Span, SpanType, Trace, Usage } from "./wire";
