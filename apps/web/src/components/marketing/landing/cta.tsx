"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangleFilled,
  IconBolt,
  IconCircleChevronRightFilled,
  IconCirclesFilled,
  IconCoinFilled,
  IconGaugeFilled,
} from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Metric tile definitions ─────────────────────────────────────────────────
// Fixed data — no Math.random()/Date.now() at module/render time. Positions are
// percentages of the panel; `accent` is a real color so a revealed tile can
// light up in its own hue (border + glow + icon). The fog version stays muted.

type Tile = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
  /** left% top% */
  pos: [number, number];
};

const BLUE = "#3b82f6";
const AMBER = "#eab308";
const FUCHSIA = "#d946ef";
const EMERALD = "#10b981";
const ROSE = "#f43f5e";

const TILES: Tile[] = [
  { label: "Tokens", value: "1.24M", icon: IconCirclesFilled, accent: BLUE, pos: [7, 20] },
  { label: "p50 latency", value: "240ms", icon: IconGaugeFilled, accent: FUCHSIA, pos: [49, 13] },
  { label: "p95 latency", value: "820ms", icon: IconGaugeFilled, accent: FUCHSIA, pos: [38, 34] },
  { label: "Error rate", value: "1.2%", icon: IconAlertTriangleFilled, accent: ROSE, pos: [74, 19] },
  { label: "Requests", value: "12.4k", icon: IconBolt, accent: BLUE, pos: [90, 46] },
  { label: "Eval rate", value: "94%", icon: IconGaugeFilled, accent: EMERALD, pos: [62, 64] },
  { label: "Total cost", value: "$4.21", icon: IconCoinFilled, accent: AMBER, pos: [25, 64] },
  { label: "Tokens/s", value: "1.8k", icon: IconCirclesFilled, accent: BLUE, pos: [12, 86] },
  { label: "Cost/call", value: "$0.003", icon: IconCoinFilled, accent: AMBER, pos: [50, 88] },
  { label: "Spans", value: "48.9k", icon: IconBolt, accent: EMERALD, pos: [82, 82] },
];

// ─── Single metric tile ───────────────────────────────────────────────────────
// `lit` switches between the fog version (muted) and the revealed version
// (accent border + colored glow + tinted icon), so passing under the lamp reads
// as the tile "powering on".

function MetricTile({ tile, lit }: { tile: Tile; lit?: boolean }) {
  const Icon = tile.icon;
  return (
    <div
      className={cn(
        "absolute flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5",
        lit ? "bg-card" : "border-border/35 bg-card/55 backdrop-blur-sm"
      )}
      style={{
        left: `${tile.pos[0]}%`,
        top: `${tile.pos[1]}%`,
        transform: "translate(-50%, -50%)",
        minWidth: "7.75rem",
        ...(lit
          ? {
              borderColor: `${tile.accent}66`,
              boxShadow: `0 0 28px -6px ${tile.accent}88, 0 1px 2px rgba(0,0,0,0.4)`,
            }
          : {}),
      }}
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-lg"
        style={{
          backgroundColor: lit
            ? `${tile.accent}24`
            : "color-mix(in oklab, var(--muted-foreground) 12%, transparent)",
        }}
      >
        <Icon
          className={cn("size-3.5", !lit && "text-muted-foreground/70")}
          style={lit ? { color: tile.accent } : undefined}
        />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] leading-none text-muted-foreground truncate">
          {tile.label}
        </p>
        <p
          className={cn(
            "mt-1 text-sm font-semibold leading-none tabular-nums",
            lit ? "text-foreground" : "text-muted-foreground/80"
          )}
        >
          {tile.value}
        </p>
      </div>
    </div>
  );
}

// ─── Volumetric fog texture ───────────────────────────────────────────────────
// A drifting bank of mist made with fractal-noise turbulence (deterministic via
// a fixed seed — SSR-safe). Several of these at different scales/speeds layer
// into rolling fog. RGB is forced to a soft light grey; the noise drives alpha
// so it reads as wisps that scatter light over the dark panel.

function FogBank({
  id,
  freq,
  seed,
  octaves = 4,
}: {
  id: string;
  freq: number;
  seed: number;
  octaves?: number;
}) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      aria-hidden
      preserveAspectRatio="none"
    >
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency={freq}
          numOctaves={octaves}
          seed={seed}
          stitchTiles="stitch"
          result="noise"
        />
        {/* RGB → soft cool grey; alpha → thresholded noise (wisps). */}
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0.82
                  0 0 0 0 0.85
                  0 0 0 0 0.93
                  0 0 0 0.7 -0.22"
        />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

// ─── Auto-sweep rAF hook ──────────────────────────────────────────────────────
// Drifts the lamp left↔right until the user takes over with their pointer.

function useAutoSweep(
  panelRef: React.RefObject<HTMLDivElement | null>,
  reduce: boolean,
  userTookOver: boolean
): { mx: number; my: number } {
  const [pos, setPos] = useState({ mx: 0, my: 0 });
  const rafRef = useRef<number>(0);
  const startTsRef = useRef<number | null>(null);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({ mx: width / 2, my: height / 2 });

    if (reduce || userTookOver) return;

    const PERIOD_MS = 6400;
    const step = (ts: number) => {
      if (startTsRef.current === null) startTsRef.current = ts;
      const t = (ts - startTsRef.current) / PERIOD_MS;
      const { width: w, height: h } = el.getBoundingClientRect();
      const mx = w * (0.22 + 0.56 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2)));
      const my = h * (0.4 + 0.18 * Math.sin(t * Math.PI * 2 * 0.7 + 1.0));
      setPos({ mx, my });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafRef.current);
      startTsRef.current = null;
    };
  }, [panelRef, reduce, userTookOver]);

  return pos;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CtaSection() {
  const reduce = useReducedMotion() ?? false;
  const panelRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [userTookOver, setUserTookOver] = useState(false);

  const livePos = useRef<{ mx: number; my: number } | null>(null);
  const smoothRaf = useRef<number>(0);
  const autoPos = useAutoSweep(panelRef, reduce, userTookOver);

  // Write the lamp position to the inner div as CSS vars (read by the reveal
  // mask, the inverse fog mask, the glow, and the bulb). Imperative so the rAF
  // loop never re-renders React.
  const writeCssVars = useCallback((mx: number, my: number) => {
    const el = innerRef.current;
    if (!el) return;
    el.style.setProperty("--mx", `${mx}px`);
    el.style.setProperty("--my", `${my}px`);
  }, []);

  // Spring-like smoothing toward the live (or auto-sweep) target.
  useEffect(() => {
    if (reduce) return;
    const LERP = 0.14;
    let curMx: number | null = null;
    let curMy: number | null = null;
    const tick = () => {
      const target = livePos.current ?? { mx: autoPos.mx, my: autoPos.my };
      if (curMx === null) curMx = target.mx;
      if (curMy === null) curMy = target.my;
      curMx += (target.mx - curMx) * LERP;
      curMy += (target.my - curMy) * LERP;
      writeCssVars(curMx, curMy);
      smoothRaf.current = requestAnimationFrame(tick);
    };
    smoothRaf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(smoothRaf.current);
  }, [reduce, autoPos, writeCssVars]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reduce) return;
      if (!userTookOver) setUserTookOver(true);
      const rect = e.currentTarget.getBoundingClientRect();
      livePos.current = { mx: e.clientX - rect.left, my: e.clientY - rect.top };
    },
    [reduce, userTookOver]
  );

  const handlePointerLeave = useCallback(() => {
    livePos.current = null;
    setUserTookOver(false);
  }, []);

  // Reduced-motion: center the (unused) vars once.
  useEffect(() => {
    if (!reduce) return;
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    writeCssVars(width / 2, height / 2);
  }, [reduce, writeCssVars]);

  const LAMP_R = 240;
  // Reveal mask for the sharp tiles: visible inside the lamp.
  const revealMask = `radial-gradient(circle ${LAMP_R}px at var(--mx) var(--my), #000 0%, #000 32%, rgba(0,0,0,0.55) 56%, transparent 76%)`;
  // Inverse mask for the fog: the lamp burns a hole in the mist.
  const clearMask = `radial-gradient(circle ${LAMP_R + 30}px at var(--mx) var(--my), transparent 0%, transparent 40%, rgba(0,0,0,0.6) 58%, #000 82%)`;

  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <div
        ref={panelRef}
        className="relative isolate overflow-hidden rounded-3xl corner-squircle bg-card dark:bg-card/60 shadow-(--custom-shadow) px-6 py-14 sm:px-12"
        style={{ minHeight: "480px", cursor: reduce ? undefined : "none" }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {/* ── Faint dashboard grid so the panel reads as a surface under the fog. ── */}
        <div
          aria-hidden
          className="absolute inset-0 z-0 opacity-50 dark:opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
            backgroundSize: "24px 24px",
            WebkitMaskImage:
              "radial-gradient(ellipse 82% 72% at 50% 50%, #000 35%, transparent 100%)",
            maskImage:
              "radial-gradient(ellipse 82% 72% at 50% 50%, #000 35%, transparent 100%)",
          }}
        />

        {/* ── Headline block — always fully legible, above the fog ── */}
        <div className="relative z-30 max-w-xl pointer-events-none">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Your agents are running in the fog.
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground text-pretty">
            Cost, latency, errors, eval scores — all there, all invisible. Wrap
            your model and turn the light on.
          </p>
          <div className="mt-7 pointer-events-auto">
            <Button render={<Link href="/login" />} size="lg" className="text-base">
              Start free
              <IconCircleChevronRightFilled className="size-5 ml-0.5 opacity-90" />
            </Button>
          </div>
        </div>

        {/* ── Lamp layers. The inner div carries --mx/--my. ── */}
        <div ref={innerRef} className="absolute inset-0 z-10">
          {/* Dim data underneath — there, but unreadable in the murk. */}
          {!reduce && (
            <div
              className="absolute inset-0 select-none"
              aria-hidden
              style={{ filter: "blur(6px)", opacity: 0.5 }}
            >
              {TILES.map((tile, i) => (
                <MetricTile key={i} tile={tile} />
              ))}
            </div>
          )}

          {/* Warm lamp bloom — brightens whatever it's over (screen blend). */}
          {!reduce && (
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden
              style={{
                mixBlendMode: "screen",
                background: `radial-gradient(circle 320px at var(--mx) var(--my), rgba(255,243,214,0.20) 0%, rgba(255,221,158,0.12) 32%, rgba(255,196,120,0.05) 56%, transparent 76%)`,
              }}
            />
          )}

          {/* Crisp, lit tiles, clipped to the lamp circle. */}
          <div
            className="absolute inset-0 select-none"
            aria-hidden
            style={
              reduce
                ? undefined
                : { WebkitMaskImage: revealMask, maskImage: revealMask }
            }
          >
            {TILES.map((tile, i) => (
              <MetricTile key={i} tile={tile} lit />
            ))}
          </div>

          {/* Rolling fog — drifting turbulence banks. Sits above everything but
              the lamp burns a hole in it (inverse mask), so the light clears a
              pocket of mist and the data inside reads sharp. */}
          {!reduce && (
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden
              style={{ WebkitMaskImage: clearMask, maskImage: clearMask }}
            >
              <motion.div
                className="absolute -inset-[15%] opacity-70"
                style={{ filter: "blur(8px)" }}
                animate={{ x: ["-3%", "4%", "-3%"], y: ["-2%", "2%", "-2%"] }}
                transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
              >
                <FogBank id="fog-a" freq={0.0085} seed={7} />
              </motion.div>
              <motion.div
                className="absolute -inset-[15%] opacity-50"
                style={{ filter: "blur(14px)" }}
                animate={{ x: ["3%", "-4%", "3%"], y: ["2%", "-3%", "2%"] }}
                transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
              >
                <FogBank id="fog-b" freq={0.014} seed={29} octaves={5} />
              </motion.div>
            </div>
          )}

          {/* The "bulb" — a warm core riding the cursor. */}
          {!reduce && (
            <div
              className="absolute size-2.5 rounded-full"
              aria-hidden
              style={{
                left: "var(--mx)",
                top: "var(--my)",
                transform: "translate(-50%, -50%)",
                background: "rgba(255,248,228,0.9)",
                boxShadow:
                  "0 0 12px 4px rgba(255,226,160,0.65), 0 0 30px 10px rgba(255,206,120,0.25)",
              }}
            />
          )}
        </div>

        {/* ── Headline scrim: keeps the copy legible even when a bright bank of
              fog drifts behind it, without dimming the rest of the panel. ── */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          aria-hidden
          style={{
            background:
              "radial-gradient(125% 130% at -8% 34%, var(--card) 16%, transparent 54%)",
          }}
        />

        {/* ── Vignette: settles the far edges back into the card. ── */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 92% 82% at 50% 50%, transparent 52%, var(--card) 100%)",
          }}
        />
      </div>
    </section>
  );
}
