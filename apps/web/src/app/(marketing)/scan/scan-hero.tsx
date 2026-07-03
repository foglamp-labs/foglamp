"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconBoltFilled,
  IconClockFilled,
  IconFileTextFilled,
  IconGhostFilled,
} from "@tabler/icons-react";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  ClaudeLogo,
  GeminiLogo,
  OpenAILogo,
} from "@/components/brand-logos";
import { Favicon } from "@/components/scan/brand";
import { edgePath } from "@/components/scan/layout";
import { CopyScanPromptButton } from "./copy-scan-prompt-button";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// ─── Decorative mini-map ──────────────────────────────────────────────────────
// A hand-placed slice of a real scan — entries/crons feeding three agents
// with real model + tool logos (Claude/Gemini/GPT, Exa/Firecrawl/Parallel),
// all writing to Postgres. Same edgePath + pulses as the real map.

const MAP_W = 620;
const MAP_H = 430;

type MiniEmbed = { label: string; logo: ReactNode };
type MiniNode = {
  x: number;
  y: number;
  w: number;
  label: string;
  sub: string;
  head: ReactNode;
  chip: string;
  delay: number;
  embeds?: MiniEmbed[];
};

const fav = (domain: string) => (
  <Favicon domain={domain} className="size-3 rounded-[3px]" fallback={null} />
);

const MINI_NODES: MiniNode[] = [
  {
    x: 0,
    y: 24,
    w: 150,
    label: "Chat",
    sub: "/api/chat",
    head: <IconBoltFilled className="size-3.5" />,
    chip: "bg-muted text-foreground",
    delay: 0.6,
  },
  {
    x: 0,
    y: 330,
    w: 150,
    label: "Daily cron",
    sub: "digest, evals",
    head: <IconClockFilled className="size-3.5" />,
    chip: "bg-amber-500/10 text-amber-500",
    delay: 0.7,
  },
  {
    x: 212,
    y: 0,
    w: 210,
    label: "Support agent",
    sub: "answers tickets",
    head: <IconGhostFilled className="size-3.5" />,
    chip: "bg-orange-500/10 text-orange-500",
    delay: 0.95,
    embeds: [
      { label: "Claude Opus 4.8", logo: <ClaudeLogo className="size-3" /> },
      { label: "Firecrawl", logo: fav("firecrawl.dev") },
    ],
  },
  {
    x: 212,
    y: 160,
    w: 210,
    label: "Research agent",
    sub: "deep dives",
    head: <IconGhostFilled className="size-3.5" />,
    chip: "bg-orange-500/10 text-orange-500",
    delay: 1.15,
    embeds: [
      { label: "Gemini 3 Pro", logo: <GeminiLogo className="size-3" /> },
      { label: "Exa", logo: fav("exa.ai") },
      { label: "Parallel", logo: fav("parallel.ai") },
    ],
  },
  {
    x: 212,
    y: 344,
    w: 210,
    label: "Eval judge",
    sub: "scores answers",
    head: <IconGhostFilled className="size-3.5" />,
    chip: "bg-orange-500/10 text-orange-500",
    delay: 1.3,
    embeds: [{ label: "GPT-5.2", logo: <OpenAILogo className="size-3" /> }],
  },
  {
    x: 486,
    y: 186,
    w: 134,
    label: "Postgres",
    sub: "answers, scores",
    head: fav("postgresql.org"),
    chip: "bg-emerald-500/10 text-emerald-500",
    delay: 1.5,
  },
];

const MINI_EDGES = [
  // chat → support agent
  {
    points: [
      { x: 150, y: 48 },
      { x: 181, y: 48 },
      { x: 181, y: 28 },
      { x: 212, y: 28 },
    ],
    color: "#64748b",
    delay: 0.8,
  },
  // chat → research agent
  {
    points: [
      { x: 150, y: 48 },
      { x: 181, y: 48 },
      { x: 181, y: 188 },
      { x: 212, y: 188 },
    ],
    color: "#64748b",
    delay: 0.9,
  },
  // cron → eval judge
  {
    points: [
      { x: 150, y: 354 },
      { x: 181, y: 354 },
      { x: 181, y: 372 },
      { x: 212, y: 372 },
    ],
    color: "#f59e0b",
    delay: 1.0,
  },
  // support agent → postgres
  {
    points: [
      { x: 422, y: 28 },
      { x: 454, y: 28 },
      { x: 454, y: 210 },
      { x: 486, y: 210 },
    ],
    color: "#f97316",
    delay: 1.2,
  },
  // research agent → postgres
  {
    points: [
      { x: 422, y: 188 },
      { x: 454, y: 188 },
      { x: 454, y: 210 },
      { x: 486, y: 210 },
    ],
    color: "#f97316",
    delay: 1.35,
  },
  // eval judge → postgres
  {
    points: [
      { x: 422, y: 372 },
      { x: 454, y: 372 },
      { x: 454, y: 210 },
      { x: 486, y: 210 },
    ],
    color: "#f97316",
    delay: 1.5,
  },
];

function MiniMap({ reduce }: { reduce: boolean }) {
  return (
    <div
      className="relative hidden shrink-0 lg:block"
      style={{ width: MAP_W, height: MAP_H }}
      aria-hidden
    >
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={MAP_W}
        height={MAP_H}
      >
        {MINI_EDGES.map((e, i) => (
          <g key={i}>
            <motion.path
              d={edgePath(e.points)}
              fill="none"
              stroke="rgba(120,124,136,0.4)"
              strokeWidth={1.4}
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: e.delay, ease: "easeOut" }}
            />
            {!reduce && (
              <motion.path
                d={edgePath(e.points)}
                fill="none"
                stroke={e.color}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeDasharray="5 56"
                strokeOpacity={0.7}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, strokeDashoffset: [0, -61] }}
                transition={{
                  opacity: { delay: e.delay + 0.5, duration: 0.4 },
                  strokeDashoffset: {
                    delay: e.delay + 0.5,
                    duration: 2.2,
                    repeat: Infinity,
                    ease: "linear",
                  },
                }}
              />
            )}
          </g>
        ))}
      </svg>

      {MINI_NODES.map((n) => (
        <motion.div
          key={n.label}
          className="border-overlay absolute flex flex-col overflow-hidden rounded-2xl corner-squircle bg-card shadow-(--custom-shadow)"
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
          <div className="flex h-12 items-center gap-2.5 px-3.5">
            <span
              className={cn(
                "flex size-6 flex-none items-center justify-center rounded-md",
                n.chip
              )}
            >
              {n.head}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium leading-snug">
                {n.label}
              </span>
              <span className="truncate text-[11px] leading-snug text-muted-foreground">
                {n.sub}
              </span>
            </span>
          </div>
          {n.embeds ? (
            <div className="mx-3.5 flex flex-col gap-1.5 border-t border-muted pt-2 pb-2.5">
              {n.embeds.map((em) => (
                <span key={em.label} className="flex items-center gap-1.5">
                  <span className="flex size-3.5 items-center justify-center">
                    {em.logo}
                  </span>
                  <span className="text-[11px] font-medium">{em.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </motion.div>
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
    <section className="relative w-full overflow-x-clip pt-28 pb-10">
      {/* faint map grid behind the hero, fading out downward */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(color-mix(in_oklab,var(--border)_28%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--border)_28%,transparent)_1px,transparent_1px)] bg-size-[56px_56px] [background-position:center] [mask-image:linear-gradient(to_bottom,#000_20%,transparent_90%)]"
      />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-12 px-5 sm:px-8">
        <div className="max-w-xl">
          <motion.p
            {...rise(0.05)}
            className="text-sm font-medium tracking-wide text-orange-500"
          >
            Codebase Scan
          </motion.p>
          <motion.h1
            {...rise(0.15)}
            className="font-display mt-4 text-4xl font-semibold tracking-tight text-balance md:text-5xl"
          >
            Map your codebase. Share it.
          </motion.h1>
          <motion.p
            {...rise(0.27)}
            className="mt-5 max-w-md text-lg text-muted-foreground text-pretty"
          >
            One prompt turns your repo into a beautiful, interactive map of how
            it uses AI.{" "}
            <span className="text-primary">No install, no account.</span>
          </motion.p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <motion.div {...rise(0.39)}>
              <CopyScanPromptButton />
            </motion.div>
            <motion.div {...rise(0.49)}>
              <Button
                render={<Link href="/scan/prompt" target="_blank" />}
                size="lg"
                className="text-base"
                variant="secondary"
              >
                Read the prompt
                <IconFileTextFilled className="size-4 opacity-90" />
              </Button>
            </motion.div>
          </div>
        </div>

        <MiniMap reduce={reduce} />
      </div>
    </section>
  );
}
