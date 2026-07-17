// Compare two scans of the same project (current vs the version before its
// last update) into a small "what changed" summary. Nodes are matched by id;
// a node whose label/kind/sub changed counts as changed, not added+removed.

import type { GraphNode, ScanData } from "@foglamp/contracts/scan";

export interface ScanDiff {
  addedNodes: GraphNode[];
  removedNodes: GraphNode[];
  changedNodes: GraphNode[];
  /** stat deltas, only the non-zero ones (e.g. { agents: +2 }). */
  statDeltas: Partial<Record<keyof ScanData["stats"], number>>;
  hasChanges: boolean;
}

export function diffScans(current: ScanData, previous: ScanData): ScanDiff {
  const prevById = new Map(previous.graph.nodes.map((n) => [n.id, n]));
  const curById = new Map(current.graph.nodes.map((n) => [n.id, n]));

  const addedNodes = current.graph.nodes.filter((n) => !prevById.has(n.id));
  const removedNodes = previous.graph.nodes.filter((n) => !curById.has(n.id));
  const changedNodes = current.graph.nodes.filter((n) => {
    const prev = prevById.get(n.id);
    if (!prev) return false;
    return (
      prev.label !== n.label || prev.kind !== n.kind || prev.sub !== n.sub
    );
  });

  const statDeltas: ScanDiff["statDeltas"] = {};
  for (const key of Object.keys(current.stats) as (keyof ScanData["stats"])[]) {
    const delta = current.stats[key] - previous.stats[key];
    if (delta !== 0) statDeltas[key] = delta;
  }

  return {
    addedNodes,
    removedNodes,
    changedNodes,
    statDeltas,
    hasChanges:
      addedNodes.length + removedNodes.length + changedNodes.length > 0 ||
      Object.keys(statDeltas).length > 0,
  };
}
