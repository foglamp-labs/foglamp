"use client";

import type { NodeKind } from "@foglamp/contracts/scan";
import { cn } from "@foglamp/ui/lib/utils";
import { type MotionProps, motion, useReducedMotion } from "motion/react";

import { HeroGrain } from "@/components/marketing/noise-overlay";
import { Favicon, ModelIcon } from "@/components/scan/brand";
import { KIND_STYLES } from "@/components/scan/kinds";
import { CopyScanPromptButton } from "./copy-scan-prompt-button";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// ─── Hand-composed hero map ───────────────────────────────────────────────────
// The real scan renders with an auto layout; the hero wants a looser, taller
// composition — nodes scattered across the whole right half with flowing
// curves between them. Hand-placed on a 760x640 canvas, drawn with the exact
// node styling of the real map (kind tints, favicons, folded chips).

const CANVAS_W = 760;
const CANVAS_H = 640;

type HeroEmbed = { label: string; kind: "model" | "tool"; domain?: string };
type HeroNode = {
  id: string;
  x: number;
  y: number;
  w: number;
  kind: NodeKind;
  label: string;
  sub?: string;
  domain?: string;
  embeds?: HeroEmbed[];
  delay: number;
};

const NODES: HeroNode[] = [
  {
    id: "app",
    x: 8,
    y: 48,
    w: 210,
    kind: "entry",
    label: "Next.js app",
    sub: "/api/chat",
    domain: "nextjs.org",
    delay: 0.55,
  },
  {
    id: "cron",
    x: 0,
    y: 470,
    w: 200,
    kind: "cron",
    label: "Daily cron",
    sub: "digest, evals",
    delay: 0.7,
  },
  {
    id: "research",
    x: 268,
    y: 200,
    w: 232,
    kind: "agent",
    label: "Research agent",
    sub: "deep dives",
    delay: 0.95,
    embeds: [
      { label: "GPT-5.5", kind: "model", domain: "openai.com" },
      { label: "Exa", kind: "tool", domain: "exa.ai" },
      { label: "Parallel", kind: "tool", domain: "parallel.ai" },
    ],
  },
  {
    id: "support",
    x: 282,
    y: 452,
    w: 232,
    kind: "agent",
    label: "Support agent",
    sub: "answers tickets",
    delay: 1.15,
    embeds: [
      { label: "Claude Fable 5", kind: "model", domain: "claude.ai" },
      { label: "Firecrawl", kind: "tool", domain: "firecrawl.dev" },
    ],
  },
  {
    id: "resend",
    x: 556,
    y: 24,
    w: 200,
    kind: "external",
    label: "Resend",
    sub: "digest emails",
    domain: "resend.com",
    delay: 1.35,
  },
  {
    id: "postgres",
    x: 548,
    y: 330,
    w: 208,
    kind: "store",
    label: "Postgres",
    sub: "answers, scores",
    domain: "postgresql.org",
    delay: 1.5,
  },
  {
    id: "slack",
    x: 556,
    y: 556,
    w: 200,
    kind: "external",
    label: "Slack",
    sub: "escalations",
    domain: "slack.com",
    delay: 1.6,
  },
];

// Flowing curves, drawn to roughly match the sketch: long laterals with soft
// vertical swings. Each is a single cubic bezier in canvas coordinates.
const EDGES: { d: string; color: string; delay: number }[] = [
  // app (right edge, 218,76) → research (left edge, 268,250)
  { d: "M 218 76 C 300 80, 210 250, 268 250", color: "#64748b", delay: 0.7 },
  // cron (200,498) → support (282,508)
  { d: "M 200 498 C 235 498, 245 508, 282 508", color: "#f59e0b", delay: 0.85 },
  // research (500,240) → resend (556,52)
  { d: "M 500 240 C 580 235, 495 52, 556 52", color: "#f97316", delay: 1.1 },
  // research (500,290) → postgres (548,352)
  { d: "M 500 290 C 545 295, 500 352, 548 352", color: "#f97316", delay: 1.25 },
  // support (514,495) → postgres (548,364)
  { d: "M 514 495 C 565 488, 495 364, 548 364", color: "#f97316", delay: 1.4 },
  // support (514,530) → slack (556,584)
  { d: "M 514 530 C 560 535, 505 584, 556 584", color: "#f97316", delay: 1.5 },
];

function HeroNodeCard({ n, reduce }: { n: HeroNode; reduce: boolean }) {
  const style = KIND_STYLES[n.kind];
  const Glyph = style.Glyph;
  return (
    <motion.div
      className="absolute"
      style={{ left: n.x, top: n.y, width: n.w }}
      initial={
        reduce ? false : { opacity: 0, scale: 0.85, filter: "blur(6px)" }
      }
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{
        type: "spring",
        duration: 0.55,
        bounce: 0.25,
        delay: n.delay,
      }}
    >
      <div className="flex flex-col overflow-hidden rounded-3xl corner-squircle bg-card text-card-foreground shadow-(--custom-shadow)">
        <div className="flex h-14 flex-none items-center gap-2.5 px-3.5">
          <span
            className={cn(
              "flex size-7 flex-none items-center justify-center rounded-2xl corner-squircle",
              style.icon
            )}
          >
            <Favicon
              domain={n.domain}
              className="size-3.5 rounded-sm"
              fallback={
                <Glyph
                  className={cn("size-3.5", style.glyphClass)}
                  stroke={2}
                />
              }
            />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium leading-snug">
              {n.label}
            </span>
            {n.sub ? (
              <span className="truncate text-xs leading-snug text-muted-foreground">
                {n.sub}
              </span>
            ) : null}
          </span>
        </div>
        {n.embeds?.length ? (
          <div className="mx-4 flex flex-col items-start gap-2 border-t border-muted pt-2.5 pb-2.5">
            {n.embeds.map((em) => (
              <span
                key={em.label}
                className="flex max-w-full items-center gap-1.5"
              >
                {em.kind === "model" ? (
                  <ModelIcon
                    label={em.label}
                    domain={em.domain}
                    className="size-3.5"
                  />
                ) : (
                  <Favicon
                    domain={em.domain}
                    className="size-3.5 rounded-sm"
                    fallback={null}
                  />
                )}
                <span className="truncate text-xs font-medium">{em.label}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function HeroMap({ reduce }: { reduce: boolean }) {
  return (
    <div
      aria-hidden
      className="relative shrink-0"
      style={{ width: CANVAS_W, height: CANVAS_H }}
    >
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={CANVAS_W}
        height={CANVAS_H}
      >
        {EDGES.map((e, i) => (
          <g key={i}>
            <motion.path
              d={e.d}
              fill="none"
              stroke="color-mix(in oklab, var(--border) 65%, var(--muted-foreground) 35%)"
              strokeWidth={1.6}
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.7, delay: e.delay, ease: "easeOut" }}
            />
            {!reduce && (
              <motion.path
                d={e.d}
                fill="none"
                stroke={e.color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeDasharray="5 56"
                strokeOpacity={0.7}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, strokeDashoffset: [0, -61] }}
                transition={{
                  opacity: { delay: e.delay + 0.5, duration: 0.4 },
                  strokeDashoffset: {
                    delay: e.delay + 0.5,
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "linear",
                  },
                }}
              />
            )}
          </g>
        ))}
      </svg>

      {NODES.map((n) => (
        <HeroNodeCard key={n.id} n={n} reduce={reduce} />
      ))}
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

export function ScanHero() {
  const reduce = useReducedMotion() ?? false;
  const rise = (delay: number): MotionProps =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.7, ease: EASE, delay },
        };

  return (
    <section className="relative isolate w-full overflow-x-clip pt-28 pb-40">
      {/* Same grain treatment as the landing hero. */}
      <HeroGrain id="scan-hero-noise" />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-12 px-5 sm:px-8">
        <div className="max-w-xl shrink-0">
          <motion.p
            {...rise(0.05)}
            className="text-sm font-medium tracking-wide text-orange-500"
          >
            Foglamp Scan
          </motion.p>
          <motion.h1
            {...rise(0.15)}
            className="font-display mt-4 text-4xl font-semibold tracking-tight text-balance md:text-5xl"
          >
            Map your project. Share it.
          </motion.h1>
          <motion.p
            {...rise(0.27)}
            className="mt-5 max-w-lg text-lg text-muted-foreground text-pretty"
          >
            One prompt turns your repo into a beautiful, interactive map of how
            it uses AI. No install, no account.
          </motion.p>

          <motion.div
            {...rise(0.39)}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <CopyScanPromptButton />
          </motion.div>
        </div>

        {/* The scattered map filling the right half. */}
        <motion.div {...rise(0.5)} className="hidden min-w-0 lg:block">
          <HeroMap reduce={reduce} />
        </motion.div>
      </div>
    </section>
  );
}
