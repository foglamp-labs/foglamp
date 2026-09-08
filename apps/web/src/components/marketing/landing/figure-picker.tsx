"use client";

import { FIGURES, type Section } from "./figures";

// The figure shown for each benefit section. The other candidates stay in
// FIGURES for reference.

const CHOSEN: Record<Section, string> = {
  costs: "chart",
  traces: "xray",
  quality: "review",
};

/** The figure for one benefit section. */
export function Figure({ section }: { section: Section }) {
  const variants = FIGURES[section];
  const variant =
    variants.find((v) => v.id === CHOSEN[section]) ?? variants[0]!;
  const Component = variant.component;
  return <Component />;
}
