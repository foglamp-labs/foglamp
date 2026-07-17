"use client";

import type { ScanData } from "@foglamp/contracts/scan";

import { FlowMap } from "./flow-map";

// The iframe-embeddable scan view (/scan/<slug>/embed): just the interactive
// map plus a small attribution link back to the full scan page.
export function EmbedBoard({ data, slug }: { data: ScanData; slug: string }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-100 text-foreground dark:bg-background">
      <FlowMap graph={data.graph} focusKinds={null} frame />
      <a
        href={`/scan/${slug}`}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-3 right-3 z-20 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-(--custom-shadow) transition-colors hover:text-foreground"
      >
        {data.project.name} · scanned by foglamp
      </a>
    </div>
  );
}
