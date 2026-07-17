"use client";

import type { NodeKind, ScanData } from "@foglamp/contracts/scan";
import { cn } from "@foglamp/ui/lib/utils";
import { BorderBeam } from "border-beam";
import { motion, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Favicon, ModelIcon } from "./brand";
import { foldGraph, type FoldedNode } from "./fold-graph";
import { KIND_STYLES } from "./kinds";
import {
  arrowHead,
  edgePath,
  labelAnchor,
  type Layout,
  layoutGraph,
  type SizedNode,
} from "./layout";

// Mixed from the OPAQUE background (never from --border, which carries alpha
// in dark mode): translucent strokes stack where routes share a channel,
// reading as doubled lines in different shades. Opaque same-color strokes
// overlap invisibly.
const EDGE_STROKE =
  "color-mix(in oklab, var(--background) 70%, var(--muted-foreground) 30%)";

const HEAD_H = 56;
const CHIP_ROW_H = 24;

type Transform = { x: number; y: number; k: number };
type GraphNode = FoldedNode & SizedNode;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// Chips stack one per row (they can be wide), so the node grows by one row per
// embedded model/tool — guarantees nothing clips.
function nodeHeight(n: FoldedNode): number {
  if (n.embeds.length === 0) return HEAD_H;
  // Chip section: 10px padding top+bottom, 16px rows, 8px gaps → 12 + 24n.
  return HEAD_H + n.embeds.length * CHIP_ROW_H + 12;
}

// Agents "light up" once the map has settled: the same colorful BorderBeam as
// the landing page's copy button, ramped in gently after the node's entrance
// animation and kept subtle.
const AGENT_BEAM_STRENGTH = 0.4;
const AGENT_BEAM_STEP = 0.02;

function AgentBeam({
  delay,
  children,
}: {
  /** Seconds until the beam starts ramping in (after the node's entrance). */
  delay: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  const [strength, setStrength] = useState(0);
  // Per-agent random offset — staggered starts also desync the beams' spin
  // phases, so agents don't all glow in lockstep.
  const jitter = useRef(Math.random() * 4);
  useEffect(() => {
    if (reduce) {
      setStrength(AGENT_BEAM_STRENGTH);
      return;
    }
    let iv: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => {
      iv = setInterval(() => {
        setStrength((s) => {
          const next = +(s + AGENT_BEAM_STEP).toFixed(3);
          if (next >= AGENT_BEAM_STRENGTH) {
            if (iv) clearInterval(iv);
            return AGENT_BEAM_STRENGTH;
          }
          return next;
        });
      }, 16);
    }, (delay + jitter.current) * 1000);
    return () => {
      clearTimeout(t);
      if (iv) clearInterval(iv);
    };
  }, [delay, reduce]);
  return (
    <BorderBeam
      // "md" keeps the glow ON the border (a slow traveling beam) — the
      // pulse presets bloom across the card body, which washed out content.
      size="md"
      colorVariant="colorful"
      theme="auto"
      strength={strength}
      duration={6}
      borderRadius={12}
      // corner-squircle: the beam clips children with a plain 24px radius,
      // which reads rounder than the cards' squircle corners — give its
      // radius the same corner-shape so agent cards match the others.
      className="h-full w-full rounded-3xl "
    >
      {children}
    </BorderBeam>
  );
}

// A discrete traveling beam: a glowing dot that occasionally runs the edge
// path and "hits" the target node (flashing its border in the beam's color).
// Uses a WAAPI offset-path animation — compositor-friendly, unlike the old
// always-on dashed pulse, which repainted the entire full-size SVG every
// frame and made big maps feel laggy. Sparse by design: one run, long rest.
const BEAM_SPEED = 0.25; // px per ms — an unhurried glide
const BEAM_TRAVEL_MIN_MS = 1600;
const BEAM_TRAVEL_MAX_MS = 5000;
const BEAM_REST_MS = 30000; // + up to 25s jitter between runs

function BeamPulse({
  d,
  length,
  color,
  dimmed,
  compact,
  onArrive,
}: {
  d: string;
  /** Polyline length in px — travel time scales with it (constant speed). */
  length: number;
  color: string;
  dimmed: boolean;
  /** Shorter comet for small embeds, where full-size beams read too long. */
  compact?: boolean;
  onArrive: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const arriveRef = useRef(onArrive);
  arriveRef.current = onArrive;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    let stopped = false;
    let anim: Animation | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const travelMs = clamp(
      length / BEAM_SPEED,
      BEAM_TRAVEL_MIN_MS,
      BEAM_TRAVEL_MAX_MS
    );
    const run = () => {
      if (stopped) return;
      anim?.cancel(); // release the previous run's forward-fill
      el.style.opacity = "1";
      // fill: "forwards" holds the beam at the target while the 0.25s opacity
      // fade plays — without it the effect ends first and the beam snaps back
      // to the path start, flashing there mid-fade.
      anim = el.animate(
        [{ offsetDistance: "0%" }, { offsetDistance: "100%" }],
        { duration: travelMs, easing: "ease-in-out", fill: "forwards" }
      );
      anim.onfinish = () => {
        el.style.opacity = "0";
        if (stopped) return;
        arriveRef.current();
        timer = setTimeout(run, BEAM_REST_MS + Math.random() * 25000);
      };
    };
    timer = setTimeout(run, 1200 + Math.random() * BEAM_REST_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      anim?.cancel();
    };
  }, [d, length]);
  return (
    <div className={cn("transition-opacity duration-300", dimmed && "opacity-15")}>
      {/* A comet, not a dot: a pill rotated along the path (offsetRotate auto
          keeps its x-axis on the travel direction), bright at the leading
          edge with a fading tail. */}
      <div
        ref={ref}
        className={cn(
          "pointer-events-none absolute top-0 left-0 h-[3px] rounded-full",
          compact ? "w-4" : "w-8"
        )}
        style={{
          offsetPath: `path("${d}")`,
          offsetRotate: "auto",
          background: `linear-gradient(to right, transparent, ${color})`,
          boxShadow: `0 0 10px ${color}66`,
          opacity: 0,
          transition: "opacity 0.25s ease",
        }}
      />
    </div>
  );
}

export function FlowMap({
  graph,
  focusKinds,
  embedded = false,
  frame = false,
  direction = "RIGHT",
}: {
  graph: ScanData["graph"];
  focusKinds: NodeKind[] | null;
  /**
   * Marketing-embed mode: no pan/zoom/trace interactivity, no grid backdrop,
   * and a tight fit with no sidebar clearance. The full-page viewer keeps the
   * default.
   */
  embedded?: boolean;
  /**
   * Iframe-embed mode (/scan/<slug>/embed): fully interactive like the full
   * page, but fits with no sidebar clearance — there is no floating sidebar.
   */
  frame?: boolean;
  /** Flow direction — DOWN suits portrait containers (mobile hero). */
  direction?: "RIGHT" | "DOWN";
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
    layoutGraph(sized, folded.edges, { compact: embedded, direction }).then(
      (l) => {
        if (!cancelled) setLayout(l);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [folded, direction]);

  // Entrance choreography: things appear along the flow direction.
  const delayAt = (x: number, y = 0) =>
    0.15 +
    ((x + y) /
      Math.max(1, (layout?.width ?? 1) + (layout?.height ?? 0))) *
      0.9;
  const nodeById = useMemo(
    () => new Map((layout?.nodes ?? []).map((n) => [n.id, n])),
    [layout]
  );
  // x position per id (nodes AND group boxes) — drives entrance delays.
  const xOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of layout?.nodes ?? []) m.set(n.id, n.x);
    for (const g of layout?.groups ?? []) m.set(g.id, g.x);
    return m;
  }, [layout]);
  const foldedEdgeAt = (i: number) => folded.edges[i]!;

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

  // Legend focus (hover): a node matches if it IS one of the kinds or embeds one.
  const kindActive = useMemo(() => {
    if (!focusKinds || focusKinds.length === 0) return null;
    const kinds = new Set(focusKinds);
    return new Set(
      folded.nodes
        .filter(
          (n) => kinds.has(n.kind) || n.embeds.some((em) => kinds.has(em.kind))
        )
        .map((n) => n.id)
    );
  }, [focusKinds, folded.nodes]);

  // Beam-hit rings: one overlay per node/group, flashed imperatively when a
  // beam arrives (refs, not state — a flash shouldn't re-render the graph).
  const hitRings = useRef(new Map<string, HTMLDivElement>());
  const hitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const registerHitRing = (id: string) => (el: HTMLDivElement | null) => {
    if (el) hitRings.current.set(id, el);
    else hitRings.current.delete(id);
  };
  function flashTarget(id: string, color: string) {
    const el = hitRings.current.get(id);
    if (!el) return;
    el.style.borderColor = color;
    el.style.opacity = "0.55"; // soft glow, not a hard outline
    const prev = hitTimers.current.get(id);
    if (prev) clearTimeout(prev);
    hitTimers.current.set(
      id,
      setTimeout(() => {
        el.style.opacity = "0";
      }, 600)
    );
  }
  useEffect(() => {
    const timers = hitTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const nodeActive = (id: string) =>
    (!kindActive || kindActive.has(id)) && (!trace || trace.nodes.has(id));
  const edgeActive = (e: { orig: number[] }) =>
    (!kindActive ||
      e.orig.some((i) => {
        const o = foldedEdgeAt(i);
        return kindActive.has(o.from) || kindActive.has(o.to);
      })) &&
    (!trace || e.orig.some((i) => trace.edges.has(i)));

  // ─── Pan/zoom, imperatively ─────────────────────────────────────────────────
  // The transform lives in a ref and is written straight to the DOM — running
  // it through React state re-rendered the whole graph on every pointermove /
  // wheel frame, which is what made big maps feel laggy.
  const viewportRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const tRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  const tracedPosRef = useRef<{ x: number; y: number } | null>(null);
  const fitted = useRef(false);
  const drag = useRef<{
    px: number;
    py: number;
    tx: number;
    ty: number;
    moved: boolean;
  } | null>(null);

  // `will-change: transform` is only held while a gesture is in flight. Kept
  // permanently, the browser caches one raster of the graph and stretches that
  // bitmap on zoom — text goes blurry past the cached scale. Dropping the hint
  // shortly after the last move lets it re-rasterize crisp at the final zoom.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function applyTransform() {
    const t = tRef.current;
    const g = graphRef.current;
    if (g) {
      g.style.willChange = "transform";
      g.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        g.style.willChange = "auto";
      }, 150);
    }
    const pop = popoverRef.current;
    const pos = tracedPosRef.current;
    if (pop && pos) {
      pop.style.left = `${t.x + pos.x * t.k}px`;
      pop.style.top = `${t.y + pos.y * t.k}px`;
    }
  }

  // Fit the graph into the visible area (right of the floating sidebar) once.
  // Capped at 1 — upscaling small graphs blows the cards past native size
  // (fat borders/shadows) and reads as broken layout.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || fitted.current || !layout || layout.width === 0) return;
    const padL = embedded ? 0 : frame ? 24 : 432; // clear the floating sidebar
    const padR = embedded ? 0 : frame ? 24 : 48;
    const padY = embedded ? 0 : frame ? 24 : 56;
    const availW = Math.max(200, el.clientWidth - padL - padR);
    const availH = Math.max(200, el.clientHeight - padY * 2);
    const kFit = Math.min(availW / layout.width, availH / layout.height);
    if (kFit >= 0.45) {
      // The whole graph fits at a readable size — center it.
      // Embeds may upscale a little — a small demo graph should fill its
      // marketing slot. The full viewer never upscales (fat borders).
      const k = clamp(kFit, 0.3, embedded ? 1.6 : 1);
      tRef.current = {
        x: padL + (availW - layout.width * k) / 2,
        y: padY + (availH - layout.height * k) / 2,
        k,
      };
    } else {
      // Deep pipeline: fitting everything would be unreadably small. Fit the
      // height at a readable scale and open on the START of the flow — the
      // user pans right through the story.
      const k = clamp((availH / layout.height) * 0.9, 0.5, 0.8);
      tRef.current = {
        x: padL + 16,
        y: padY + (availH - layout.height * k) / 2,
        k,
      };
    }
    fitted.current = true;
    applyTransform();
  }, [layout, embedded, frame]);

  // Wheel zoom (and trackpad pinch, which arrives as ctrlKey+wheel). Native
  // listener so we can preventDefault (React's onWheel is passive).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || embedded) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const prev = tRef.current;
      if (e.ctrlKey) {
        // Trackpad pinch arrives as ctrlKey+wheel — the only gesture that zooms.
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.012);
        const k = clamp(prev.k * factor, 0.2, 3);
        const ratio = k / prev.k;
        tRef.current = {
          k,
          x: cx - (cx - prev.x) * ratio,
          y: cy - (cy - prev.y) * ratio,
        };
      } else {
        // Two-finger scroll (either axis) pans the canvas.
        tRef.current = {
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        };
      }
      applyTransform();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [embedded]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      px: e.clientX,
      py: e.clientY,
      tx: tRef.current.x,
      ty: tRef.current.y,
      moved: false,
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.px, e.clientY - d.py) > 4) d.moved = true;
    tRef.current = {
      ...tRef.current,
      x: d.tx + (e.clientX - d.px),
      y: d.ty + (e.clientY - d.py),
    };
    applyTransform();
  }
  function endDrag() {
    // A stationary pointer-up on the canvas clears the trace.
    if (drag.current && !drag.current.moved) {
      setTraceRoot(null);
      tracedPosRef.current = null;
    }
    drag.current = null;
  }

  const tracedNode = traceRoot ? nodeById.get(traceRoot) : null;
  if (tracedNode) {
    tracedPosRef.current = {
      x: tracedNode.x,
      y: tracedNode.y + tracedNode.height + 10,
    };
  }
  const tNow = tRef.current;

  return (
    <section className="absolute inset-0 z-10">
      <div
        ref={viewportRef}
        onPointerDown={embedded ? undefined : onPointerDown}
        onPointerMove={embedded ? undefined : onPointerMove}
        onPointerUp={embedded ? undefined : endDrag}
        onPointerLeave={
          embedded
            ? undefined
            : () => {
                drag.current = null;
              }
        }
        className={cn(
          "absolute inset-0 overflow-hidden",
          !embedded &&
            "cursor-grab touch-none bg-[linear-gradient(color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px)] bg-size-[56px_56px] bg-center active:cursor-grabbing dark:bg-[linear-gradient(color-mix(in_oklab,var(--border)_10%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--border)_10%,transparent)_1px,transparent_1px)]"
        )}
      >
        {layout ? (
          <div
            ref={graphRef}
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${tNow.x}px, ${tNow.y}px) scale(${tNow.k})`,
            }}
          >
            {/* group containers — labeled vertical stacks */}
            {layout.groups.map((g) => (
              <motion.div
                key={g.id}
                className="light:border-overlay shadow-(--custom-shadow) absolute rounded-[32px] corner-squircle bg-card dark:bg-card/50"
                style={{
                  left: g.x,
                  top: g.y,
                  width: g.width,
                  height: g.height,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: delayAt(g.x) }}
              >
                <span className="absolute top-4 left-4 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </span>
                <div
                  ref={registerHitRing(g.id)}
                  className="pointer-events-none absolute inset-0 rounded-[32px] corner-squircle border opacity-0 transition-[opacity,border-color] duration-500"
                  style={{ borderColor: "transparent" }}
                />
              </motion.div>
            ))}

            <svg
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              {layout.edges.map((e, i) => {
                const d = edgePath(e.points);
                const delay = delayAt(xOf.get(e.from) ?? 0) + 0.25;
                const active = edgeActive(e);
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

            {/* discrete traveling beams — one per edge, sparse and staggered */}
            {layout.edges.map((e, i) => {
              const sourceKind =
                nodeById.get(foldedEdgeAt(e.orig[0]!).from)?.kind ?? "entry";
              const hex = KIND_STYLES[sourceKind].hex;
              let length = 0;
              for (let p = 0; p < e.points.length - 1; p++) {
                length += Math.hypot(
                  e.points[p + 1]!.x - e.points[p]!.x,
                  e.points[p + 1]!.y - e.points[p]!.y
                );
              }
              return (
                <BeamPulse
                  key={`b${i}`}
                  d={edgePath(e.points)}
                  length={length}
                  color={hex}
                  dimmed={!edgeActive(e)}
                  compact={embedded}
                  onArrive={() => flashTarget(e.to, hex)}
                />
              );
            })}

            {layout.edges.map((e, i) => {
              // Explicit labels ("charges on trial end") are always shown;
              // kind-only labels ("reads", "writes") are boilerplate that
              // piles up in shared channels, so they surface only while the
              // edge is part of a traced flow.
              const kindLabel = e.orig
                .map((oi) => foldedEdgeAt(oi).kind)
                .find(Boolean);
              const text = e.label ?? kindLabel;
              if (!text) return null;
              const kindOnly = !e.label;
              const inTrace =
                trace !== null && e.orig.some((oi) => trace.edges.has(oi));
              if (kindOnly && !inTrace) return null;
              // Explicit labels sit where ELK routed space for them; trace-
              // revealed kind labels fall back to the longest-segment anchor.
              const mid = e.labelPos ?? labelAnchor(e.points);
              if (!mid) return null;
              const delay = kindOnly ? 0 : delayAt(xOf.get(e.from) ?? 0) + 0.6;
              return (
                <motion.span
                  key={`l${i}${kindOnly ? "k" : ""}`}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground/80 transition-opacity duration-300",
                    !edgeActive(e) && "opacity-15"
                  )}
                  style={{ left: mid.x, top: mid.y }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay, duration: 0.3 }}
                >
                  {text}
                </motion.span>
              );
            })}

            {layout.nodes.map((n) => {
              const style = KIND_STYLES[n.kind];
              const Glyph = style.Glyph;
              const dim = !nodeActive(n.id);
              const card = (
                <div
                  onPointerUp={
                    embedded
                      ? undefined
                      : (e) => {
                          if (drag.current?.moved) return;
                          e.stopPropagation();
                          drag.current = null;
                          setTraceRoot((cur) => (cur === n.id ? null : n.id));
                        }
                  }
                  className={cn(
                    "flex h-full flex-col overflow-hidden rounded-3xl corner-squircle bg-card text-card-foreground border dark:border-none dark:shadow-(--custom-shadow)",
                    !embedded && "cursor-pointer"
                  )}
                >
                  <div className="flex h-14 flex-none items-center gap-2.5 px-3.5">
                    <span
                      className={cn(
                        "flex size-7 flex-none items-center justify-center rounded-2xl corner-squircle",
                        style.icon
                      )}
                    >
                      {n.kind === "model" ? (
                        <ModelIcon
                          label={n.label}
                          domain={n.domain}
                          className="size-4"
                        />
                      ) : (
                        <Favicon
                          domain={n.domain}
                          className="size-4 rounded-sm"
                          fallback={
                            <Glyph
                              className={cn("size-4", style.glyphClass)}
                              stroke={2}
                            />
                          }
                        />
                      )}
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
                    <div className="mx-4 flex flex-1 flex-col items-start gap-2 border-t border-muted pt-2.5 pb-2.5">
                      {n.embeds.map((em) => {
                        const emStyle = KIND_STYLES[em.kind];
                        const EmGlyph = emStyle.Glyph;
                        return (
                          <span
                            key={em.id}
                            className="flex max-w-full items-center gap-1.5"
                          >
                            {em.kind === "model" ? (
                              <ModelIcon
                                label={em.label}
                                domain={em.domain}
                                className="size-3"
                              />
                            ) : (
                              <Favicon
                                domain={em.domain}
                                className="size-3 rounded-sm"
                                fallback={
                                  <EmGlyph
                                    className={cn(
                                      "size-3 text-muted-foreground",
                                      emStyle.glyphClass
                                    )}
                                    stroke={2}
                                  />
                                }
                              />
                            )}
                            <span className="truncate text-xs font-medium">
                              {em.label}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
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
                    delay: delayAt(n.x, n.y),
                  }}
                >
                  {/* Dim lives on this wrapper so the agent beam fades with
                      the card when a trace/legend focus mutes the node. */}
                  <div
                    className={cn(
                      "h-full transition-opacity duration-300",
                      dim && "opacity-25"
                    )}
                  >
                    {n.kind === "agent" ? (
                      <AgentBeam delay={delayAt(n.x, n.y) + 0.7}>{card}</AgentBeam>
                    ) : (
                      card
                    )}
                  </div>
                  {/* beam-hit ring — flashed in the arriving beam's color */}
                  <div
                    ref={registerHitRing(n.id)}
                    className="pointer-events-none absolute inset-0 rounded-3xl corner-squircle border opacity-0 transition-[opacity,border-color] duration-500"
                    style={{ borderColor: "transparent" }}
                  />
                </motion.div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Detail popover for the traced node. Rendered OUTSIDE the pan/zoom
          transform (positioned in screen space) so nothing on the map can
          paint over it, and it stays readable at any zoom level. */}
      {tracedNode ? (
        <motion.div
          key={tracedNode.id}
          ref={popoverRef}
          className="absolute z-30 w-60 rounded-xl bg-card p-4 shadow-(--custom-shadow)"
          style={{
            left: tNow.x + tracedNode.x * tNow.k,
            top: tNow.y + (tracedNode.y + tracedNode.height + 10) * tNow.k,
          }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-1 text-[11px] font-medium  tracking-wide text-muted-foreground">
            {(() => {
              const s = KIND_STYLES[tracedNode.kind];
              return (
                <s.Glyph
                  className={cn("size-3 mb-px", s.text, s.glyphClass)}
                  stroke={2}
                />
              );
            })()}
            {KIND_STYLES[tracedNode.kind].label}
          </div>
          <div className="mt-1 text-sm font-medium">{tracedNode.label}</div>
          {(tracedNode.detail ?? tracedNode.sub) ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {tracedNode.detail ?? tracedNode.sub}
            </p>
          ) : null}
          {tracedNode.sourceRef ? (
            <p className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground/80">
              {tracedNode.sourceRef}
            </p>
          ) : null}
        </motion.div>
      ) : null}
    </section>
  );
}
