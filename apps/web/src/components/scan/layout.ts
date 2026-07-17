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
    const [elkApi, worker] = (await Promise.all([
      import("elkjs/lib/elk-api.js"),
      // @ts-expect-error — no types for the worker entry
      import("elkjs/lib/elk-worker.min.js"),
    ])) as [
      { default: (new (opts: object) => ELK) | { default: new (opts: object) => ELK } },
      Record<string, unknown>,
    ];
    // Both modules are CJS; depending on the bundler (turbopack, webpack,
    // Vercel's nft trace) the constructor lands on the module, .default, or
    // .default.default. Probe every shape instead of trusting one.
    const ELKCtor = (
      typeof elkApi.default === "function" ? elkApi.default : elkApi.default.default
    ) as new (opts: object) => ELK;
    const workerNs = worker as { Worker?: unknown; default?: { Worker?: unknown } };
    const FakeWorker = (workerNs.Worker ??
      workerNs.default?.Worker ??
      workerNs.default) as new (url?: string) => Worker;
    if (typeof FakeWorker !== "function") {
      throw new Error("elk-worker module shape not recognized");
    }
    elkInstance = new ELKCtor({
      workerFactory: (url?: string) => new FakeWorker(url),
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
  /** ELK-placed label center. ELK reserves space for labels during routing,
   *  so labels positioned here cannot collide; absent for label-less edges. */
  labelPos?: { x: number; y: number };
  /** Indices of the original input edges this rendered edge represents. */
  orig: number[];
}

/** Label box ELK reserves while routing — mirrors the rendered chip
 *  (text-xs ≈ 6.2px/char + px-2 padding, py-0.5 → 22px tall). */
const LABEL_H = 22;
function labelDims(text: string): { width: number; height: number } {
  return { width: Math.round(text.length * 6) + 14, height: LABEL_H };
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
  edges: GraphEdge[],
  opts: {
    /** Tighter layer gaps for small marketing embeds. */
    compact?: boolean;
    /** Flow direction — RIGHT (default) or DOWN (portrait embeds). */
    direction?: "RIGHT" | "DOWN";
  } = {}
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
      edges: {
        points: { x: number; y: number }[];
        labelPos?: { x: number; y: number };
        origIndex: number;
      }[];
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
        "elk.layered.spacing.nodeNodeBetweenLayers": "30",
        "elk.spacing.nodeNode": "18",
        "elk.spacing.edgeNode": "14",
        "elk.edgeLabels.inline": "true",
        "elk.spacing.edgeLabel": "4",
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
        ...(e.label
          ? { labels: [{ id: `el${i}`, text: e.label, ...labelDims(e.label) }] }
          : {}),
      })),
    };
    const res = await elk.layout(input);
    const children = new Map<string, { x: number; y: number }>();
    for (const c of res.children ?? [])
      children.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
    const groupEdges = (res.edges ?? []).map((el) => {
      const sec = el.sections?.[0];
      const lbl = el.labels?.[0];
      return {
        origIndex: Number(el.id.slice(1)),
        points: sec
          ? [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint]
          : [],
        labelPos:
          lbl && lbl.x != null && lbl.y != null
            ? {
                x: lbl.x + (lbl.width ?? 0) / 2,
                y: lbl.y + (lbl.height ?? 0) / 2,
              }
            : undefined,
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
      "elk.direction": opts.direction ?? "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.mergeEdges": "true",
      // Layer gaps shrank when labels became ELK's job: inline labels reserve
      // their own room mid-edge, so the blanket spacing no longer carries them.
      "elk.layered.spacing.nodeNodeBetweenLayers": opts.compact
        ? "56"
        : dense
          ? "56"
          : "72",
      "elk.spacing.nodeNode": dense ? "18" : "26",
      "elk.spacing.edgeNode": dense ? "16" : "24",
      "elk.spacing.edgeEdge": "14",
      // BRANDES_KOEPF/BALANCED packs rows far tighter than NETWORK_SIMPLEX,
      // which trades area for straight edges and spread big maps out into
      // sparse, bureaucratic grids. Post-compaction then pulls layers together.
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
      "elk.edgeLabels.inline": "true",
      "elk.spacing.edgeLabel": "4",
      "elk.padding": "[top=16,left=16,bottom=16,right=16]",
    },
    children: rootChildren,
    edges: [...rootEdges.values()].map((e, i) => ({
      id: `r${i}`,
      sources: [e.from],
      targets: [e.to],
      ...(e.label
        ? { labels: [{ id: `rl${i}`, text: e.label, ...labelDims(e.label) }] }
        : {}),
    })),
  };
  const rootRes = await elk.layout(rootInput);
  const rootPos = new Map<string, { x: number; y: number }>();
  for (const c of rootRes.children ?? [])
    rootPos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });

  // ── Row snap ────────────────────────────────────────────────────────────────
  // ELK's placement often leaves items that read as one row a few px apart
  // (see: two cards nearly level but off by ~15px). Cluster root-level items
  // whose vertical centers are within SNAP_TOL and align each cluster to its
  // mean center. Items inside one cluster can't collide — same-column items
  // this close would already overlap. Edge endpoints are shifted to match
  // below, keeping orthogonal routes orthogonal.
  const SNAP_TOL = 20;
  const rowDelta = new Map<string, number>();
  {
    const items = rootChildren
      .map((c) => {
        const pos = rootPos.get(c.id);
        return pos
          ? { id: c.id, h: c.height ?? 0, centerY: pos.y + (c.height ?? 0) / 2 }
          : null;
      })
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .sort((a, b) => a.centerY - b.centerY);
    let cluster: typeof items = [];
    const flush = () => {
      if (cluster.length < 2) return;
      const mean =
        cluster.reduce((s, i) => s + i.centerY, 0) / cluster.length;
      for (const i of cluster) {
        const dy = mean - i.centerY;
        if (dy === 0) continue;
        rowDelta.set(i.id, dy);
        const pos = rootPos.get(i.id)!;
        rootPos.set(i.id, { x: pos.x, y: pos.y + dy });
      }
    };
    for (const item of items) {
      if (
        cluster.length > 0 &&
        item.centerY - cluster[cluster.length - 1]!.centerY <= SNAP_TOL
      ) {
        cluster.push(item);
      } else {
        flush();
        cluster = [item];
      }
    }
    flush();
  }

  /** Shift a root edge's endpoints by their nodes' snap deltas, preserving
   *  orthogonality: the endpoint's adjoining horizontal stub moves with it,
   *  so only the connecting vertical run changes length. */
  function snapEdgePoints(
    points: { x: number; y: number }[],
    fromId: string,
    toId: string,
  ): { x: number; y: number }[] {
    const dS = rowDelta.get(fromId) ?? 0;
    const dT = rowDelta.get(toId) ?? 0;
    if ((dS === 0 && dT === 0) || points.length < 2) return points;
    const p = points.map((pt) => ({ ...pt }));
    const n = p.length;
    const horizontal = (a: { y: number }, b: { y: number }) =>
      Math.abs(a.y - b.y) < 0.5;
    p[0]!.y += dS;
    p[n - 1]!.y += dT;
    if (n === 2) return p; // straight edge: both ends snapped, stays straight-ish
    if (horizontal(points[0]!, points[1]!) && n > 3) p[1]!.y += dS;
    if (horizontal(points[n - 2]!, points[n - 1]!) && n > 3) p[n - 2]!.y += dT;
    if (n === 3) {
      // Single bend: keep whichever adjoining segment was horizontal aligned.
      if (horizontal(points[0]!, points[1]!)) p[1]!.y += dS;
      else if (horizontal(points[1]!, points[2]!)) p[1]!.y += dT;
    }
    return p;
  }

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
        labelPos: ge.labelPos
          ? { x: ge.labelPos.x + origin.x, y: ge.labelPos.y + origin.y }
          : undefined,
      });
    }
  }
  // Root edges (already absolute — flat root graph), endpoints snapped along
  // with their nodes.
  const rootEdgeList = [...rootEdges.values()];
  (rootRes.edges ?? []).forEach((el, i) => {
    const spec = rootEdgeList[i]!;
    const sec = el.sections?.[0];
    const points = sec
      ? [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint]
      : [];
    const lbl = el.labels?.[0];
    // A mid-route label follows its edge's snapped endpoints (mean delta).
    const labelDy =
      ((rowDelta.get(spec.from) ?? 0) + (rowDelta.get(spec.to) ?? 0)) / 2;
    rendered.push({
      from: spec.from,
      to: spec.to,
      label: spec.label,
      orig: spec.orig,
      points: snapEdgePoints(points, spec.from, spec.to),
      labelPos:
        lbl && lbl.x != null && lbl.y != null
          ? {
              x: lbl.x + (lbl.width ?? 0) / 2,
              y: lbl.y + (lbl.height ?? 0) / 2 + labelDy,
            }
          : undefined,
    });
  });

  // ── Empty-band squeeze ──────────────────────────────────────────────────────
  // Even after compaction, routing constraints can leave big voids between
  // layers/rows. Any interior band (horizontal or vertical) that contains no
  // nodes, groups, labels, or parallel edge runs is compressed to BAND_KEEP.
  // The remap is piecewise-linear and monotonic per axis — equal coordinates
  // stay equal, so orthogonal routes stay orthogonal and nothing can overlap
  // that didn't before.
  {
    const xOcc: Interval[] = [];
    const yOcc: Interval[] = [];
    for (const n of placed) {
      xOcc.push([n.x, n.x + n.width]);
      yOcc.push([n.y, n.y + n.height]);
    }
    for (const g of groups) {
      xOcc.push([g.x, g.x + g.width]);
      yOcc.push([g.y, g.y + g.height]);
    }
    for (const e of rendered) {
      if (e.label && e.labelPos) {
        const dims = labelDims(e.label);
        xOcc.push([e.labelPos.x - dims.width / 2, e.labelPos.x + dims.width / 2]);
        yOcc.push([e.labelPos.y - dims.height / 2, e.labelPos.y + dims.height / 2]);
      }
      // A run keeps a small halo so parallel runs in a squeezed channel don't
      // collapse onto each other. Runs PERPENDICULAR to the squeeze axis are
      // exactly what we want to shorten, so they don't count as occupied.
      for (let i = 0; i < e.points.length - 1; i++) {
        const a = e.points[i]!;
        const b = e.points[i + 1]!;
        if (Math.abs(a.y - b.y) < 0.5) yOcc.push([a.y - 7, a.y + 7]);
        if (Math.abs(a.x - b.x) < 0.5) xOcc.push([a.x - 7, a.x + 7]);
      }
    }
    const fx = buildBandRemap(xOcc);
    const fy = buildBandRemap(yOcc);
    for (const n of placed) {
      n.x = fx(n.x);
      n.y = fy(n.y);
    }
    for (const g of groups) {
      g.x = fx(g.x);
      g.y = fy(g.y);
    }
    for (const e of rendered) {
      for (const p of e.points) {
        p.x = fx(p.x);
        p.y = fy(p.y);
      }
      if (e.labelPos) {
        e.labelPos.x = fx(e.labelPos.x);
        e.labelPos.y = fy(e.labelPos.y);
      }
    }
  }

  let maxX = 0;
  let maxY = 0;
  for (const n of placed) {
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  for (const g of groups) {
    maxX = Math.max(maxX, g.x + g.width);
    maxY = Math.max(maxY, g.y + g.height);
  }

  return {
    nodes: placed,
    groups,
    edges: rendered,
    width: maxX + 16,
    height: maxY + 16,
  };
}

type Interval = [number, number];

/** How much of an empty band survives the squeeze. Matches the tightest
 *  between-layer spacing so squeezed voids read like normal gaps. */
const BAND_KEEP = 72;

/**
 * Build a monotonic piecewise-linear remap that compresses every gap between
 * occupied intervals down to BAND_KEEP. Positions inside a squeezed gap map
 * proportionally; positions past it shift by the accumulated savings.
 */
function buildBandRemap(occupied: Interval[]): (v: number) => number {
  const sorted = occupied
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  const cuts: { start: number; end: number }[] = [];
  for (let i = 0; i < merged.length - 1; i++) {
    const start = merged[i]![1];
    const end = merged[i + 1]![0];
    if (end - start > BAND_KEEP + 8) cuts.push({ start, end });
  }
  if (cuts.length === 0) return (v) => v;
  return (v) => {
    let out = v;
    for (const c of cuts) {
      const len = c.end - c.start;
      if (v >= c.end) out -= len - BAND_KEEP;
      else if (v > c.start) out -= (v - c.start) * (1 - BAND_KEEP / len);
    }
    return out;
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

/** Orthogonal polyline → SVG path with rounded corners. The generous default
 *  radius turns right angles into soft S-curves; it self-clamps to half of
 *  each adjoining segment, so short zig-zags degrade gracefully. */
export function edgePath(points: { x: number; y: number }[], r = 56): string {
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
