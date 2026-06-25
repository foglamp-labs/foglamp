// Plain, dependency-free mirror of the @foglamp/contracts v1 wire shapes.
//
// The SDK only *produces* ingest payloads (it never validates them), so it
// carries these as plain TypeScript types rather than importing the zod-derived
// contract types. That keeps zod — and any other workspace code — out of the
// published `.d.ts`, so consumers need only `ai` as a peer dep.
//
// `contract-conformance.ts` asserts at type-check time that these stay
// structurally identical to the contract; drift fails `check-types`.

export type Metadata = Record<string, string>;

export interface Customer {
  id: string;
  name?: string;
  imageUrl?: string;
}

export type SpanType = "agent" | "llm" | "tool" | "embedding" | "other";
export type SpanStatus = "ok" | "error" | "aborted";

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  imageCount?: number;
  webSearchCount?: number;
  requestCount?: number;
}

export interface Span {
  spanId: string;
  parentSpanId?: string;
  spanType: SpanType;
  name: string;
  /** Epoch milliseconds. */
  startTime: number;
  endTime: number;
  status: SpanStatus;
  errorMessage?: string;
  provider?: string;
  modelId?: string;
  usage?: Usage;
  ttftMs?: number;
  /** Intra-stream samples (streaming llm spans). ms from step start, parallel to chunkTokens. */
  chunkOffsets?: number[];
  /** Cumulative output tokens at each chunkOffsets entry. */
  chunkTokens?: number[];
  /** Reasoning-stream samples (reasoning models). ms from step start, parallel to reasoningChunkTokens. */
  reasoningOffsets?: number[];
  /** Cumulative reasoning tokens at each reasoningOffsets entry. */
  reasoningChunkTokens?: number[];
  /** Total wall-clock ms spent inside reasoning blocks for this step. */
  reasoningDurationMs?: number;
  input?: string;
  output?: string;
  /** JSON catalog of tools offered to the model (name → {description, params}). */
  toolCatalog?: string;
  /** Pure model-call wall-clock for the step (ms), excluding tool execution. v7 only. */
  modelCallMs?: number;
  /**
   * Official provider response time (ms) from the AI SDK step `performance`
   * object: time spent waiting for the language-model response. Also feeds
   * `modelCallMs` (preferred over the derived value). v7 beta/canary only; absent on
   * v4–v6 wrap and older v7.
   */
  responseTimeMs?: number;
  /** Effective output tokens/sec over the full response (outputTokens/requestSeconds). v7 beta/canary only. */
  effectiveOutputTps?: number;
  /** Effective (input+output) tokens/sec over the full response. v7 beta/canary only. */
  effectiveTotalTps?: number;
  /** Output tokens/sec after the first output chunk; streaming steps only. v7 beta/canary only. */
  outputTps?: number;
  /** Input tokens/sec before the first output chunk (prefill rate); streaming steps only. v7 beta/canary only. */
  inputTps?: number;
  /**
   * Inter-output-chunk gap statistics (ms) from `performance`; present only for
   * streaming steps with ≥2 output chunks. v7 beta/canary only.
   */
  chunkJitter?: {
    min: number;
    p10: number;
    median: number;
    avg: number;
    p90: number;
    max: number;
  };
  /** OpenAI-style model build fingerprint (drift detection). */
  systemFingerprint?: string;
  /** JSON blob of provider safety ratings, as reported (no logprobs). */
  safetyMetadata?: string;
  /** JSON array of RAG/grounding citations (StepResult.sources); output-capture gated. */
  sources?: string;
  /** Rate-limit headroom, normalized cross-provider from response headers. */
  rateLimit?: {
    requestsLimit?: number;
    requestsRemaining?: number;
    requestsResetMs?: number;
    tokensLimit?: number;
    tokensRemaining?: number;
    tokensResetMs?: number;
  };
  metadata?: Metadata;
}

export interface Trace {
  traceId: string;
  traceName?: string;
  agentName?: string;
  workflowName?: string;
  workflowRunId?: string;
  sessionId?: string;
  customer?: Customer;
  metadata?: Metadata;
  spans: Span[];
}

export interface IngestPayload {
  version: "v1";
  traces: Trace[];
}
