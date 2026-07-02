// Deterministic "personality" identity derived from the poster data — the
// stats-as-identity hook (à la Arc's member card). Pure rules over data the
// agent already emitted; same data → same card. Each archetype carries its own
// palette + glyph so the rail's art block is unique per codebase shape.

import type { PosterData } from "@foglamp/contracts/poster";
import {
  IconAffiliateFilled,
  IconArchiveFilled,
  IconBoltFilled,
  IconClockFilled,
  type IconProps,
  IconLeafFilled,
  IconSettingsFilled,
  IconSparklesFilled,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

export interface Personality {
  title: string;
  Icon: ComponentType<IconProps>;
  /** Tailwind gradient classes for the card art. */
  gradient: string;
}

export function derivePersonality(data: PosterData): Personality {
  const { stats, graph } = data;
  const kindCount = (k: string) =>
    graph.nodes.filter((n) => n.kind === k).length;
  const crons = kindCount("cron");
  const externals = kindCount("external");
  const stores = kindCount("store");

  // First matching rule wins, most distinctive shapes first.
  if (stats.agents >= 5)
    return {
      title: "Tireless Orchestrator",
      Icon: IconSparklesFilled,
      gradient: "from-orange-500 to-amber-400",
    };
  if (crons >= 3)
    return {
      title: "Punctual Scheduler",
      Icon: IconClockFilled,
      gradient: "from-amber-500 to-yellow-400",
    };
  if (externals >= 4)
    return {
      title: "Boundless Integrator",
      Icon: IconAffiliateFilled,
      gradient: "from-rose-500 to-orange-400",
    };
  if (stats.tools > stats.agents * 2 && stats.tools >= 4)
    return {
      title: "Crafty Toolsmith",
      Icon: IconSettingsFilled,
      gradient: "from-violet-500 to-fuchsia-400",
    };
  if (stores >= 3)
    return {
      title: "Meticulous Archivist",
      Icon: IconArchiveFilled,
      gradient: "from-emerald-500 to-teal-400",
    };
  if (stats.agents === 1 && stats.models === 1)
    return {
      title: "Zen Minimalist",
      Icon: IconLeafFilled,
      gradient: "from-slate-500 to-zinc-400",
    };
  return {
    title: "Steady Builder",
    Icon: IconBoltFilled,
    gradient: "from-blue-500 to-sky-400",
  };
}
