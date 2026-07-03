"use client";

import type { NodeKind, ScanData } from "@foglamp/contracts/scan";
import { useState } from "react";

import { FlowMap } from "./flow-map";
import { KIND_ORDER } from "./kinds";
import { LeftRail } from "./left-rail";
import { PersonalityCard } from "./personality-card";
import { ScanActions, ShareBar } from "./share-bar";

export function ScanBoard({ data }: { data: ScanData }) {
  // Kinds present in the map, in canonical order — explained by the legend.
  const kinds = KIND_ORDER.filter((k) =>
    data.graph.nodes.some((n) => n.kind === k)
  );
  // Hovering a legend group spotlights those kinds on the map.
  const [focusKinds, setFocusKinds] = useState<NodeKind[] | null>(null);

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-100 text-foreground dark:bg-background">
      {/* Top-left column: the identity card with the details rail hanging below. */}
      <div className="absolute top-6 left-6 z-20 flex w-80 flex-col gap-4">
        <PersonalityCard data={data} />
        <LeftRail data={data} />
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
