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
  // Hovering a legend group spotlights those kinds on the map.
  const [focusKinds, setFocusKinds] = useState<NodeKind[] | null>(null);

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-100 text-foreground dark:bg-background">
      <LeftRail data={data} />
      <FlowMap graph={data.graph} focusKinds={focusKinds} />
      <ShareBar
        kinds={kinds}
        focusKinds={focusKinds}
        onFocusKinds={setFocusKinds}
      />
    </div>
  );
}
