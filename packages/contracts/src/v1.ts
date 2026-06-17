import { z } from "zod";

// ---------------------------------------------------------------------------
// Foglamp native ingest wire contract — v1.
//
// Producer: foglamp (maps the AI SDK v7 Telemetry hooks onto this).
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
// Bounded so a single span can't carry an unbounded number of keys or huge
// values (wide-row amplification). Keys ≤128 chars, values ≤1024, ≤64 entries.
export const metadataSchema = z
  .record(z.string().max(128), z.string().max(1024))
  .refine((m) => Object.keys(m).length <= 64, {
    message: "metadata may have at most 64 keys",
  });
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

    // Intra-stream sampling (streaming llm spans only). Two parallel arrays:
    // chunkOffsets[i] is ms from step start, chunkTokens[i] is cumulative output
    // tokens at that moment. Downsampled by the SDK; empty/omitted otherwise.
    chunkOffsets: z.array(z.number().int().nonnegative()).max(200).optional(),
    chunkTokens: z.array(z.number().int().nonnegative()).max(200).optional(),

    // Reasoning-stream sampling (streaming llm spans on reasoning models).
    // Same shape as chunkOffsets/chunkTokens but tracking the reasoning text
    // stream; reasoningChunkTokens is cumulative *reasoning* tokens. Only sent
    // when the provider streamed reasoning and reported reasoningTokens.
    reasoningOffsets: z
      .array(z.number().int().nonnegative())
      .max(200)
      .optional(),
    reasoningChunkTokens: z
      .array(z.number().int().nonnegative())
      .max(200)
      .optional(),
    // Total wall-clock ms spent inside reasoning blocks for this step.
    reasoningDurationMs: z.number().int().nonnegative().optional(),

    // Optional, possibly-large payloads (JSON-encoded by the SDK).
    input: z.string().max(MAX_PAYLOAD_CHARS).optional(),
    output: z.string().max(MAX_PAYLOAD_CHARS).optional(),

    // JSON catalog of tools the model was offered for this call (name →
    // {description, JSON-Schema params}). Stamped on llm + agent spans only.
    toolCatalog: z.string().max(MAX_PAYLOAD_CHARS).optional(),

    // Pure model-call wall-clock for the step (ms): the provider invocation
    // only, excluding client-side tool execution. The llm span still covers the
    // whole step (model + tools); tool time is `durationMs - modelCallMs`.
    // v7-only (derived from the language-model-call lifecycle); absent in
    // v4-v6 wrap and in non-model spans.
    modelCallMs: z.number().int().nonnegative().optional(),

    // Official AI SDK step `performance` statistics (v7 beta/canary only; absent on
    // v4-v6 wrap, older v7, and non-model spans). `responseTimeMs` is the
    // provider response wall-clock and also feeds `modelCallMs`. The TPS fields
    // are floats (rates, not counts). `chunkJitter` is the inter-output-chunk
    // gap distribution for streaming steps with >=2 chunks; values are ms and
    // may be fractional (avg in particular), rounded to integers at ingest for
    // the UInt32 columns (avg kept as a float).
    responseTimeMs: z.number().int().nonnegative().optional(),
    effectiveOutputTps: z.number().nonnegative().optional(),
    effectiveTotalTps: z.number().nonnegative().optional(),
    outputTps: z.number().nonnegative().optional(),
    inputTps: z.number().nonnegative().optional(),
    chunkJitter: z
      .object({
        min: z.number().nonnegative(),
        p10: z.number().nonnegative(),
        median: z.number().nonnegative(),
        avg: z.number().nonnegative(),
        p90: z.number().nonnegative(),
        max: z.number().nonnegative(),
      })
      .strict()
      .optional(),

    // OpenAI-style model build fingerprint (provider metadata). Lets a drift in
    // the served model weights be detected across otherwise-identical calls.
    systemFingerprint: z.string().max(256).optional(),

    // JSON blob of provider safety ratings (Google/others), as reported. No
    // logprobs are captured. Absent when the provider reports none.
    safetyMetadata: z.string().max(16_384).optional(),

    // JSON array of RAG/grounding citations (StepResult.sources): url/document
    // references the model grounded on. Recorded only when output capture is on.
    sources: z.string().max(MAX_PAYLOAD_CHARS).optional(),

    // Rate-limit headroom, normalized cross-provider from the response headers
    // (OpenAI `x-ratelimit-*`, Anthropic `anthropic-ratelimit-*`). Only the
    // rate-limit headers are read — no other headers are stored. `*ResetMs` is
    // milliseconds until the window resets. Any subset may be present.
    rateLimit: z
      .object({
        requestsLimit: z.number().int().nonnegative().optional(),
        requestsRemaining: z.number().int().nonnegative().optional(),
        requestsResetMs: z.number().int().nonnegative().optional(),
        tokensLimit: z.number().int().nonnegative().optional(),
        tokensRemaining: z.number().int().nonnegative().optional(),
        tokensResetMs: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),

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

    traceName: z.string().max(256).optional(),
    agentName: z.string().max(256).optional(),
    workflowName: z.string().max(256).optional(),
    workflowRunId: z.string().max(128).optional(),
    sessionId: z.string().max(128).optional(),

    metadata: metadataSchema.optional(),

    spans: z.array(spanSchema).min(1).max(2000),
  })
  .strict()
  .superRefine((t, ctx) => {
    // Every trace must be identifiable: a plain named trace (traceName) or a
    // trace classified under an agent (agentName). The effective display label
    // downstream is `traceName ?? agentName`.
    if (!t.traceName && !t.agentName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either traceName or agentName must be provided",
        path: ["traceName"],
      });
    }
    // Workflow grouping is all-or-nothing: a run id without a name (or vice
    // versa) can't be attributed to a workflow.
    if (Boolean(t.workflowName) !== Boolean(t.workflowRunId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "workflowName and workflowRunId must be provided together",
        path: ["workflowRunId"],
      });
    }
  });
export type Trace = z.infer<typeof traceSchema>;

export const INGEST_VERSION = "v1" as const;

export const ingestPayloadSchema = z
  .object({
    version: z.literal(INGEST_VERSION),
    traces: z.array(traceSchema).min(1).max(1000),
  })
  .strict();
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
