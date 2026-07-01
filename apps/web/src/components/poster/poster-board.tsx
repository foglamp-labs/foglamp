"use client";

import type { PosterData } from "@foglamp/contracts/poster";

import { FlowMap } from "./flow-map";
import { KIND_ORDER } from "./kinds";
import { LeftRail } from "./left-rail";
import { ShareBar } from "./share-bar";

export function PosterBoard({ data }: { data: PosterData }) {
  // Kinds present in the map, in canonical order — explained by the legend.
  const kinds = KIND_ORDER.filter((k) => data.graph.nodes.some((n) => n.kind === k));

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <LeftRail data={data} />
      <FlowMap graph={data.graph} />
      <ShareBar kinds={kinds} />
    </div>
  );
}
