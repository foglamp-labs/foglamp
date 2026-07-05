"use client";

import { cn } from "@foglamp/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";

// Shared atmospheric textures for marketing sections. Two flavors:
// - FilmGrain: a static feTurbulence speckle applied to the element itself via
//   CSS filter (the hero's treatment). Opacity/blend come from the caller.
// - FogBank: a fractal-noise haze rendered into a rect, used by the CTA fog
//   and the footer band. Deterministic (fixed seed) so it's SSR-safe.

export function FilmGrain({
  id,
  className,
}: {
  /** Unique per page — SVG filter ids are document-global. */
  id: string;
  className?: string;
}) {
  return (
    <figure
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ filter: `url(#${id}) grayscale(100%)` }}
    >
      <svg>
        <filter id={id}>
          <feTurbulence baseFrequency="0.8" />
        </filter>
      </svg>
    </figure>
  );
}

// The fog's cool blue-grey tint, as an feColorMatrix `values` string.
const TINT_COOL = "0 0 0 0 0.20 0 0 0 0 0.21 0 0 0 0 0.27 0 0 0 0.6 0.04";

export function FogBank({
  id,
  freq,
  seed,
  octaves = 4,
  shimmer = false,
}: {
  id: string;
  freq: number;
  seed: number;
  octaves?: number;
  /**
   * Slowly drift the fog toward a warmer grey and back. Implemented as a
   * compositor-only opacity fade on a tint overlay (NOT an SVG filter
   * animation — animating the filter re-rasterizes the turbulence every
   * frame and melts CPUs). Callers should gate this on reduced motion.
   */
  shimmer?: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {/* The turbulence is rasterized at quarter resolution and scaled up 4x.
          It sits behind 12-24px of blur everywhere it's used, so the upscale
          is invisible — but the filter costs 1/16th to render. */}
      <svg
        className="absolute left-0 top-0 h-1/4 w-1/4 origin-top-left scale-[4.02]"
        aria-hidden
        preserveAspectRatio="none"
      >
        <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
          {/* The turbulence frequency is in raster pixels: at quarter size the
              pattern needs 4x the frequency to look the same once scaled. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency={freq * 4}
            numOctaves={octaves}
            seed={seed}
            stitchTiles="stitch"
            result="noise"
          />
          {/* Single-line `values` — the browser normalises this SVG attribute
              to single spaces; a multi-line string mismatches on hydration. */}
          <feColorMatrix in="noise" type="matrix" values={TINT_COOL} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
      {/* Warm tint drift: a soft-light color wash whose opacity breathes.
          Opacity animation composites on the GPU; the fog raster is untouched. */}
      {shimmer && !reduce ? (
        <motion.div
          className="absolute inset-0 mix-blend-soft-light"
          style={{ background: "rgb(214,190,160)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.35, 0] }}
          transition={{ duration: 21, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
    </div>
  );
}
