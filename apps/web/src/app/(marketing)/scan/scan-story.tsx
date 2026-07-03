"use client";

import {
  IconClipboardTextFilled,
  type IconProps,
  IconLink,
  IconSparkles,
} from "@tabler/icons-react";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import type { ComponentType } from "react";

import { cn } from "@foglamp/ui/lib/utils";

// The scan journey as a drift-story-style band: the left rail walks the three
// beats, the right column shows what each beat actually looks like — the pasted
// prompt, the agent working, and the shareable link landing.

const BEATS = [
  { t: "Step 1", text: "Paste one prompt." },
  { t: "Step 2", text: "Your agent maps the repo." },
  { t: "Then", text: "A link worth sharing.", accent: true },
];

type Ping = {
  icon: ComponentType<IconProps>;
  badge: string;
  name: string;
  meta: string;
  text: string;
  time: string;
};

const PINGS: Ping[] = [
  {
    icon: IconClipboardTextFilled,
    badge: "bg-muted/30 text-foreground",
    name: "You",
    meta: "Claude Code · Cursor · any agent",
    text: "“Analyze this repository and publish a shareable codebase scan…”",
    time: "0:00",
  },
  {
    icon: IconSparkles,
    badge: "bg-orange-500/90 text-white",
    name: "Your agent",
    meta: "exploring",
    text: "Found 6 agents, 1 model, 4 tools and the flows between them. No code or secrets leave — just the map.",
    time: "1:12",
  },
  {
    icon: IconLink,
    badge: "bg-gradient-to-br from-orange-500 to-amber-400 text-white",
    name: "foglamp.dev/scan/olwen-x7f2",
    meta: "scan ready",
    text: "Animated, interactive, and it unfurls on X, Slack — anywhere you drop the link.",
    time: "1:30",
  },
];

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function ScanStory() {
  const reduce = useReducedMotion() ?? false;

  const reveal = (
    delay: number,
    from: { x?: number; y?: number }
  ): MotionProps =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, filter: "blur(0px)", ...from },
          whileInView: { opacity: 1, x: 0, y: 0, filter: "blur(0px)" },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.6, ease: EASE, delay },
        };

  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <div className="relative isolate overflow-hidden rounded-[64px] corner-squircle bg-card dark:bg-card/50 shadow-(--custom-shadow) px-2 py-3 sm:px-12 sm:py-24">
        {/* Same film-grain texture as the landing's drift band. */}
        <figure
          aria-hidden
          className="absolute inset-0 -z-10 pointer-events-none opacity-10 mix-blend-screen filter-[url('#scan-noise-fx')_grayscale(100%)]"
        >
          <svg className="size-full">
            <filter id="scan-noise-fx">
              <feTurbulence baseFrequency="0.8" />
            </filter>
          </svg>
        </figure>
        <div className="relative z-10 mx-auto grid max-w-5xl items-center gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-20">
          {/* Left: the three-beat rail (same choreography as DriftStory). */}
          <ol className="font-display flex flex-col">
            {BEATS.map((b, i) => {
              const first = i === 0;
              const last = i === BEATS.length - 1;
              const STEP = 0.6;
              const lineDelay = i * STEP;
              const dotDelay = first
                ? 0
                : last
                  ? i * STEP + STEP
                  : i * STEP + STEP / 2;

              const lineMotion: MotionProps = reduce
                ? {}
                : {
                    initial: { scaleY: 0 },
                    whileInView: { scaleY: 1 },
                    viewport: { once: true, margin: "-80px" },
                    transition: {
                      duration: STEP,
                      ease: "linear",
                      delay: lineDelay,
                    },
                  };
              const dotMotion: MotionProps = reduce
                ? {}
                : {
                    initial: { scale: 0, opacity: 0 },
                    whileInView: { scale: 1, opacity: 1 },
                    viewport: { once: true, margin: "-80px" },
                    transition: {
                      duration: 0.4,
                      ease: "backOut",
                      delay: dotDelay,
                    },
                  };

              return (
                <li key={b.t} className="flex min-h-24 items-center sm:min-h-28">
                  <motion.span
                    className={cn(
                      "w-16 shrink-0 text-right text-xs font-medium tracking-wide text-muted-foreground/70 sm:w-20 sm:text-sm",
                      b.accent && "text-orange-500 dark:text-orange-400"
                    )}
                    {...reveal(dotDelay, { y: 12 })}
                  >
                    {b.t}
                  </motion.span>
                  <span className="relative w-8 shrink-0 self-stretch sm:w-10">
                    <motion.span
                      aria-hidden
                      className={cn(
                        "absolute left-[calc(50%-0.5px)] w-px origin-top bg-border",
                        first && "top-1/2 bottom-0",
                        last && "top-0 bottom-1/2",
                        !first && !last && "inset-y-0",
                        b.accent && "bg-orange-500/40 dark:bg-orange-400/40"
                      )}
                      {...lineMotion}
                    />
                    <motion.span
                      aria-hidden
                      className={cn(
                        "absolute top-1/2 left-1/2 -mt-1 -ml-1 size-2 rounded-full ring-4 ring-card",
                        b.accent
                          ? "bg-orange-500 shadow-[0_0_12px_2px_rgba(249,115,22,0.5)] dark:bg-orange-400"
                          : "bg-foreground shadow-[0_0_10px_1px_rgba(255,255,255,0.22)]"
                      )}
                      {...dotMotion}
                    />
                  </span>
                  <motion.span
                    className="text-2xl font-medium tracking-tight text-balance text-foreground sm:text-3xl ml-2"
                    {...reveal(dotDelay, { y: 12 })}
                  >
                    {b.text}
                  </motion.span>
                </li>
              );
            })}
          </ol>

          {/* Right: the journey, one card per beat. */}
          <div className="flex flex-col gap-4">
            {PINGS.map((p, i) => (
              <motion.div
                key={p.name}
                className="flex items-start gap-3 rounded-[36px] corner-squircle dark:shadow-(--custom-shadow) bg-muted/50 p-3.5 shadow-sm backdrop-blur-sm"
                {...reveal(1.6 + i * 0.4, { x: 4 })}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-3xl corner-squircle dark:shadow-(--custom-shadow)",
                    p.badge
                  )}
                >
                  <p.icon size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="truncate font-medium text-foreground">
                      {p.name}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {p.meta}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground/50">
                      {p.time}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
                    {p.text}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
