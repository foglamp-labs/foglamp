// The footer's closing image: the three brand circles redrawn as dashed guides
// on a faint cutting mat, cropped by the bottom of the page. Everything is
// stroke in theme tokens, so it reads the same in light and dark.
//
// Each circle is two strokes: a muted dashed ring, and on top of it a ring with
// a single dash that steps around the circumference one dash at a time (a
// stepped stroke-dashoffset animation, see .mat-dash in index.css). pathLength
// normalizes every circle to 360 units, so the dash pattern is written in
// degrees: 36 dashes of 6, gaps of 4.
const CIRCLES = [
  { cx: 22, delay: "0s" },
  { cx: 48, delay: "-3.2s" },
  { cx: 74, delay: "-6.4s" },
];

// Grid geometry, in pixels. A heavier line every fourth cell.
const CELL = 24;
const MAJOR = CELL * 4;

export function CuttingMat() {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative h-52 w-full select-none overflow-hidden sm:h-72 opacity-75"
    >
      {/* The mat: a fine grid with a heavier line every fourth cell, fading in
          from the top so it doesn't hit the copyright row as a hard edge. The
          line colors are solid, one pair per theme, set as custom properties
          shared by the gradients.

          Both grids are anchored so a line runs through the page center. A
          plain "center" would put a tile edge half a tile left of center, a
          different half for the major and minor sizes, so the two grids would
          drift apart. */}
      <div
        className="absolute inset-0 [--mat-major:#e3e3e3] [--mat-minor:#f0f0f0] dark:[--mat-major:#1e1e1e] dark:[--mat-minor:#171717]"
        style={{
          backgroundImage: [
            "linear-gradient(to right, var(--mat-major) 0.5px, transparent 0.5px)",
            "linear-gradient(to bottom, var(--mat-major) 0.5px, transparent 0.5px)",
            "linear-gradient(to right, var(--mat-minor) 0.5px, transparent 0.5px)",
            "linear-gradient(to bottom, var(--mat-minor) 0.5px, transparent 0.5px)",
          ].join(", "),
          backgroundSize: `${MAJOR}px ${MAJOR}px, ${MAJOR}px ${MAJOR}px, ${CELL}px ${CELL}px, ${CELL}px ${CELL}px`,
          backgroundPosition: [
            `calc(50% - ${MAJOR / 2}px) 0`,
            `calc(50% - ${MAJOR / 2}px) 0`,
            `calc(50% - ${CELL / 2}px) 0`,
            `calc(50% - ${CELL / 2}px) 0`,
          ].join(", "),
          WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 70%)",
          maskImage: "linear-gradient(to bottom, transparent, #000 70%)",
        }}
      />

      {/* The mark. Wider than the mat is tall on purpose: the container's
          overflow crops the lower third of the circles. */}
      <svg
        viewBox="0 0 96 48"
        className="absolute left-1/2 top-24 w-[min(960px,100%)] -translate-x-1/2 sm:top-30"
        style={{ overflow: "visible" }}
      >
        {CIRCLES.map((c) => (
          <g key={c.cx}>
            <circle
              cx={c.cx}
              cy="24"
              r="23.5"
              pathLength={360}
              fill="none"
              className="stroke-neutral-300 dark:stroke-[#3B3B3B]"
              strokeWidth="0.15"
              strokeDasharray="6 4"
              strokeLinecap="butt"
            />
            <circle
              cx={c.cx}
              cy="24"
              r="23.5"
              pathLength={360}
              fill="none"
              className="mat-dash stroke-primary"
              strokeWidth="0.15"
              strokeDasharray="6 354"
              strokeLinecap="butt"
              style={{ animationDelay: c.delay }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
