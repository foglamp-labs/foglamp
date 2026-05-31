"use client";

import { IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { Slider } from "@foglamp/ui/components/slider";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { formatDuration, formatTokens, formatTps } from "@/lib/format";
import {
  computeWindow,
  hasChunkSamples,
  orderSpans,
  toMs,
  tokensAtOffset,
  type TraceSpan,
} from "@/lib/trace-timeline";

const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

const typeVariant: Record<string, "violet" | "blue" | "amber" | "secondary"> = {
  llm: "violet",
  tool: "blue",
  agent: "amber",
};

/**
 * Time-accurate playback of a trace: spans grow over their real start/end
 * timing, the TTFT wait is marked on llm bars, and steps with intra-stream
 * samples surface a live token count + instantaneous TPS as the playhead
 * crosses them. Pure client animation over already-fetched span data.
 */
export function TraceReplay({
  spans,
  autoPlay = false,
}: {
  spans: TraceSpan[];
  autoPlay?: boolean;
}) {
  const reduce = useReducedMotion();
  const window = useMemo(() => computeWindow(spans), [spans]);
  const ordered = useMemo(() => orderSpans(spans), [spans]);
  const total = window.span;

  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(autoPlay && !reduce);
  const [speed, setSpeed] = useState<Speed>(1);
  const lastFrame = useRef<number | null>(null);

  // rAF playback loop. Advances `elapsed` by wall-clock × speed; stops at the
  // end. The DOM is small (one row per span) so a per-frame re-render is fine.
  useEffect(() => {
    if (!playing) {
      lastFrame.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const prev = lastFrame.current ?? now;
      lastFrame.current = now;
      setElapsed((e) => {
        const next = e + (now - prev) * speed;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, total]);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && elapsed >= total) setElapsed(0); // replay from the start
      return !p;
    });
  }, [elapsed, total]);

  const onScrub = useCallback(
    (value: number | readonly number[]) => {
      const pct = Array.isArray(value) ? (value[0] ?? 0) : (value as number);
      setPlaying(false);
      setElapsed((pct / 100) * total);
    },
    [total],
  );

  const progress = Math.min((elapsed / total) * 100, 100);

  // The llm step currently generating (if any) and its live readout.
  const live = useMemo(() => {
    for (const s of spans) {
      if (s.spanType !== "llm") continue;
      const startRel = toMs(s.startTime) - window.start;
      const endRel = startRel + s.durationMs;
      if (elapsed < startRel || elapsed > endRel || !hasChunkSamples(s)) continue;
      const offset = elapsed - startRel;
      const tokens = tokensAtOffset(s, offset);
      const past = offset - (s.ttftMs ?? 0);
      return {
        name: s.name,
        tokens,
        tps: past > 0 ? (tokens / past) * 1000 : null,
      };
    }
    return null;
  }, [spans, elapsed, window.start]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Replay</CardTitle>
        <CardAction className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <Button
              key={s}
              type="button"
              size="xs"
              variant={speed === s ? "secondary" : "ghost"}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </Button>
          ))}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            onClick={toggle}
            aria-label={playing ? "Pause replay" : "Play replay"}
          >
            {playing ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
          </Button>
          <Slider
            className="flex-1"
            value={[progress]}
            min={0}
            max={100}
            step={0.1}
            onValueChange={onScrub}
            aria-label="Replay position"
          />
          <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">
            {formatDuration(elapsed)} / {formatDuration(total)}
          </span>
        </div>

        <div className="flex h-5 items-center text-xs text-muted-foreground">
          {live ? (
            <span className="tabular-nums">
              <span className="text-foreground">{live.name}</span> ·{" "}
              {formatTokens(Math.round(live.tokens))} tok
              {live.tps !== null && <> · {formatTps(live.tps)}</>}
            </span>
          ) : (
            <span>{elapsed >= total ? "Done" : "Streaming…"}</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          {ordered.map(({ span, depth }) => {
            const startRel = toMs(span.startTime) - window.start;
            const endRel = startRel + span.durationMs;
            const started = elapsed >= startRel;
            const offset = (startRel / total) * 100;
            const fillEnd = Math.min(Math.max(elapsed, startRel), endRel);
            const fillWidth = Math.max(((fillEnd - startRel) / total) * 100, started ? 0.8 : 0);
            const ttftRel = span.ttftMs != null ? startRel + span.ttftMs : null;
            const ttftShown = ttftRel != null && elapsed >= ttftRel;
            return (
              <div
                key={span.spanId}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_2fr] items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-opacity",
                  started ? "opacity-100" : "opacity-35",
                )}
              >
                <div
                  className="flex items-center gap-2 truncate"
                  style={{ paddingLeft: depth * 14 }}
                >
                  <Badge variant={typeVariant[span.spanType] ?? "secondary"}>
                    {span.spanType}
                  </Badge>
                  <span className="truncate">{span.name}</span>
                </div>
                <div className="relative h-2.5">
                  {started && (
                    <div
                      className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary/70"
                      style={{ left: `${offset}%`, width: `${fillWidth}%` }}
                    />
                  )}
                  {ttftShown && (
                    <div
                      className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-amber-500"
                      style={{ left: `${(ttftRel! / total) * 100}%` }}
                      title="First token"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
