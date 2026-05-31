import type { Preset } from "./presets";
import type { ExtractedContext, ScoringTarget } from "./types";

// Context-extraction engine: resolves the fields a preset needs from a target
// (+ its sibling spans). The tricky case is RAG presets (faithfulness,
// context-relevance) whose "context" lives in OTHER spans of the same trace —
// typically the retrieval (embedding) or tool steps that ran before the target.

export type ContextSpec = {
  // Which sibling span types supply retrieved context (default embedding+tool).
  spanTypes?: string[];
  // Metadata key holding the reference answer (default "reference").
  referenceKey?: string;
};

const DEFAULT_CONTEXT_SPAN_TYPES = ["embedding", "tool"];
const DEFAULT_REFERENCE_KEY = "reference";

// Span payloads are JSON-encoded by the SDK. For judge readability, unwrap a
// JSON string to its text; otherwise pass the raw payload through.
function humanize(payload: string): string {
  if (!payload) return "";
  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed === "string") return parsed;
  } catch {
    /* not JSON — use as-is */
  }
  return payload;
}

export function buildContext(
  target: ScoringTarget,
  preset: Preset,
  spec: ContextSpec = {},
): ExtractedContext {
  const extracted: ExtractedContext = {
    input: humanize(target.input),
    output: humanize(target.output),
  };

  if (preset.needsContext) {
    const types = new Set(spec.spanTypes ?? DEFAULT_CONTEXT_SPAN_TYPES);
    const chunks = target.siblings
      .filter(
        (s) =>
          s.spanId !== target.targetId &&
          types.has(s.spanType) &&
          s.startTimeMs <= target.startTimeMs,
      )
      .sort((a, b) => a.startTimeMs - b.startTimeMs)
      .map((s) => humanize(s.output))
      .filter(Boolean);
    extracted.context = chunks.join("\n\n---\n\n");
  }

  if (preset.needsReference) {
    const key = spec.referenceKey ?? DEFAULT_REFERENCE_KEY;
    extracted.reference = target.metadata[key] ?? "";
  }

  return extracted;
}
