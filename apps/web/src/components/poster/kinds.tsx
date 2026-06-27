// The fixed visual vocabulary for node kinds. The agent only tags a node with a
// `kind`; the color and glyph are decided here — that's what keeps posters
// consistent across every repo.

import type { NodeKind } from "@foglamp/contracts/poster";
import {
  IconBolt,
  IconBrain,
  IconClockHour4,
  IconDatabase,
  type IconProps,
  IconSparkles,
  IconTool,
  IconWorld,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

export interface KindStyle {
  label: string;
  /** CSS custom property holding this kind's accent color (see poster.css). */
  colorVar: string;
  Glyph: ComponentType<IconProps>;
}

export const KIND_STYLES: Record<NodeKind, KindStyle> = {
  entry: { label: "Entry", colorVar: "--k-entry", Glyph: IconBolt },
  cron: { label: "Cron", colorVar: "--k-cron", Glyph: IconClockHour4 },
  agent: { label: "Agent", colorVar: "--k-agent", Glyph: IconSparkles },
  model: { label: "Model", colorVar: "--k-model", Glyph: IconBrain },
  tool: { label: "Tool", colorVar: "--k-tool", Glyph: IconTool },
  store: { label: "Store", colorVar: "--k-store", Glyph: IconDatabase },
  external: { label: "External", colorVar: "--k-external", Glyph: IconWorld },
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
