// Deterministic flow-map layout, powered by ELK's layered algorithm with
// orthogonal edge routing: edges leave nodes at consistent ports, run in
// channels, and same-source edges merge into a shared trunk (hub bundling).
// Same input → same coordinates. Async because elkjs is promise-based.

import type { GraphEdge } from "@foglamp/contracts/poster";
import type { ELK, ElkNode } from "elkjs/lib/elk-api";

// elkjs probes for Worker at construction, which explodes during SSR/module
// eval — so it's imported and constructed lazily, in the browser only
// (layoutGraph is only ever called from a useEffect).
let elkInstance: ELK | null = null;
async function getElk(): Promise<ELK> {
  if (!elkInstance) {
    const { default: ELKCtor } = await import("elkjs/lib/elk.bundled.js");
    elkInstance = new ELKCtor();
  }
  return elkInstance;
}

export interface SizedNode {
  id: string;
  width: number;
  height: number;
}

export type PlacedNode<T extends SizedNode> = T & { x: number; y: number };

export interface PlacedEdge extends GraphEdge {
  points: { x: number; y: number }[];
}

export interface Layout<T extends SizedNode> {
  nodes: PlacedNode<T>[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

export async function layoutGraph<T extends SizedNode>(
  nodes: T[],
  edges: GraphEdge[]
): Promise<Layout<T>> {
  const graphInput: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.mergeEdges": "true",
      // Big graphs get tighter channels so deep pipelines don't sprawl.
      "elk.layered.spacing.nodeNodeBetweenLayers": nodes.length > 16 ? "52" : "88",
      "elk.spacing.nodeNode": nodes.length > 16 ? "22" : "32",
      "elk.spacing.edgeNode": nodes.length > 16 ? "16" : "24",
      "elk.spacing.edgeEdge": "14",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.padding": "[top=16,left=16,bottom=16,right=16]",
    },
    children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      sources: [e.from],
      targets: [e.to],
    })),
  };
  const elk = await getElk();
  const res = await elk.layout(graphInput);

  const childById = new Map((res.children ?? []).map((c) => [c.id, c]));
  const placed = nodes.map((n) => {
    const c = childById.get(n.id);
    return { ...n, x: c?.x ?? 0, y: c?.y ?? 0 };
  });

  const elkEdgeById = new Map((res.edges ?? []).map((e) => [e.id, e]));
  const placedEdges: PlacedEdge[] = edges.map((e, i) => {
    const sec = elkEdgeById.get(`e${i}`)?.sections?.[0];
    const points = sec
      ? [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint]
      : [];
    return { ...e, points };
  });

  return {
    nodes: placed,
    edges: placedEdges,
    width: res.width ?? 0,
    height: res.height ?? 0,
  };
}

/**
 * A small arrowhead "V" path at the target end of a polyline. Drawn as a plain
 * path (rather than an SVG <marker>) so its stroke inherits the edge styling
 * directly and renders consistently.
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

/**
 * Where to hang an edge label: the midpoint of the polyline's LONGEST segment.
 * Orthogonal routes bend right at node borders, so the naive "middle point of
 * the array" lands labels on top of nodes; the longest segment is the open
 * channel run where a label has room.
 */
export function labelAnchor(points: { x: number; y: number }[]): {
  x: number;
  y: number;
} | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0]!;
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(
      points[i + 1]!.x - points[i]!.x,
      points[i + 1]!.y - points[i]!.y
    );
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return {
    x: (points[best]!.x + points[best + 1]!.x) / 2,
    y: (points[best]!.y + points[best + 1]!.y) / 2,
  };
}

/** Orthogonal polyline → SVG path with rounded corners. */
export function edgePath(points: { x: number; y: number }[], r = 10): string {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
  }
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(b.x - a.x, b.y - a.y);
  const toward = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    d: number
  ) => {
    const len = dist(from, to) || 1;
    return {
      x: from.x + ((to.x - from.x) / len) * d,
      y: from.y + ((to.y - from.y) / len) * d,
    };
  };

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const p = points[i]!;
    const next = points[i + 1]!;
    const r1 = Math.min(r, dist(prev, p) / 2);
    const r2 = Math.min(r, dist(p, next) / 2);
    const a = toward(p, prev, r1);
    const b = toward(p, next, r2);
    d += ` L ${a.x} ${a.y} Q ${p.x} ${p.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${last.x} ${last.y}`;
  return d;
}
