// The fixed visual vocabulary for node kinds, expressed with the design system:
// each kind maps to standard Tailwind palette classes for the node's icon tint,
// legend dot, and pulse stroke. The agent only tags a node with a `kind`.

import type { NodeKind } from "@foglamp/contracts/scan";
import {
  IconBoltFilled,
  IconClockFilled,
  IconDatabaseFilled,
  IconGhostFilled,
  IconHexagonFilled,
  type IconProps,
  IconSparklesFilled,
  IconTool,
  IconWorldFilled,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

export interface KindStyle {
  label: string;
  Glyph: ComponentType<IconProps>;
  /** Extra classes for the glyph (e.g. fill outline icons). */
  glyphClass?: string;
  /** Legend dot / accent background. */
  bar: string;
  /** Node icon chip (tint background + foreground). */
  icon: string;
  /** Foreground tint for standalone glyphs (legend, popover). */
  text: string;
  /** Raw color (Tailwind 500) for SVG strokes — edge pulses. */
  hex: string;
}

export const KIND_STYLES: Record<NodeKind, KindStyle> = {
  entry: {
    label: "Entry",
    Glyph: IconBoltFilled,
    bar: "bg-foreground/30",
    icon: "bg-muted text-foreground",
    text: "text-foreground/70",
    hex: "#64748b",
  },
  cron: {
    label: "Cron",
    Glyph: IconClockFilled,
    bar: "bg-amber-500",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    text: "text-amber-600 dark:text-amber-400",
    hex: "#f59e0b",
  },
  agent: {
    label: "Agent",
    Glyph: IconGhostFilled,
    bar: "bg-orange-500",
    icon: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    text: "text-orange-600 dark:text-orange-400",
    hex: "#f97316",
  },
  model: {
    label: "Model",
    Glyph: IconSparklesFilled,
    bar: "bg-blue-500",
    icon: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    text: "text-blue-600 dark:text-blue-400",
    hex: "#3b82f6",
  },
  tool: {
    label: "Tool",
    Glyph: IconTool,
    glyphClass: "fill-current",
    bar: "bg-violet-500",
    icon: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    text: "text-violet-600 dark:text-violet-400",
    hex: "#8b5cf6",
  },
  service: {
    label: "Service",
    Glyph: IconHexagonFilled,
    bar: "bg-pink-500",
    icon: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    text: "text-pink-600 dark:text-pink-400",
    hex: "#ec4899",
  },
  store: {
    label: "Store",
    Glyph: IconDatabaseFilled,
    bar: "bg-emerald-500",
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
    hex: "#10b981",
  },
  external: {
    label: "External",
    Glyph: IconWorldFilled,
    bar: "bg-sky-500",
    icon: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    text: "text-sky-600 dark:text-sky-400",
    hex: "#0ea5e9",
  },
};

export const KIND_ORDER: NodeKind[] = [
  "entry",
  "cron",
  "agent",
  "model",
  "tool",
  "service",
  "store",
  "external",
];

/**
 * Legend groups — only the categories that exist as NODES after folding.
 * Models and tools are folded into their agents' cards, so listing them here
 * would just re-highlight the same agent nodes. Each group shows its lead
 * kind's glyph, tinted with the group color.
 */
export const LEGEND_GROUPS: {
  label: string;
  kinds: NodeKind[];
  Glyph: ComponentType<IconProps>;
  iconClass: string;
}[] = [
  {
    label: "Triggers",
    kinds: ["entry", "cron"],
    Glyph: IconBoltFilled,
    iconClass: "text-amber-500",
  },
  {
    label: "Agents",
    kinds: ["agent"],
    Glyph: IconGhostFilled,
    iconClass: "text-orange-500",
  },
  {
    label: "Services",
    kinds: ["service"],
    Glyph: IconHexagonFilled,
    iconClass: "text-pink-500",
  },
  {
    label: "Stores",
    kinds: ["store"],
    Glyph: IconDatabaseFilled,
    iconClass: "text-emerald-500",
  },
  {
    label: "External",
    kinds: ["external"],
    Glyph: IconWorldFilled,
    iconClass: "text-sky-500",
  },
];
