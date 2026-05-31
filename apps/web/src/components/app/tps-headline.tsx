"use client";

import { useMemo } from "react";

import { formatDuration, formatTps } from "@/lib/format";
import { hasChunkSamples, type TraceSpan } from "@/lib/trace-timeline";

// Instantaneous tokens/sec between consecutive samples: Δtokens / Δseconds.
// Returns one point per interval (length = samples - 1), positioned at the
// interval's end offset.
function instantaneousTps(span: TraceSpan): { ms: number; tps: number }[] {
  const offsets = span.chunkOffsets;
  const tokens = span.chunkTokens;
  const out: { ms: number; tps: number }[] = [];
  for (let i = 1; i < offsets.length; i++) {
    const dt = (offsets[i]! - offsets[i - 1]!) / 1000;
    if (dt <= 0) continue;
    out.push({ ms: offsets[i]!, tps: (tokens[i]! - tokens[i - 1]!) / dt });
  }
  return out;
}

/**
 * Headline generation-TPS for an llm span plus, when the span carries
 * intra-stream samples, a compact throughput sparkline. Renders nothing for
 * non-llm spans; shows an explicit empty state when samples are absent.
 */
export function TpsHeadline({ span }: { span: TraceSpan }) {
  const series = useMemo(
    () => (hasChunkSamples(span) ? instantaneousTps(span) : []),
    [span],
  );

  if (span.spanType !== "llm" || span.outputTokens <= 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">Generation throughput</span>
        <span className="text-2xl font-semibold tabular-nums">
          {formatTps(span.tps)}
        </span>
      </div>
      {series.length > 1 ? (
        <TpsSparkline series={series} />
      ) : (
        <p className="text-xs text-muted-foreground">
          No streaming data captured for this step.
        </p>
      )}
    </div>
  );
}

/** Dependency-free SVG sparkline of instantaneous TPS over the stream. */
export function TpsSparkline({
  series,
  className,
}: {
  series: { ms: number; tps: number }[];
  className?: string;
}) {
  const W = 100;
  const H = 28;
  const { path, peak, peakMs } = useMemo(() => {
    const xs = series.map((p) => p.ms);
    const ys = series.map((p) => p.tps);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys, 1);
    const spanX = Math.max(maxX - minX, 1);
    const peakIdx = ys.indexOf(Math.max(...ys));
    const d = series
      .map((p, i) => {
        const x = ((p.ms - minX) / spanX) * W;
        const y = H - (p.tps / maxY) * (H - 2) - 1;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    return { path: d, peak: maxY, peakMs: series[peakIdx]?.ms ?? 0 };
  }, [series]);

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-7 w-full text-primary"
        role="img"
        aria-label={`Peak ${Math.round(peak)} tokens per second at ${formatDuration(peakMs)}`}
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>peak {Math.round(peak)} tok/s</span>
        <span>{formatDuration(peakMs)}</span>
      </div>
    </div>
  );
}
