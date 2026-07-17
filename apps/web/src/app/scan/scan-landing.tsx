"use client";

import type { ScanData } from "@foglamp/contracts/scan";
import { Button } from "@foglamp/ui/components/button";
import {
  IconCaptureFilled,
  IconRouteScan,
  IconSitemapFilled,
  IconZoomScanFilled,
} from "@tabler/icons-react";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { BrandMark } from "@/components/marketing/brand-mark";
import { FilmGrain } from "@/components/marketing/noise-overlay";
import { FlowMap } from "@/components/scan/flow-map";
import { CopyScanPromptButton } from "./copy-scan-prompt-button";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// The hero map is the REAL renderer on a curated demo graph — folding, soft
// curves, traveling beams, and the agent glow all come along for free, so the
// hero always previews exactly what a published scan looks like.
const DEMO_GRAPH: ScanData["graph"] = {
  nodes: [
    {
      id: "app",
      label: "Next.js app",
      kind: "entry",
      sub: "/api/chat",
      domain: "nextjs.org",
    },
    { id: "cron", label: "Daily cron", kind: "cron", sub: "digest, evals" },
    {
      id: "research",
      label: "Research agent",
      kind: "agent",
      sub: "deep dives",
    },
    {
      id: "support",
      label: "Support agent",
      kind: "agent",
      sub: "answers tickets",
    },
    {
      id: "billing",
      label: "Billing service",
      kind: "service",
      sub: "plans & quotas",
    },
    {
      id: "webhook",
      label: "Stripe webhook",
      kind: "entry",
      sub: "/webhooks/stripe",
    },
    {
      id: "judge",
      label: "Evals judge",
      kind: "agent",
      sub: "LLM-as-judge",
    },
    { id: "gpt", label: "GPT-5.5", kind: "model", domain: "openai.com" },
    {
      id: "claude",
      label: "Claude Fable 5",
      kind: "model",
      domain: "claude.ai",
    },
    { id: "exa", label: "Exa", kind: "tool", domain: "exa.ai" },
    {
      id: "parallel",
      label: "Parallel",
      kind: "tool",
      domain: "parallel.ai",
    },
    {
      id: "firecrawl",
      label: "Firecrawl",
      kind: "tool",
      domain: "firecrawl.dev",
    },
    {
      id: "pg",
      label: "Postgres",
      kind: "store",
      sub: "answers, scores",
      domain: "postgresql.org",
    },
    {
      id: "resend",
      label: "Resend",
      kind: "external",
      sub: "digest emails",
      domain: "resend.com",
    },
    {
      id: "slack",
      label: "Slack",
      kind: "external",
      sub: "escalations",
      domain: "slack.com",
    },
    { id: "stripe", label: "Stripe", kind: "external", domain: "stripe.com" },
  ],
  edges: [
    { from: "app", to: "research", kind: "triggers" },
    { from: "app", to: "support", kind: "triggers" },
    { from: "app", to: "billing", kind: "calls" },
    { from: "cron", to: "research", kind: "triggers", label: "daily digest" },
    { from: "cron", to: "judge", kind: "triggers", label: "nightly evals" },
    { from: "judge", to: "claude", kind: "calls" },
    { from: "judge", to: "pg", kind: "writes", label: "scores" },
    { from: "webhook", to: "billing", kind: "calls" },
    { from: "research", to: "gpt", kind: "calls" },
    { from: "research", to: "exa", kind: "calls" },
    { from: "research", to: "parallel", kind: "calls" },
    { from: "support", to: "claude", kind: "calls" },
    { from: "support", to: "firecrawl", kind: "calls" },
    { from: "research", to: "resend", kind: "calls", label: "digest emails" },
    { from: "research", to: "pg", kind: "writes" },
    { from: "support", to: "pg", kind: "reads" },
    { from: "support", to: "slack", kind: "calls", label: "escalations" },
    {
      from: "billing",
      to: "stripe",
      kind: "calls",
      label: "charges on trial end",
    },
  ],
};

// Mobile hero map — a hand-tuned portrait flow, 1-1-2-2-1: entry → job queue →
// two agents side by side → store + notifications → the email that goes out.
const MOBILE_GRAPH: ScanData["graph"] = {
  nodes: [
    {
      id: "app",
      label: "Next.js app",
      kind: "entry",
      sub: "/api/chat",
      domain: "nextjs.org",
    },
    {
      id: "queue",
      label: "Job queue",
      kind: "service",
      sub: "fan-out",
    },
    {
      id: "research",
      label: "Research agent",
      kind: "agent",
      sub: "deep dives",
    },
    {
      id: "support",
      label: "Support agent",
      kind: "agent",
      sub: "answers tickets",
    },
    { id: "gpt", label: "GPT-5.5", kind: "model", domain: "openai.com" },
    { id: "exa", label: "Exa", kind: "tool", domain: "exa.ai" },
    {
      id: "claude",
      label: "Claude Fable 5",
      kind: "model",
      domain: "claude.ai",
    },
    {
      id: "pg",
      label: "Postgres",
      kind: "store",
      sub: "answers, scores",
      domain: "postgresql.org",
    },
    {
      id: "notify",
      label: "Notifications",
      kind: "service",
      sub: "digests, alerts",
    },
    {
      id: "resend",
      label: "Resend",
      kind: "external",
      sub: "digest emails",
      domain: "resend.com",
    },
  ],
  edges: [
    { from: "app", to: "queue", kind: "triggers" },
    { from: "queue", to: "research", kind: "triggers" },
    { from: "queue", to: "support", kind: "triggers" },
    { from: "research", to: "gpt", kind: "calls" },
    { from: "research", to: "exa", kind: "calls" },
    { from: "support", to: "claude", kind: "calls" },
    { from: "research", to: "pg", kind: "writes" },
    { from: "support", to: "pg", kind: "writes" },
    { from: "support", to: "notify", kind: "calls" },
    { from: "notify", to: "resend", kind: "calls" },
  ],
};

export function ScanLanding() {
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
    <div className="fixed inset-0 isolate overflow-hidden bg-background">
      {/* Same grain as the landing hero, but masked so it dissolves toward
          all four edges instead of running hard into the viewport border. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          WebkitMaskImage:
            "linear-gradient(to right, transparent, #000 52%, #000 82%, transparent), linear-gradient(to bottom, transparent, #000 50%, #000 18%, transparent)",
          maskImage:
            "linear-gradient(to right, transparent, #000 52%, #000 82%, transparent), linear-gradient(to bottom, transparent, #000 50%, #000 18%, transparent)",
          WebkitMaskComposite: "source-in",
          maskComposite: "intersect",
        }}
      >
        <FilmGrain
          id="scan-hero-noise"
          className="opacity-15 mix-blend-screen"
        />
      </div>

      {/* The live demo map — clear of the corner chrome (button row on top,
          copy bottom-left) with breathing room off the right edge. */}
      <motion.div
        {...rise(0.5)}
        aria-hidden
        className="absolute hidden lg:top-36 lg:right-[5%] lg:bottom-[22%] lg:left-[24%] lg:block"
      >
        <FlowMap graph={DEMO_GRAPH} focusKinds={null} embedded />
      </motion.div>

      {/* Mobile: a hand-tuned mini flow that fits the band whole. */}
      <motion.div
        {...rise(0.5)}
        aria-hidden
        className="absolute top-28 right-3 bottom-[38%] left-3 lg:hidden"
      >
        <FlowMap
          graph={MOBILE_GRAPH}
          focusKinds={null}
          embedded
          direction="DOWN"
        />
      </motion.div>

      {/* Top-left: the Scan mark. */}
      <div className="absolute top-8 left-8 z-10 sm:top-14 sm:left-14">
        <p className="flex items-center gap-1.5 text-base font-medium tracking-wide ">
          <IconCaptureFilled className="size-4" />
          Scan
        </p>
      </div>

      {/* Top-right: the way into the main product. The mark's lead circle is
          pinned to the dark ink so it reads on the light button in both themes. */}
      <div className="absolute top-8 right-8 z-10 sm:top-10 sm:right-10">
        <Button
          variant="outline"
          render={<Link href="/homepage" />}
          className="px-3.5 has-[>svg:first-child]:pl-3 gap-2"
        >
          <BrandMark className="h-3! w-auto!" />
          Try Foglamp
        </Button>
      </div>

      {/* Bottom-left: the pitch. */}
      <div className="absolute bottom-12 left-8 z-10 max-w-xl sm:bottom-20 sm:left-14">
        <motion.h1
          {...rise(0.15)}
          className="font-display text-4xl font-semibold tracking-tight text-balance"
        >
          Map your project. Share it.
        </motion.h1>
        <motion.p
          {...rise(0.27)}
          className="mt-4 max-w-lg text-lg text-muted-foreground text-pretty"
        >
          One prompt turns your repo into a beautiful, interactive map. No
          install, no account.
        </motion.p>
        <motion.div
          {...rise(0.39)}
          className="mt-7 flex flex-wrap items-center gap-3"
        >
          <CopyScanPromptButton />
        </motion.div>
      </div>
    </div>
  );
}
