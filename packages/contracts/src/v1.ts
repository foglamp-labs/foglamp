import { z } from "zod";

// ---------------------------------------------------------------------------
// Watchtower native ingest wire contract — v1.
//
// Producer: @watchtower/sdk (maps the AI SDK v7 Telemetry hooks onto this).
// Consumer: apps/ingest (validates, prices, flattens to ClickHouse span rows).
// Also imported by packages/api for typed reads. This is the single source of
// truth for the wire shape — nothing here is recomputed downstream except cost
// (added at ingest) and project scoping (derived from the API key).
// ---------------------------------------------------------------------------

/**
 * Span classification. `agent` is the root span representing the whole
 * top-level `generateText`/`streamText` call (the trace); `llm` is a single
 * model step; `tool` is a tool execution. Sliced by at query time, so adding a
 * variant later is cheap.
 */
export const SPAN_TYPES = [
  "agent",
  "llm",
  "tool",
  "embedding",
  "other",
] as const;
export const spanTypeSchema = z.enum(SPAN_TYPES);
export type SpanType = z.infer<typeof spanTypeSchema>;

export const SPAN_STATUSES = ["ok", "error"] as const;
export const spanStatusSchema = z.enum(SPAN_STATUSES);
export type SpanStatus = z.infer<typeof spanStatusSchema>;

/**
 * Token/usage counts carried on a span (primarily `llm`). Every field is
 * optional because providers vary in what they report; absence is meaningful
 * (it must not be coerced to 0, which would imply free). These map onto the
 * eight OpenRouter cost dimensions at ingest.
 */
export const usageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    cacheWriteInputTokens: z.number().int().nonnegative().optional(),
    imageCount: z.number().int().nonnegative().optional(),
    webSearchCount: z.number().int().nonnegative().optional(),
    // Defaults to 1 per llm span at ingest when the model prices per-request.
    requestCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export type Usage = z.infer<typeof usageSchema>;

// Free-form string→string map (mirrors ClickHouse Map(String, String)).
export const metadataSchema = z.record(z.string(), z.string());
export type Metadata = z.infer<typeof metadataSchema>;

const MAX_PAYLOAD_CHARS = 1_000_000; // 1MB soft cap per input/output blob.

export const spanSchema = z
  .object({
    spanId: z.string().min(1).max(128),
    parentSpanId: z.string().min(1).max(128).optional(),
    spanType: spanTypeSchema,
    name: z.string().max(512),

    // Epoch milliseconds. endTime >= startTime is enforced on the span.
    startTime: z.number().int().nonnegative(),
    endTime: z.number().int().nonnegative(),

    status: spanStatusSchema.default("ok"),
    errorMessage: z.string().max(8192).optional(),

    // Model attribution (llm spans).
    provider: z.string().max(128).optional(),
    modelId: z.string().max(256).optional(),
    usage: usageSchema.optional(),
    // Time-to-first-token, read from the AI SDK step performance object.
    ttftMs: z.number().nonnegative().optional(),

    // Optional, possibly-large payloads (JSON-encoded by the SDK).
    input: z.string().max(MAX_PAYLOAD_CHARS).optional(),
    output: z.string().max(MAX_PAYLOAD_CHARS).optional(),

    // Span-level metadata, merged over the trace-level map (span wins).
    metadata: metadataSchema.optional(),
  })
  .strict()
  .refine((s) => s.endTime >= s.startTime, {
    message: "endTime must be >= startTime",
    path: ["endTime"],
  });
export type Span = z.infer<typeof spanSchema>;

/**
 * A trace is one top-level call plus its spans. The first-class ids and
 * trace-level metadata are denormalized onto every span row at ingest (the
 * span store indexes them per-row), so they live once here on the wire.
 */
export const traceSchema = z
  .object({
    traceId: z.string().min(1).max(128),

    agentName: z.string().max(256).optional(),
    workflowName: z.string().max(256).optional(),
    workflowRunId: z.string().max(128).optional(),
    sessionId: z.string().max(128).optional(),

    metadata: metadataSchema.optional(),

    spans: z.array(spanSchema).min(1).max(2000),
  })
  .strict();
export type Trace = z.infer<typeof traceSchema>;

export const INGEST_VERSION = "v1" as const;

export const ingestPayloadSchema = z
  .object({
    version: z.literal(INGEST_VERSION),
    traces: z.array(traceSchema).min(1).max(1000),
  })
  .strict();
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
