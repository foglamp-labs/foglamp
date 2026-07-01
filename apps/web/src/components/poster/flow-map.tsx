"use client";

import type { PosterData } from "@foglamp/contracts/poster";
import { Badge } from "@foglamp/ui/components/badge";
import { cn } from "@foglamp/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

import { Favicon } from "./brand";
import { foldGraph, type FoldedNode } from "./fold-graph";
import { KIND_STYLES } from "./kinds";
import { arrowHead, edgePath, layoutGraph, type SizedNode } from "./layout";

const EDGE_STYLE = {
  fill: "none",
  stroke: "rgba(120,124,136,0.5)",
  strokeWidth: 1.6,
} as const;

const NODE_W = 232;
const HEAD_H = 56;
const CHIP_ROW_H = 28;

type Transform = { x: number; y: number; k: number };
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// Chips stack one per row (they can be wide), so the node grows by one row per
// embedded model/tool — guarantees nothing clips.
function nodeHeight(n: FoldedNode): number {
  if (n.embeds.length === 0) return HEAD_H;
  return HEAD_H + n.embeds.length * CHIP_ROW_H + 8;
}

export function FlowMap({ graph }: { graph: PosterData["graph"] }) {
  const folded = useMemo(() => foldGraph(graph), [graph]);

  const layout = useMemo(() => {
    const sized = folded.nodes.map((n): FoldedNode & SizedNode => ({
      ...n,
      width: NODE_W,
      height: nodeHeight(n),
    }));
    return layoutGraph(sized, folded.edges);
  }, [folded]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const fitted = useRef(false);
  const drag = useRef<{
    px: number;
    py: number;
    tx: number;
    ty: number;
  } | null>(null);

  // Fit the graph into the visible area (right of the floating sidebar) once.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || fitted.current || layout.width === 0) return;
    const padL = 432; // clear the sidebar
    const padR = 48;
    const padY = 56;
    const availW = Math.max(200, el.clientWidth - padL - padR);
    const availH = Math.max(200, el.clientHeight - padY * 2);
    const k = clamp(
      Math.min(availW / layout.width, availH / layout.height),
      0.2,
      1.4
    );
    setT({
      x: padL + (availW - layout.width * k) / 2,
      y: padY + (availH - layout.height * k) / 2,
      k,
    });
    fitted.current = true;
  }, [layout]);

  // Wheel zoom (and trackpad pinch, which arrives as ctrlKey+wheel). Native
  // listener so we can preventDefault (React's onWheel is passive).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setT((prev) => {
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018));
        const k = clamp(prev.k * factor, 0.2, 3);
        const ratio = k / prev.k;
        return {
          k,
          x: cx - (cx - prev.x) * ratio,
          y: cy - (cy - prev.y) * ratio,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, tx: t.x, ty: t.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setT((prev) => ({
      ...prev,
      x: d.tx + (e.clientX - d.px),
      y: d.ty + (e.clientY - d.py),
    }));
  }
  function endDrag() {
    drag.current = null;
  }

  return (
    <section className="absolute inset-0 z-10">
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="absolute inset-0 cursor-grab touch-none overflow-hidden bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[24px_24px] active:cursor-grabbing"
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})`,
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            {layout.edges.map((e, i) => (
              <g key={i}>
                <path
                  d={edgePath(e.points)}
                  style={EDGE_STYLE}
                  strokeLinecap="round"
                />
                <path
                  d={arrowHead(e.points)}
                  style={EDGE_STYLE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
          </svg>

          {layout.edges.map((e, i) => {
            if (!e.label || e.points.length === 0) return null;
            const mid = e.points[Math.floor(e.points.length / 2)]!;
            return (
              <span
                key={`l${i}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border bg-card px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                style={{ left: mid.x, top: mid.y }}
              >
                {e.label}
              </span>
            );
          })}

          {layout.nodes.map((n) => {
            const style = KIND_STYLES[n.kind];
            const Glyph = style.Glyph;
            return (
              <div
                key={n.id}
                className="absolute flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
                style={{
                  left: n.x,
                  top: n.y,
                  width: n.width,
                  height: n.height,
                }}
              >
                <span
                  className={cn("absolute inset-y-0 left-0 w-1", style.bar)}
                />
                <div className="flex h-14 flex-none items-center gap-3 px-3.5">
                  <span
                    className={cn(
                      "flex size-8 flex-none items-center justify-center rounded-lg",
                      style.icon
                    )}
                  >
                    <Favicon
                      domain={n.domain}
                      className="size-4 rounded-sm"
                      fallback={<Glyph className="size-4" stroke={2} />}
                    />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">
                      {n.label}
                    </span>
                    {n.sub ? (
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {n.sub}
                      </span>
                    ) : null}
                  </span>
                </div>
                {n.embeds.length > 0 ? (
                  <div className="flex flex-1 flex-col items-start gap-1.5 px-3 pb-2.5">
                    {n.embeds.map((em) => {
                      const EmGlyph = KIND_STYLES[em.kind].Glyph;
                      return (
                        <Badge
                          key={em.id}
                          variant={KIND_STYLES[em.kind].badge}
                          size="md"
                          className="max-w-full font-normal normal-case"
                        >
                          <Favicon
                            domain={em.domain}
                            className="size-3 rounded-sm"
                            fallback={<EmGlyph />}
                          />
                          {em.label}
                        </Badge>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
