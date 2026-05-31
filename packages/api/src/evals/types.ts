// Shared types for the evals scoring engine. A scorer (code or llm) consumes
// an ExtractedContext (built from a trace/span target) and emits a ScoreResult.

export type Provider = "google" | "openai" | "anthropic";

export type ScoreResult = {
  score: number | null; // numeric quality (preset's scale), or null
  passed: boolean | null; // pass/fail verdict, or null
  reason: string;
};

// The fields a scorer reads, normalized from the target (+ sibling spans).
export type ExtractedContext = {
  input: string;
  output: string;
  context?: string; // retrieved context (RAG presets)
  reference?: string; // expected answer (correctness presets)
};

// A normalized trace/span to be scored. `siblings` carries the other spans of
// the same trace so context-dependent presets can pull retrieved context.
export type ScoringTarget = {
  level: "trace" | "span";
  targetId: string;
  traceId: string;
  spanType: string;
  startTimeMs: number;
  input: string;
  output: string;
  metadata: Record<string, string>;
  siblings: SiblingSpan[];
};

export type SiblingSpan = {
  spanId: string;
  spanType: string;
  output: string;
  startTimeMs: number;
};
