"use client";

import { TableRow } from "@foglamp/ui/components/table";
import { motion } from "motion/react";
import { createContext, useContext } from "react";

import { PIECE_VARIANTS } from "./entrance";

// One piece of a surface during the entrance (see entrance.ts): it inherits
// the surface's variant state and settles into place on its turn. Once the
// entrance is over, or under reduced motion, a piece that mounts (a tab
// switch) skips its initial state and renders in place like the real app.
// The variants stay on: taking them away makes Motion fall back to the
// piece's recorded initial values, which would hide it.

/** True while the entrance is running. Provided by DemoShell. */
export const EntranceContext = createContext(false);

/** True while the entrance is running. The containers between a wrapper
 * and its pieces use it to stop clipping and keep 3D while the pieces
 * drop (a clipped box flattens everything inside it). */
export function useEntering() {
  return useContext(EntranceContext);
}

const MotionRow = motion.create(TableRow);

/** A block-level piece: a div, or a list item. */
export function Piece({
  as = "div",
  className,
  children,
}: {
  as?: "div" | "li";
  className?: string;
  children: React.ReactNode;
}) {
  const entering = useContext(EntranceContext);
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <Tag
      variants={PIECE_VARIANTS}
      initial={entering ? undefined : false}
      className={className}
    >
      {children}
    </Tag>
  );
}

/** A table row piece: TableRow with the same behavior. */
export function PieceRow(props: React.ComponentProps<typeof MotionRow>) {
  const entering = useContext(EntranceContext);
  return (
    <MotionRow
      variants={PIECE_VARIANTS}
      initial={entering ? undefined : false}
      {...props}
    />
  );
}
