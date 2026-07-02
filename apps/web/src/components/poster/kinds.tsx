// The fixed visual vocabulary for node kinds, expressed with the design system:
// each kind maps to a Badge variant plus standard Tailwind palette classes for
// the node's accent bar and icon tint. The agent only tags a node with a `kind`.

import type { NodeKind } from "@foglamp/contracts/poster";
import {
  IconBoltFilled,
  IconClockFilled,
  IconDatabaseFilled,
  IconGhostFilled,
  type IconProps,
  IconSettingsFilled,
  IconSparklesFilled,
  IconWorldFilled,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

type BadgeVariant = "outline" | "amber" | "orange" | "blue" | "violet" | "emerald" | "rose";

export interface KindStyle {
  label: string;
  Glyph: ComponentType<IconProps>;
  /** Badge variant used for inline embeds and the legend. */
  badge: BadgeVariant;
  /** Left accent bar background. */
  bar: string;
  /** Node icon chip (tint background + foreground). */
  icon: string;
  /** Raw color (Tailwind 500) for SVG strokes — edge pulses. */
  hex: string;
}

export const KIND_STYLES: Record<NodeKind, KindStyle> = {
  entry: {
    label: "Entry",
    Glyph: IconBoltFilled,
    badge: "outline",
    bar: "bg-foreground/30",
    icon: "bg-muted text-foreground",
    hex: "#64748b",
  },
  cron: {
    label: "Cron",
    Glyph: IconClockFilled,
    badge: "amber",
    bar: "bg-amber-500",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    hex: "#f59e0b",
  },
  agent: {
    label: "Agent",
    Glyph: IconGhostFilled,
    badge: "orange",
    bar: "bg-orange-500",
    icon: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    hex: "#f97316",
  },
  model: {
    label: "Model",
    Glyph: IconSparklesFilled,
    badge: "blue",
    bar: "bg-blue-500",
    icon: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    hex: "#3b82f6",
  },
  tool: {
    label: "Tool",
    Glyph: IconSettingsFilled,
    badge: "violet",
    bar: "bg-violet-500",
    icon: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    hex: "#8b5cf6",
  },
  store: {
    label: "Store",
    Glyph: IconDatabaseFilled,
    badge: "emerald",
    bar: "bg-emerald-500",
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    hex: "#10b981",
  },
  external: {
    label: "External",
    Glyph: IconWorldFilled,
    badge: "rose",
    bar: "bg-rose-500",
    icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    hex: "#f43f5e",
  },
};

export const KIND_ORDER: NodeKind[] = [
  "entry",
  "cron",
  "agent",
  "model",
  "tool",
  "store",
  "external",
];
