// Shared timeline math for the trace waterfall and the replay view. Span shape
// is inferred from the tRPC router output so it tracks the server contract
// (including chunkOffsets/chunkTokens/tps) without a manual re-declaration.

import type { RouterOutputs } from "@/utils/trpc";

export type TraceSpan = RouterOutputs["traces"]["get"]["spans"][number];

/** ClickHouse datetime string ('YYYY-MM-DD HH:MM:SS', UTC) → epoch ms. */
export function toMs(value: string): number {
  return new Date(`${value.replace(" ", "T")}Z`).getTime();
}

/** Order spans depth-first by parent so the waterfall reads top-to-bottom. */
export function orderSpans(spans: TraceSpan[]): { span: TraceSpan; depth: number }[] {
  const children = new Map<string, TraceSpan[]>();
  const roots: TraceSpan[] = [];
  for (const s of spans) {
    if (s.parentSpanId && spans.some((p) => p.spanId === s.parentSpanId)) {
      const list = children.get(s.parentSpanId) ?? [];
      list.push(s);
      children.set(s.parentSpanId, list);
    } else {
      roots.push(s);
    }
  }
  const byStart = (a: TraceSpan, b: TraceSpan) => toMs(a.startTime) - toMs(b.startTime);
  const out: { span: TraceSpan; depth: number }[] = [];
  const walk = (s: TraceSpan, depth: number) => {
    out.push({ span: s, depth });
    (children.get(s.spanId) ?? []).sort(byStart).forEach((c) => walk(c, depth + 1));
  };
  roots.sort(byStart).forEach((r) => walk(r, 0));
  return out;
}

/** Trace-relative window: absolute start (ms) and total span (ms, min 1). */
export function computeWindow(spans: TraceSpan[]): { start: number; span: number } {
  if (spans.length === 0) return { start: 0, span: 1 };
  const start = Math.min(...spans.map((s) => toMs(s.startTime)));
  const end = Math.max(...spans.map((s) => toMs(s.endTime)));
  return { start, span: Math.max(end - start, 1) };
}

/** True when a span carries usable intra-stream samples (≥2 points to draw). */
export function hasChunkSamples(span: TraceSpan): boolean {
  return span.chunkOffsets.length > 1 && span.chunkOffsets.length === span.chunkTokens.length;
}

/**
 * Cumulative output tokens at `offsetMs` from step start, linearly interpolated
 * between samples. Returns 0 before the first sample and the final token count
 * after the last. Caller should guard with hasChunkSamples first.
 */
export function tokensAtOffset(span: TraceSpan, offsetMs: number): number {
  const offsets = span.chunkOffsets;
  const tokens = span.chunkTokens;
  if (offsets.length === 0) return 0;
  if (offsetMs <= offsets[0]!) return offsetMs <= 0 ? 0 : tokens[0]!;
  const lastIdx = offsets.length - 1;
  if (offsetMs >= offsets[lastIdx]!) return tokens[lastIdx]!;
  // Linear scan is fine: arrays are capped at 200 entries.
  for (let i = 1; i < offsets.length; i++) {
    const x1 = offsets[i]!;
    if (offsetMs <= x1) {
      const x0 = offsets[i - 1]!;
      const y0 = tokens[i - 1]!;
      const y1 = tokens[i]!;
      const t = x1 === x0 ? 0 : (offsetMs - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return tokens[lastIdx]!;
}
