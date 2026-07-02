// Fold model/tool nodes into the nodes that use them. Instead of an agent
// spider-webbing out to separate "Gemini" / "Web search" nodes, the agent node
// carries those inline (model + tools shown below its name). This declutters
// busy graphs dramatically. Edges to model/tool nodes are dropped; structural
// edges (entry→agent, agent→store, agent→external, …) are kept.

import type { GraphEdge, NodeKind, PosterData } from "@foglamp/contracts/poster";

export interface Embed {
  id: string;
  label: string;
  kind: "model" | "tool";
  domain?: string;
}

export interface FoldedNode {
  id: string;
  label: string;
  kind: NodeKind;
  domain?: string;
  sub?: string;
  detail?: string;
  /** Models and tools this node uses, rendered inline (models first). */
  embeds: Embed[];
}

export interface FoldedGraph {
  nodes: FoldedNode[];
  edges: GraphEdge[];
}

const FOLDED: ReadonlySet<NodeKind> = new Set<NodeKind>(["model", "tool"]);

export function foldGraph(graph: PosterData["graph"]): FoldedGraph {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const embedsByNode = new Map<string, Embed[]>();

  for (const e of graph.edges) {
    const target = byId.get(e.to);
    const source = byId.get(e.from);
    if (!target || !source || !FOLDED.has(target.kind)) continue;
    const arr = embedsByNode.get(source.id) ?? [];
    if (!arr.some((x) => x.id === target.id)) {
      arr.push({
        id: target.id,
        label: target.label,
        kind: target.kind as "model" | "tool",
        domain: target.domain,
      });
    }
    embedsByNode.set(source.id, arr);
  }

  const nodes: FoldedNode[] = graph.nodes
    .filter((n) => !FOLDED.has(n.kind))
    .map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      domain: n.domain,
      sub: n.sub,
      detail: n.detail,
      // models before tools
      embeds: (embedsByNode.get(n.id) ?? []).sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === "model" ? -1 : 1,
      ),
    }));

  const alive = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => alive.has(e.from) && alive.has(e.to));

  return { nodes, edges };
}
