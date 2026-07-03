"use client";

// The "how it works" band: before / after. A wall of illegible file paths on
// the left, one prompt in the middle, a tiny scan map on the right. Full-bleed
// section, no card wrapper.

import {
  IconArrowRight,
  IconClipboardTextFilled,
  IconGhostFilled,
  IconSparkles,
} from "@tabler/icons-react";
import { type MotionProps, motion, useReducedMotion } from "motion/react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FILE_WALL = [
  "apps/server/src/ai/agents/brand-analysis/agent.ts",
  "apps/server/src/routes/queue.ts",
  "packages/db/src/schema/brand-mention.ts",
  "apps/server/src/services/brightdata.ts",
  "apps/web/src/app/dashboard/page.tsx",
  "apps/server/src/ai/agents/content-creator/agent.ts",
  "packages/api/src/services/cms/github.ts",
  "apps/server/src/services/firecrawl.ts",
  "apps/server/src/ai/models.ts",
  "apps/server/vercel.json",
  "apps/server/src/ai/agents/geo-strategy/agent.ts",
  "packages/db/src/schema/content.ts",
];

export function ScanStory() {
  const reduce = useReducedMotion() ?? false;
  const reveal = (
    delay: number,
    from: { x?: number; y?: number } = {}
  ): MotionProps =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, ...from },
          whileInView: { opacity: 1, x: 0, y: 0 },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.55, ease: EASE, delay },
        };

  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <motion.h2
        {...reveal(0)}
        className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
      >
        One prompt, from repo to map.
      </motion.h2>
      <motion.p
        {...reveal(0.08)}
        className="mt-3 max-w-md text-muted-foreground text-pretty"
      >
        Your agent explores the codebase, draws the map and publishes it to a
        link you can share.
      </motion.p>

      <div className="mt-14 grid items-center gap-10 lg:grid-cols-[1fr_auto_1fr]">
        <motion.div {...reveal(0.1)} className="relative overflow-hidden">
          <div className="flex flex-col gap-2 font-mono text-[11px] leading-relaxed text-muted-foreground/60 [mask-image:linear-gradient(to_bottom,#000_35%,transparent_95%)]">
            {FILE_WALL.map((f) => (
              <span key={f} className="truncate">
                {f}
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            What your repo looks like to everyone else
          </p>
        </motion.div>

        <motion.div
          {...reveal(0.3)}
          className="mx-auto flex flex-col items-center gap-2"
        >
          <span className="flex h-9 items-center gap-2 rounded-full bg-orange-500/90 px-4 text-sm font-medium text-white shadow-(--custom-shadow)">
            one prompt
            <IconArrowRight className="size-4" />
          </span>
        </motion.div>

        <motion.div {...reveal(0.5, { x: 10 })} className="relative">
          <div className="relative h-44">
            <span className="border-overlay absolute left-0 top-2 flex h-9 w-28 items-center gap-2 rounded-xl bg-background/80 px-2.5 text-xs font-medium shadow-(--custom-shadow)">
              <IconClipboardTextFilled className="size-3.5 text-muted-foreground" />
              Daily cron
            </span>
            <span className="border-overlay absolute left-24 top-16 flex h-9 w-32 items-center gap-2 rounded-xl bg-background/80 px-2.5 text-xs font-medium shadow-(--custom-shadow)">
              <IconGhostFilled className="size-3.5 text-orange-500" />
              Agents ×6
            </span>
            <span className="border-overlay absolute right-0 top-32 flex h-9 w-28 items-center gap-2 rounded-xl bg-background/80 px-2.5 text-xs font-medium shadow-(--custom-shadow)">
              <IconSparkles className="size-3.5 text-emerald-500" />
              Postgres
            </span>
            <svg className="absolute inset-0 size-full overflow-visible">
              <path
                d="M 112 24 L 140 24 L 140 84 L 96 84 M 224 84 L 250 84 L 250 146 L 232 146"
                fill="none"
                stroke="rgba(120,124,136,0.45)"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            What it looks like as a scan
          </p>
        </motion.div>
      </div>
    </section>
  );
}
