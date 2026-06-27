// Deterministic flow-map layout. The agent emits an unordered node-graph; dagre
// turns it into a stable left-to-right layered diagram. Same input → same
// coordinates every time, so the picture is reproducible, not improvised.

import type { GraphEdge, GraphNode } from "@foglamp/contracts/poster";
import dagre from "dagre";

export const NODE_W = 190;
export const NODE_H = 62;

export interface PlacedNode extends GraphNode {
  x: number;
  y: number;
}

export interface PlacedEdge extends GraphEdge {
  points: { x: number; y: number }[];
}

export interface Layout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): Layout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 26,
    ranksep: 84,
    marginx: 24,
    marginy: 24,
    ranker: "network-simplex",
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.from, e.to);

  dagre.layout(g);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed: PlacedNode[] = [];
  for (const id of g.nodes()) {
    const node = byId.get(id);
    if (!node) continue;
    const { x, y } = g.node(id); // center coords
    placed.push({ ...node, x: x - NODE_W / 2, y: y - NODE_H / 2 });
  }

  const placedEdges: PlacedEdge[] = edges.map((e) => {
    const d = g.edge({ v: e.from, w: e.to });
    return { ...e, points: d?.points ?? [] };
  });

  const { width = 0, height = 0 } = g.graph();
  return { nodes: placed, edges: placedEdges, width, height };
}

/**
 * A small arrowhead "V" path at the target end of a polyline. Drawn as a plain
 * path (not an SVG <marker>) because html-to-image rasterizes markers
 * unreliably — they come out as solid black blobs in the exported PNG.
 */
export function arrowHead(points: { x: number; y: number }[], len = 7): string {
  if (points.length < 2) return "";
  const p = points[points.length - 1]!;
  const q = points[points.length - 2]!;
  const ang = Math.atan2(p.y - q.y, p.x - q.x);
  const spread = 0.46;
  const a1x = p.x - len * Math.cos(ang - spread);
  const a1y = p.y - len * Math.sin(ang - spread);
  const a2x = p.x - len * Math.cos(ang + spread);
  const a2y = p.y - len * Math.sin(ang + spread);
  return `M ${a1x} ${a1y} L ${p.x} ${p.y} L ${a2x} ${a2y}`;
}

/** Build a smooth SVG path string from a dagre polyline. */
export function edgePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  }
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
