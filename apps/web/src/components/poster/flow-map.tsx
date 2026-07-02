"use client";

import type { NodeKind, PosterData } from "@foglamp/contracts/poster";
import { cn } from "@foglamp/ui/lib/utils";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Favicon } from "./brand";
import { modelDomain } from "./favicon";
import { foldGraph, type FoldedNode } from "./fold-graph";
import { KIND_STYLES } from "./kinds";
import {
  arrowHead,
  edgePath,
  type Layout,
  layoutGraph,
  type SizedNode,
} from "./layout";

const EDGE_STROKE = "rgba(120,124,136,0.35)";

const HEAD_H = 56;
const CHIP_ROW_H = 22;

type Transform = { x: number; y: number; k: number };
type GraphNode = FoldedNode & SizedNode;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// Chips stack one per row (they can be wide), so the node grows by one row per
// embedded model/tool — guarantees nothing clips.
function nodeHeight(n: FoldedNode): number {
  if (n.embeds.length === 0) return HEAD_H;
  return HEAD_H + n.embeds.length * CHIP_ROW_H + 14;
}

export function FlowMap({
  graph,
  focusKind,
}: {
  graph: PosterData["graph"];
  focusKind: NodeKind | null;
}) {
  const folded = useMemo(() => foldGraph(graph), [graph]);

  // ELK layout is async — render nothing until it resolves (the entrance
  // animation then plays from a clean slate). Nodes are sized by degree so
  // hubs read bigger.
  const [layout, setLayout] = useState<Layout<GraphNode> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const degree = new Map<string, number>();
    for (const e of folded.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const sized = folded.nodes.map(
      (n): GraphNode => ({
        ...n,
        width: 208 + Math.min(degree.get(n.id) ?? 0, 6) * 7,
        height: nodeHeight(n),
      })
    );
    layoutGraph(sized, folded.edges).then((l) => {
      if (!cancelled) setLayout(l);
    });
    return () => {
      cancelled = true;
    };
  }, [folded]);

  // Entrance choreography: things appear left-to-right, following the flow.
  const delayAt = (x: number) =>
    0.15 + (x / Math.max(1, layout?.width ?? 1)) * 0.9;
  const nodeById = useMemo(
    () => new Map((layout?.nodes ?? []).map((n) => [n.id, n])),
    [layout]
  );

  // Swimlanes: one faint alternating band per layer (nodes clustered by x).
  const lanes = useMemo(() => {
    if (!layout) return [];
    const xs = new Map<number, { min: number; max: number }>();
    for (const n of layout.nodes) {
      const key = Math.round(n.x / 40) * 40;
      const cur = xs.get(key);
      const min = n.x;
      const max = n.x + n.width;
      if (!cur) xs.set(key, { min, max });
      else
        xs.set(key, { min: Math.min(cur.min, min), max: Math.max(cur.max, max) });
    }
    return [...xs.values()].sort((a, b) => a.min - b.min);
  }, [layout]);

  // Spotlight: hovering a node dims everything not connected to it.
  const [hovered, setHovered] = useState<string | null>(null);
  const related = useMemo(() => {
    if (!hovered) return null;
    const set = new Set([hovered]);
    for (const e of folded.edges) {
      if (e.from === hovered) set.add(e.to);
      if (e.to === hovered) set.add(e.from);
    }
    return set;
  }, [hovered, folded.edges]);

  // Trace: clicking a node lights its full downstream path (BFS along edge
  // direction) and opens a detail popover. Click again (or the canvas) clears.
  const [traceRoot, setTraceRoot] = useState<string | null>(null);
  const trace = useMemo(() => {
    if (!traceRoot) return null;
    const nodes = new Set([traceRoot]);
    const edges = new Set<number>();
    const queue = [traceRoot];
    while (queue.length) {
      const cur = queue.shift()!;
      folded.edges.forEach((e, i) => {
        if (e.from !== cur) return;
        edges.add(i);
        if (!nodes.has(e.to)) {
          nodes.add(e.to);
          queue.push(e.to);
        }
      });
    }
    return { nodes, edges };
  }, [traceRoot, folded.edges]);

  // Legend focus: a node matches if it IS the kind or embeds it.
  const kindActive = useMemo(() => {
    if (!focusKind) return null;
    return new Set(
      folded.nodes
        .filter(
          (n) =>
            n.kind === focusKind ||
            n.embeds.some((em) => em.kind === focusKind)
        )
        .map((n) => n.id)
    );
  }, [focusKind, folded.nodes]);

  const nodeActive = (id: string) =>
    (!related || related.has(id)) &&
    (!kindActive || kindActive.has(id)) &&
    (!trace || trace.nodes.has(id));
  const edgeActive = (e: { from: string; to: string }, i: number) =>
    (!hovered || e.from === hovered || e.to === hovered) &&
    (!kindActive || kindActive.has(e.from) || kindActive.has(e.to)) &&
    (!trace || trace.edges.has(i));

  const viewportRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const fitted = useRef(false);
  const drag = useRef<{
    px: number;
    py: number;
    tx: number;
    ty: number;
    moved: boolean;
  } | null>(null);

  // Fit the graph into the visible area (right of the floating sidebar) once.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || fitted.current || !layout || layout.width === 0) return;
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
    drag.current = {
      px: e.clientX,
      py: e.clientY,
      tx: t.x,
      ty: t.y,
      moved: false,
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.px, e.clientY - d.py) > 4) d.moved = true;
    setT((prev) => ({
      ...prev,
      x: d.tx + (e.clientX - d.px),
      y: d.ty + (e.clientY - d.py),
    }));
  }
  function endDrag() {
    // A stationary pointer-up on the canvas clears the trace.
    if (drag.current && !drag.current.moved) setTraceRoot(null);
    drag.current = null;
  }

  const tracedNode = traceRoot ? nodeById.get(traceRoot) : null;

  return (
    <section className="absolute inset-0 z-10">
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => {
          drag.current = null;
        }}
        className="absolute inset-0 cursor-grab touch-none overflow-hidden bg-[linear-gradient(color-mix(in_oklab,var(--border)_28%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--border)_28%,transparent)_1px,transparent_1px)] bg-size-[56px_56px] [background-position:center] active:cursor-grabbing"
      >
        {layout ? (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})`,
            }}
          >
            {/* swimlanes — one faint band per alternating layer */}
            {lanes.map((lane, i) =>
              i % 2 === 1 ? (
                <div
                  key={i}
                  className="absolute rounded-2xl bg-foreground/[0.02]"
                  style={{
                    left: lane.min - 18,
                    width: lane.max - lane.min + 36,
                    top: -24,
                    height: layout.height + 48,
                  }}
                />
              ) : null
            )}

            <svg
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              {layout.edges.map((e, i) => {
                const d = edgePath(e.points);
                const sourceKind = nodeById.get(e.from)?.kind ?? "entry";
                const delay = delayAt(nodeById.get(e.from)?.x ?? 0) + 0.25;
                const active = edgeActive(e, i);
                return (
                  <g
                    key={i}
                    className="transition-opacity duration-300"
                    opacity={active ? 1 : 0.15}
                  >
                    {/* base edge, draws itself in */}
                    <motion.path
                      d={d}
                      fill="none"
                      stroke={EDGE_STROKE}
                      strokeWidth={1.4}
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.6, delay, ease: "easeOut" }}
                    />
                    {/* traveling pulse, tinted by the source node's kind */}
                    <motion.path
                      d={d}
                      fill="none"
                      stroke={KIND_STYLES[sourceKind].hex}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeDasharray="5 72"
                      strokeOpacity={0.7}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, strokeDashoffset: [0, -77] }}
                      transition={{
                        opacity: { delay: delay + 0.7, duration: 0.4 },
                        strokeDashoffset: {
                          delay: delay + 0.7,
                          duration: 2.4,
                          repeat: Infinity,
                          ease: "linear",
                        },
                      }}
                    />
                    <motion.path
                      d={arrowHead(e.points)}
                      fill="none"
                      stroke={EDGE_STROKE}
                      strokeWidth={1.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: delay + 0.5, duration: 0.3 }}
                    />
                  </g>
                );
              })}
            </svg>

            {layout.edges.map((e, i) => {
              if (!e.label || e.points.length === 0) return null;
              const mid = e.points[Math.floor(e.points.length / 2)]!;
              const delay = delayAt(nodeById.get(e.from)?.x ?? 0) + 0.6;
              return (
                <motion.span
                  key={`l${i}`}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground/80 transition-opacity duration-300",
                    !edgeActive(e, i) && "opacity-15"
                  )}
                  style={{ left: mid.x, top: mid.y }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay, duration: 0.3 }}
                >
                  {e.label}
                </motion.span>
              );
            })}

            {layout.nodes.map((n) => {
              const style = KIND_STYLES[n.kind];
              const Glyph = style.Glyph;
              const dim = !nodeActive(n.id);
              return (
                <motion.div
                  key={n.id}
                  className="absolute"
                  style={{
                    left: n.x,
                    top: n.y,
                    width: n.width,
                    height: n.height,
                  }}
                  initial={{ opacity: 0, scale: 0.85, filter: "blur(6px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  transition={{
                    type: "spring",
                    duration: 0.55,
                    bounce: 0.25,
                    delay: delayAt(n.x),
                  }}
                >
                  <div
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                    onPointerUp={(e) => {
                      if (drag.current?.moved) return;
                      e.stopPropagation();
                      drag.current = null;
                      setTraceRoot((cur) => (cur === n.id ? null : n.id));
                    }}
                    className={cn(
                      "border-overlay flex h-full flex-col overflow-hidden rounded-2xl corner-squircle bg-card text-card-foreground shadow-(--custom-shadow) transition-opacity duration-300",
                      dim && "opacity-25"
                    )}
                  >
                    <div className="flex h-14 flex-none items-center gap-2.5 px-4">
                      <span
                        className={cn(
                          "flex size-7 flex-none items-center justify-center rounded-md",
                          style.icon
                        )}
                      >
                        <Favicon
                          domain={
                            n.kind === "model"
                              ? modelDomain(n.label, n.domain)
                              : n.domain
                          }
                          className="size-3.5 rounded-sm"
                          fallback={<Glyph className="size-3.5" stroke={2} />}
                        />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium leading-snug">
                          {n.label}
                        </span>
                        {n.sub ? (
                          <span className="truncate text-xs leading-snug text-muted-foreground">
                            {n.sub}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {n.embeds.length > 0 ? (
                      <div className="mx-4 flex flex-1 flex-col items-start gap-2 border-t border-muted pt-2.5">
                        {n.embeds.map((em) => {
                          const EmGlyph = KIND_STYLES[em.kind].Glyph;
                          return (
                            <span
                              key={em.id}
                              className="flex max-w-full items-center gap-1.5"
                            >
                              <Favicon
                                domain={
                                  em.kind === "model"
                                    ? modelDomain(em.label, em.domain)
                                    : em.domain
                                }
                                className="size-3.5 rounded-sm"
                                fallback={
                                  <EmGlyph
                                    className="size-3.5 text-muted-foreground"
                                    stroke={2}
                                  />
                                }
                              />
                              <span className="truncate text-xs font-medium">
                                {em.label}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              );
            })}

            {/* detail popover for the traced node */}
            {tracedNode ? (
              <motion.div
                key={tracedNode.id}
                className="border-overlay absolute z-30 w-60 rounded-xl bg-card p-3 shadow-(--custom-shadow)"
                style={{
                  left: tracedNode.x,
                  top: tracedNode.y + tracedNode.height + 10,
                }}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      KIND_STYLES[tracedNode.kind].bar
                    )}
                  />
                  {KIND_STYLES[tracedNode.kind].label}
                </div>
                <div className="mt-1 text-sm font-medium">
                  {tracedNode.label}
                </div>
                {tracedNode.detail ?? tracedNode.sub ? (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {tracedNode.detail ?? tracedNode.sub}
                  </p>
                ) : null}
              </motion.div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
