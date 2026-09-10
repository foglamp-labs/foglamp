import { type MotionProps, type Variants, stagger } from "motion/react";

// The hero demo's entrance. The chrome frame sits tilted from the first
// paint, and each surface inside it lands on it like a part of a 3D model:
// it starts lifted off the frame's plane and a little further up, then
// settles into place. The inset panel goes first, then the sidebar, then
// the content in the panel. Once the last one has landed, the frame swings
// flat (see Hero). Both files that own a surface share these numbers, so
// the drops match. The lift only reads in 3D, so every ancestor between the
// tilted frame and a surface keeps transform-style: preserve-3d and does
// not clip while the drops run.
//
// The sidebar and the content have no surface of their own. Their pieces
// (nav links, the header, table rows) each make the same drop, one after
// another: the sidebar's pieces land on the chrome, the content's on the
// inset panel. They are Motion variants, so an element only has to be a
// Piece (see piece.tsx) to join in; the wrapper around them (landPieces)
// hands each one its start time and does not move itself.

export const ENTRANCE_EASE: [number, number, number, number] = [
  0.32, 0.72, 0, 1,
];

// The variant names the surfaces, the wrappers, and the pieces share.
export const LIFTED = "lifted";
export const LANDED = "landed";

// Where a surface or a piece starts before it drops: lifted off the plane
// it lands on toward the viewer (z) and a little further up the plane (y),
// in px.
const LIFT = 40;
const DROP = 84;
const DURATION = 1.7;

// The pieces: how far up the plane each starts (it shares LIFT for the
// lift off the plane), how long the drop takes, the gap between one piece
// and the next, and how long after the wrapper's cue the first follows.
const PIECE_DROP = 40;
const PIECE_DURATION = 1.1;
const PIECE_GAP = 0.065;
const PIECE_AFTER = 0.25;

// Seconds after mount that each drop is cued. The chrome's tilt
// is in place by then, and the hero copy is still finishing its rise when
// the sidebar starts, so the two overlap a little.
export const DROP_AT = {
  inset: 0.7,
  sidebar: 1,
  content: 2,
} as const;

/** Motion props for the inset surface's drop, or nothing under reduced
 * motion. */
export function dropIn(delay: number, reduce: boolean): MotionProps {
  if (reduce) return {};
  const variants: Variants = {
    [LIFTED]: { opacity: 0, y: -DROP, z: LIFT },
    [LANDED]: {
      opacity: 1,
      y: 0,
      z: 0,
      transition: {
        duration: DURATION,
        ease: ENTRANCE_EASE,
        delay,
      },
    },
  };
  return { initial: LIFTED, animate: LANDED, variants };
}

/** Motion props for a wrapper whose pieces drop one after another from the
 * given cue, or nothing under reduced motion. The wrapper itself stays put
 * and fully visible; it only passes the variant state and the stagger down
 * to its pieces. The cue's own delay does not reach them, so it is folded
 * into their start. */
export function landPieces(delay: number, reduce: boolean): MotionProps {
  if (reduce) return {};
  const variants: Variants = {
    [LIFTED]: {},
    [LANDED]: {
      transition: {
        delayChildren: stagger(PIECE_GAP, { startDelay: delay + PIECE_AFTER }),
      },
    },
  };
  return { initial: LIFTED, animate: LANDED, variants };
}

/** Variants for one piece: the same drop as a surface. Its wrapper decides
 * when it starts. */
export const PIECE_VARIANTS: Variants = {
  [LIFTED]: { opacity: 0, y: -PIECE_DROP, z: LIFT },
  [LANDED]: {
    opacity: 1,
    y: 0,
    z: 0,
    transition: { duration: PIECE_DURATION, ease: ENTRANCE_EASE },
  },
};
