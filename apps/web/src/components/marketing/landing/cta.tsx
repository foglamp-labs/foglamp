"use client";

import { Button } from "@foglamp/ui/components/button";
import { IconArrowBigRightFilled } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { FilmGrain, FogBank } from "@/components/marketing/noise-overlay";
import { AgentDetails } from "./cta-agent-details";
import { CopyPromptButton } from "./copy-prompt-button";

// The closing CTA: full-bleed, the copy quietly shrouded in drifting fog.
// "All there, all invisible." Reduced-motion users get the still version.

export function CtaSection() {
  const reduce = useReducedMotion() ?? false;

  return (
    <section
      className="relative isolate flex w-full flex-col justify-center overflow-hidden py-24 sm:py-32"
      style={{ minHeight: "520px" }}
    >
      {/* Faint dashboard grid so the fog has a surface to sit on. */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 opacity-40 dark:opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
          backgroundSize: "24px 24px",
          WebkitMaskImage:
            "radial-gradient(ellipse 82% 72% at 50% 50%, #000 35%, transparent 100%)",
          maskImage:
            "radial-gradient(ellipse 82% 72% at 50% 50%, #000 35%, transparent 100%)",
        }}
      />

      {/* The fog blanket: drifting turbulence. Two nested masks (vertical on
          the outer div, horizontal on the inner) multiply together, so the fog
          feathers to zero well before every edge — no hard cuts anywhere. */}
      {!reduce && (
        <div
          className="absolute inset-0 z-10"
          aria-hidden
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 2%, #000 38%, #000 62%, transparent 98%)",
            maskImage:
              "linear-gradient(to bottom, transparent 2%, #000 38%, #000 62%, transparent 98%)",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              WebkitMaskImage:
                "linear-gradient(to right, transparent 8%, #000 45%, #000 78%, transparent 99%)",
              maskImage:
                "linear-gradient(to right, transparent 8%, #000 45%, #000 78%, transparent 99%)",
            }}
          >
          <motion.div
            className="absolute inset-[-20%] opacity-50"
            style={{ filter: "blur(14px)" }}
            animate={{ x: ["-3%", "4%", "-3%"], y: ["-2%", "2%", "-2%"] }}
            transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          >
            <FogBank id="fog-a" freq={0.011} seed={7} />
          </motion.div>
          <motion.div
            className="absolute inset-[-20%] opacity-35"
            style={{ filter: "blur(24px)" }}
            animate={{ x: ["3%", "-4%", "3%"], y: ["2%", "-3%", "2%"] }}
            transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
          >
            <FogBank id="fog-b" freq={0.02} seed={29} octaves={5} />
          </motion.div>
          </div>
        </div>
      )}

      {/* Film grain, above the fog. */}
      <FilmGrain id="cta-grain" className="z-20 opacity-[0.16] mix-blend-overlay" />

      {/* The agent details sitting under the fog on the right — the thing
          you'd see if the fog weren't there. Below the fog's z-index. */}
      <div className="absolute inset-0 z-[5] mx-auto hidden w-full max-w-7xl items-center justify-end px-5 sm:px-8 lg:flex">
        <div className="w-[45%] pr-4">
          <AgentDetails />
        </div>
      </div>

      {/* Headline block: above the fog, always fully legible. */}
      <div className="relative z-30 mx-auto w-full max-w-7xl px-5 sm:px-8">
        <div className="max-w-xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Your agents are running in the fog.
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground text-pretty">
            What they cost, when they break, what they say. You can't see any
            of it. One prompt turns the light on.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <CopyPromptButton />
            <Button
              render={<Link href="/login" />}
              size="lg"
              className="text-base"
              variant="secondary"
            >
              Start free
              <IconArrowBigRightFilled className="size-4 text-muted-foreground ml-0.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Headline scrim: keeps the copy legible over the fog. */}
      <div
        className="absolute inset-0 z-25 pointer-events-none"
        aria-hidden
        style={{
          background:
            "radial-gradient(125% 130% at -8% 34%, var(--background) 16%, transparent 54%)",
        }}
      />
    </section>
  );
}
