// @foglamp/contracts — the codebase-scan contract.
//
// Single source of truth shared by: the renderer (apps/web), the create/read
// service (packages/api), the DB row type (packages/db), and the extractor
// prompt/skill. The "every scan looks consistent" property comes from the
// *caps* here — the agent is forced to prioritize (top 3 models, top 10 tools,
// short labels, ≤60 nodes) rather than dump everything, so every scan reads
// the same way even when the map is big.
//
// The agent never picks colors, icons, or positions. It emits canonical
// `domain`s (e.g. "openai.com", "exa.ai") that the renderer turns into real
// logos via the favicon service, and a typed node-graph that a deterministic
// dagre layout draws. Same data in → same scan out.

import { z } from "zod";

/** Max label length for graph nodes — keeps node cards a predictable width. */
export const MAX_NODE_LABEL = 28;

/**
 * The kinds of things that appear in a codebase's AI flow map. Each maps to a
 * fixed color + glyph in the renderer — the agent only tags, never styles.
 *
 *  - entry:    an entry point / trigger (route, webhook, page, command)
 *  - cron:     a scheduled / recurring job
 *  - agent:    an agent or named generateText/streamText flow
 *  - model:    an LLM (tag `domain` with the provider, e.g. "anthropic.com")
 *  - tool:     a tool/function the model can call (Exa, Firecrawl, a DB query…)
 *  - service:  an internal business-logic module/pipeline (billing, ingestion,
 *              a queue worker, a domain service) — code the project owns
 *  - store:    a datastore (Postgres, ClickHouse, Redis, a vector index…)
 *  - external: a third-party service/API the flow talks to
 */
export const NodeKind = z.enum([
  "entry",
  "cron",
  "agent",
  "model",
  "tool",
  "service",
  "store",
  "external",
]);
export type NodeKind = z.infer<typeof NodeKind>;

/**
 * Optional edge semantics — what the connection *does*. Rendered quietly:
 * revealed when the viewer traces a flow, unlike an explicit `label` which is
 * always visible.
 */
export const EdgeKind = z.enum(["calls", "reads", "writes", "triggers"]);
export type EdgeKind = z.infer<typeof EdgeKind>;

/** A logo-bearing item in the left rail (a model, tool, or integration). */
const RailItem = z.object({
  /** Stable id, lowercase-kebab (e.g. "gpt-4o", "exa"). */
  id: z.string().min(1).max(64),
  /** Human label shown on the chip (e.g. "GPT-4o", "Exa"). */
  label: z.string().min(1).max(40),
  /** Favicon domain for the logo (e.g. "openai.com"). Omit for a glyph fallback. */
  domain: z.string().min(1).max(120).optional(),
});
export type RailItem = z.infer<typeof RailItem>;

const GraphNode = z.object({
  /** Unique within the graph; referenced by edges. */
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(MAX_NODE_LABEL),
  kind: NodeKind,
  /** Favicon domain for a logo on the node (mostly for model/tool/external). */
  domain: z.string().min(1).max(120).optional(),
  /** One short clarifying line (e.g. a model name under an agent). */
  sub: z.string().max(40).optional(),
  /** Longer context shown on click (e.g. file path, schedule, what it does). */
  detail: z.string().max(200).optional(),
  /** Pipeline stage this node belongs to (e.g. "Setup pipeline"). Nodes sharing
   *  a group render as one labeled vertical stack. */
  group: z.string().min(1).max(24).optional(),
  /** Where this lives in the repo (e.g. "src/agents/support.ts:42"). */
  sourceRef: z.string().min(1).max(120).optional(),
});
export type GraphNode = z.infer<typeof GraphNode>;

const GraphEdge = z.object({
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  /** Optional short edge label (e.g. "on alert", "retry"). */
  label: z.string().max(24).optional(),
  /** Optional edge semantics; used as the label when `label` is omitted. */
  kind: EdgeKind.optional(),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

export const ScanData = z
  .object({
    /** Schema version so the renderer can evolve without breaking old files. */
    version: z.literal(1),

    project: z.object({
      name: z.string().min(1).max(48),
      /** url-safe slug used in the footer (e.g. "foglamp"). */
      slug: z
        .string()
        .min(1)
        .max(48)
        .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and dashes"),
      /** One-line description of the project. */
      tagline: z.string().max(80).optional(),
      /** Favicon domain for the project icon (e.g. the project's site). */
      iconDomain: z.string().max(120).optional(),
      /** ISO date (YYYY-MM-DD) the scan was generated. */
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    }),

    /** Headline counts for the left-rail stat grid. */
    stats: z.object({
      agents: z.number().int().min(0).max(9999),
      models: z.number().int().min(0).max(9999),
      tools: z.number().int().min(0).max(9999),
      integrations: z.number().int().min(0).max(9999),
    }),

    /** The most-used models, ranked. Max 3 so the rail list stays tidy. */
    topModels: z.array(RailItem).max(3).default([]),
    /** The most-used tools. Max 10 — the rail scrolls. */
    topTools: z.array(RailItem).max(10).default([]),
    /** Third-party integrations. Max 10 — the rail scrolls. */
    topIntegrations: z.array(RailItem).max(10).default([]),

    /** The flow map — one big map, business logic included. Caps exist only
     *  to bound pathological payloads; big maps are welcome (the viewer pans). */
    graph: z
      .object({
        nodes: z.array(GraphNode).min(1).max(60),
        edges: z.array(GraphEdge).max(120).default([]),
      })
      .refine(
        (g) => {
          const ids = new Set(g.nodes.map((n) => n.id));
          return g.edges.every((e) => ids.has(e.from) && ids.has(e.to));
        },
        { message: "every edge must reference existing node ids" },
      )
      .refine((g) => new Set(g.nodes.map((n) => n.id)).size === g.nodes.length, {
        message: "node ids must be unique",
      }),
  })
  .strict();

export type ScanData = z.infer<typeof ScanData>;

export interface ValidateOk {
  ok: true;
  data: ScanData;
}
export interface ValidateErr {
  ok: false;
  /** Human-readable lines like `topModels: array must contain at most 3 element(s)`. */
  errors: string[];
}

/**
 * Validate an unknown value (typically `JSON.parse` of an uploaded scan)
 * against the contract. Returns either the parsed, typed data or a flat list of
 * friendly error strings.
 */
export function validateScan(input: unknown): ValidateOk | ValidateErr {
  const res = ScanData.safeParse(input);
  if (res.success) return { ok: true, data: res.data };
  const errors = res.error.issues.map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `${path}: ${issue.message}`;
  });
  return { ok: false, errors };
}
