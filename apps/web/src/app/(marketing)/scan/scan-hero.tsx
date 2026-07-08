"use client";

import type { ScanData } from "@foglamp/contracts/scan";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";

import { HeroGrain } from "@/components/marketing/noise-overlay";
import { CopyScanPromptButton } from "./copy-scan-prompt-button";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// The real scan renderer (ELK layout, pulses, folded model/tool chips) in its
// embedded mode — the hero shows the actual product, not an imitation. Client
// only: elkjs and the layout effects have no server render.
const FlowMap = dynamic(
  () => import("@/components/scan/flow-map").then((m) => m.FlowMap),
  { ssr: false, loading: () => null }
);

// A small, hand-written but contract-shaped demo graph: entries and a cron
// feeding three agents (real models + tools folded in as chips), writing to
// Postgres. Rendered by the same pipeline as a real scan.
const DEMO_GRAPH: ScanData["graph"] = {
  nodes: [
    { id: "chat", label: "Chat", kind: "entry", sub: "/api/chat" },
    { id: "cron", label: "Daily cron", kind: "cron", sub: "digest, evals" },
    {
      id: "support",
      label: "Support agent",
      kind: "agent",
      sub: "answers tickets",
    },
    {
      id: "research",
      label: "Research agent",
      kind: "agent",
      sub: "deep dives",
    },
    { id: "judge", label: "Eval judge", kind: "agent", sub: "scores answers" },
    {
      id: "claude",
      label: "Claude Opus 4.8",
      kind: "model",
      domain: "claude.ai",
    },
    {
      id: "gemini",
      label: "Gemini 3 Pro",
      kind: "model",
      domain: "gemini.google.com",
    },
    { id: "gpt", label: "GPT-5.2", kind: "model", domain: "openai.com" },
    { id: "firecrawl", label: "Firecrawl", kind: "tool", domain: "firecrawl.dev" },
    { id: "exa", label: "Exa", kind: "tool", domain: "exa.ai" },
    { id: "parallel", label: "Parallel", kind: "tool", domain: "parallel.ai" },
    {
      id: "postgres",
      label: "Postgres",
      kind: "store",
      sub: "answers, scores",
      domain: "postgresql.org",
    },
  ],
  edges: [
    { from: "chat", to: "support" },
    { from: "chat", to: "research" },
    { from: "cron", to: "judge" },
    { from: "support", to: "claude" },
    { from: "support", to: "firecrawl" },
    { from: "research", to: "gemini" },
    { from: "research", to: "exa" },
    { from: "research", to: "parallel" },
    { from: "judge", to: "gpt" },
    { from: "support", to: "postgres" },
    { from: "research", to: "postgres" },
    { from: "judge", to: "postgres" },
  ],
};

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
    <section className="relative isolate w-full overflow-x-clip pt-28 pb-10">
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

          <motion.div
            {...rise(0.39)}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <CopyScanPromptButton />
          </motion.div>
        </div>

        {/* The real renderer, embedded and non-interactive. */}
        <motion.div
          {...rise(0.5)}
          aria-hidden
          className="relative hidden h-[440px] min-w-0 flex-1 lg:block"
        >
          <FlowMap graph={DEMO_GRAPH} focusKinds={null} embedded />
        </motion.div>
      </div>
    </section>
  );
}
