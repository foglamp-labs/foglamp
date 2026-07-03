// Deterministic flow-map layout, powered by ELK's layered algorithm with
// orthogonal edge routing. Grouped nodes (same `group`) are laid out as a
// VERTICAL stack in an isolated pass, then the root pass arranges those stacks
// and the ungrouped nodes LEFT-TO-RIGHT — so deep pipelines fold into labeled
// columns instead of sprawling one-node-per-layer across the screen.
// Cross-group edges attach to the group container (deduped), which keeps the
// macro story readable. Same input → same coordinates. Async (elkjs).

import type { GraphEdge } from "@foglamp/contracts/scan";
import type { ELK, ElkNode } from "elkjs/lib/elk-api";

// elkjs is imported lazily, and via elk-api + the fake in-process worker
// instead of elk.bundled.js: the bundle's own `require("./elk-worker.min.js")`
// doesn't survive Next bundling ("_Worker is not a constructor" on the OG
// route), while an explicit workerFactory works in browser and Node alike.
let elkInstance: ELK | null = null;
async function getElk(): Promise<ELK> {
  if (!elkInstance) {
    const [{ default: ELKCtor }, worker] = await Promise.all([
      import("elkjs/lib/elk-api.js"),
      // @ts-expect-error — no types for the worker entry
      import("elkjs/lib/elk-worker.min.js"),
    ]);
    const FakeWorker = (worker.default ?? worker).Worker;
    elkInstance = new ELKCtor({
      workerFactory: (url) => new FakeWorker(url),
    });
  }
  return elkInstance;
}

export interface SizedNode {
  id: string;
  width: number;
  height: number;
  group?: string;
}

export type PlacedNode<T extends SizedNode> = T & { x: number; y: number };

export interface GroupBox {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedEdge {
  /** Endpoint ids — node ids, or a group id for edges attached to a stack. */
  from: string;
  to: string;
  label?: string;
  points: { x: number; y: number }[];
  /** Indices of the original input edges this rendered edge represents. */
  orig: number[];
}

export interface Layout<T extends SizedNode> {
  nodes: PlacedNode<T>[];
  groups: GroupBox[];
  edges: RenderedEdge[];
  width: number;
  height: number;
}

const GROUP_PAD = { top: 46, right: 16, bottom: 16, left: 16 };

export async function layoutGraph<T extends SizedNode>(
  nodes: T[],
  edges: GraphEdge[]
): Promise<Layout<T>> {
  const elk = await getElk();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Group membership, in order of first appearance.
  const groupNames: string[] = [];
  const membersByGroup = new Map<string, T[]>();
  for (const n of nodes) {
    if (!n.group) continue;
    if (!membersByGroup.has(n.group)) {
      membersByGroup.set(n.group, []);
      groupNames.push(n.group);
    }
    membersByGroup.get(n.group)!.push(n);
  }
  const groupIdOf = (name: string) => `group:${groupNames.indexOf(name)}`;
  const groupOfNode = (id: string) => nodeById.get(id)?.group;

  // ── Pass A: each group in isolation, top-to-bottom ─────────────────────────
  const groupLayouts = new Map<
    string,
    {
      size: { width: number; height: number };
      children: Map<string, { x: number; y: number }>;
      edges: { points: { x: number; y: number }[]; origIndex: number }[];
    }
  >();

  for (const name of groupNames) {
    const members = membersByGroup.get(name)!;
    const memberIds = new Set(members.map((m) => m.id));
    const internal = edges
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => memberIds.has(e.from) && memberIds.has(e.to));

    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.spacing.nodeNodeBetweenLayers": "36",
        "elk.spacing.nodeNode": "22",
        "elk.spacing.edgeNode": "14",
        "elk.padding": `[top=${GROUP_PAD.top},left=${GROUP_PAD.left},bottom=${GROUP_PAD.bottom},right=${GROUP_PAD.right}]`,
      },
      children: members.map((m) => ({
        id: m.id,
        width: m.width,
        height: m.height,
      })),
      edges: internal.map(({ e, i }) => ({
        id: `e${i}`,
        sources: [e.from],
        targets: [e.to],
      })),
    };
    const res = await elk.layout(input);
    const children = new Map<string, { x: number; y: number }>();
    for (const c of res.children ?? [])
      children.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
    const groupEdges = (res.edges ?? []).map((el) => {
      const sec = el.sections?.[0];
      return {
        origIndex: Number(el.id.slice(1)),
        points: sec
          ? [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint]
          : [],
      };
    });
    groupLayouts.set(name, {
      size: { width: res.width ?? 0, height: res.height ?? 0 },
      children,
      edges: groupEdges,
    });
  }

  // ── Pass B: root graph — ungrouped nodes + group boxes, left-to-right ──────
  // Cross-group edges are remapped to the group box and deduped.
  type RootEdge = { from: string; to: string; label?: string; orig: number[] };
  const rootEdges = new Map<string, RootEdge>();
  edges.forEach((e, i) => {
    const gFrom = groupOfNode(e.from);
    const gTo = groupOfNode(e.to);
    if (gFrom && gFrom === gTo) return; // internal — handled in pass A
    const from = gFrom ? groupIdOf(gFrom) : e.from;
    const to = gTo ? groupIdOf(gTo) : e.to;
    const key = `${from}→${to}`;
    const cur = rootEdges.get(key);
    if (cur) {
      cur.orig.push(i);
      if (!cur.label && e.label) cur.label = e.label;
    } else {
      rootEdges.set(key, { from, to, label: e.label, orig: [i] });
    }
  });

  const ungrouped = nodes.filter((n) => !n.group);
  const rootChildren: ElkNode[] = [
    ...ungrouped.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    ...groupNames.map((name) => ({
      id: groupIdOf(name),
      width: groupLayouts.get(name)!.size.width,
      height: groupLayouts.get(name)!.size.height,
    })),
  ];
  const dense = rootChildren.length > 12;
  const rootInput: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.mergeEdges": "true",
      "elk.layered.spacing.nodeNodeBetweenLayers": dense ? "110" : "150",
      "elk.spacing.nodeNode": dense ? "22" : "32",
      "elk.spacing.edgeNode": dense ? "16" : "24",
      "elk.spacing.edgeEdge": "14",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.padding": "[top=16,left=16,bottom=16,right=16]",
    },
    children: rootChildren,
    edges: [...rootEdges.values()].map((e, i) => ({
      id: `r${i}`,
      sources: [e.from],
      targets: [e.to],
    })),
  };
  const rootRes = await elk.layout(rootInput);
  const rootPos = new Map<string, { x: number; y: number }>();
  for (const c of rootRes.children ?? [])
    rootPos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });

  // ── Compose absolute coordinates ───────────────────────────────────────────
  const placed: PlacedNode<T>[] = [];
  for (const n of ungrouped) {
    const p = rootPos.get(n.id) ?? { x: 0, y: 0 };
    placed.push({ ...n, x: p.x, y: p.y });
  }
  const groups: GroupBox[] = [];
  for (const name of groupNames) {
    const gl = groupLayouts.get(name)!;
    const origin = rootPos.get(groupIdOf(name)) ?? { x: 0, y: 0 };
    groups.push({
      id: groupIdOf(name),
      label: name,
      x: origin.x,
      y: origin.y,
      width: gl.size.width,
      height: gl.size.height,
    });
    for (const m of membersByGroup.get(name)!) {
      const rel = gl.children.get(m.id) ?? { x: 0, y: 0 };
      placed.push({ ...m, x: origin.x + rel.x, y: origin.y + rel.y });
    }
  }

  const rendered: RenderedEdge[] = [];
  // Internal group edges, offset to absolute space.
  for (const name of groupNames) {
    const gl = groupLayouts.get(name)!;
    const origin = rootPos.get(groupIdOf(name)) ?? { x: 0, y: 0 };
    for (const ge of gl.edges) {
      const orig = edges[ge.origIndex]!;
      rendered.push({
        from: orig.from,
        to: orig.to,
        label: orig.label,
        orig: [ge.origIndex],
        points: ge.points.map((p) => ({
          x: p.x + origin.x,
          y: p.y + origin.y,
        })),
      });
    }
  }
  // Root edges (already absolute — flat root graph).
  const rootEdgeList = [...rootEdges.values()];
  (rootRes.edges ?? []).forEach((el, i) => {
    const spec = rootEdgeList[i]!;
    const sec = el.sections?.[0];
    rendered.push({
      from: spec.from,
      to: spec.to,
      label: spec.label,
      orig: spec.orig,
      points: sec
        ? [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint]
        : [],
    });
  });

  return {
    nodes: placed,
    groups,
    edges: rendered,
    width: rootRes.width ?? 0,
    height: rootRes.height ?? 0,
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
