"use client";

import dynamic from "next/dynamic";

// The figures for the three benefit sections: a few real product cards laid
// out on the page. They render the app's timeline and depend on browser
// measurement, so each one loads client-only, like the hero demo, behind a
// gap that reserves its space.

export type Section = "costs" | "traces" | "quality";

type Scenes = typeof import("./figures-scenes");

const scene = (pick: (m: Scenes) => React.ComponentType) =>
  dynamic(() => import("./figures-scenes").then(pick), {
    ssr: false,
    loading: () => <div className="h-112 w-full" />,
  });

export const FIGURES: Record<Section, React.ComponentType> = {
  costs: scene((m) => m.CostCards),
  traces: scene((m) => m.TraceStory),
  quality: scene((m) => m.QualityReview),
};

export function Figure({ section }: { section: Section }) {
  const Component = FIGURES[section];
  return <Component />;
}
