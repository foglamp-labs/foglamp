"use client";

import type { NodeKind, PosterData } from "@foglamp/contracts/poster";
import { useState } from "react";

import { FlowMap } from "./flow-map";
import { KIND_ORDER } from "./kinds";
import { LeftRail } from "./left-rail";
import { ShareBar } from "./share-bar";

export function PosterBoard({ data }: { data: PosterData }) {
  // Kinds present in the map, in canonical order — explained by the legend.
  const kinds = KIND_ORDER.filter((k) =>
    data.graph.nodes.some((n) => n.kind === k)
  );
  // Clicking a legend item spotlights only that kind on the map.
  const [focusKind, setFocusKind] = useState<NodeKind | null>(null);

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-100 text-foreground dark:bg-background">
      <LeftRail data={data} />
      <FlowMap graph={data.graph} focusKind={focusKind} />
      <ShareBar
        kinds={kinds}
        focusKind={focusKind}
        onFocusKind={(k) => setFocusKind((cur) => (cur === k ? null : k))}
      />
    </div>
  );
}
