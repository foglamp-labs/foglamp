import { cn } from "@foglamp/ui/lib/utils";

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

// The fog's tint, as feColorMatrix `values` strings. Shimmer slowly morphs
// between the two: a cool blue-grey and a slightly warmer, lighter grey.
const TINT_COOL =
  "0 0 0 0 0.20 0 0 0 0 0.21 0 0 0 0 0.27 0 0 0 0.6 0.04";
const TINT_WARM =
  "0 0 0 0 0.26 0 0 0 0 0.25 0 0 0 0 0.29 0 0 0 0.6 0.055";

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
   * Slowly breathe the turbulence frequency and drift the tint (SMIL). The
   * texture itself churns instead of only sliding around. Callers should gate
   * this on reduced motion.
   */
  shimmer?: boolean;
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
        >
          {shimmer ? (
            <animate
              attributeName="baseFrequency"
              values={`${freq};${freq * 1.35};${freq}`}
              dur="34s"
              repeatCount="indefinite"
            />
          ) : null}
        </feTurbulence>
        {/* Single-line `values` — the browser normalises this SVG attribute to
            single spaces, so a multi-line string mismatches on hydration. */}
        <feColorMatrix in="noise" type="matrix" values={TINT_COOL}>
          {shimmer ? (
            <animate
              attributeName="values"
              values={`${TINT_COOL};${TINT_WARM};${TINT_COOL}`}
              dur="21s"
              repeatCount="indefinite"
            />
          ) : null}
        </feColorMatrix>
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}
