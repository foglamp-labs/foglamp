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

export type SpanType = "agent" | "llm" | "tool" | "embedding" | "other";
export type SpanStatus = "ok" | "error";

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
  input?: string;
  output?: string;
  metadata?: Metadata;
}

export interface Trace {
  traceId: string;
  traceName?: string;
  agentName?: string;
  workflowName?: string;
  workflowRunId?: string;
  sessionId?: string;
  metadata?: Metadata;
  spans: Span[];
}

export interface IngestPayload {
  version: "v1";
  traces: Trace[];
}
