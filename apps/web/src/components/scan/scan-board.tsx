"use client";

import type { NodeKind, ScanData } from "@foglamp/contracts/scan";
import { useState } from "react";

import { ChangesCard } from "./changes-card";
import { FlowMap } from "./flow-map";
import { KIND_ORDER } from "./kinds";
import { LeftRail } from "./left-rail";
import { PoweredBy } from "./powered-by";
import { ScanActions, ShareBar } from "./share-bar";

export function ScanBoard({
  data,
  previous,
}: {
  data: ScanData;
  /** The scan as it was before its last update — drives the changes card. */
  previous?: ScanData | null;
}) {
  // Kinds present in the map, in canonical order — explained by the legend.
  const kinds = KIND_ORDER.filter((k) =>
    data.graph.nodes.some((n) => n.kind === k)
  );
  // Hovering a legend group spotlights those kinds on the map.
  const [focusKinds, setFocusKinds] = useState<NodeKind[] | null>(null);

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-100 text-foreground dark:bg-background">
      {/* Top-left column: attribution pill with the details rail hanging below. */}
      <div className="absolute top-6 left-6 z-20 flex w-fit flex-col gap-4">
        <PoweredBy />
        <LeftRail data={data} />
        {previous ? <ChangesCard data={data} previous={previous} /> : null}
      </div>
      <div className="absolute top-6 right-6 z-20">
        <ScanActions />
      </div>
      <FlowMap graph={data.graph} focusKinds={focusKinds} />
      <ShareBar
        kinds={kinds}
        focusKinds={focusKinds}
        onFocusKinds={setFocusKinds}
      />
    </div>
  );
}
