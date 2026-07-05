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
      className="relative isolate flex w-full flex-col justify-center overflow-hidden py-32 sm:py-44"
      style={{ minHeight: "780px" }}
    >
      {/* Faint dashboard grid so the fog has a surface to sit on. */}
      {/* <div
        aria-hidden
        className="absolute inset-0 z-0 opacity-40 dark:opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
          backgroundSize: "24px 24px",
          // Fully faded before the section edges — a mask that still has
          // alpha at the boundary reads as a hard line across the page.
          WebkitMaskImage:
            "radial-gradient(ellipse 75% 58% at 50% 50%, #000 25%, transparent 82%)",
          maskImage:
            "radial-gradient(ellipse 75% 58% at 50% 50%, #000 25%, transparent 82%)",
        }}
      /> */}

      {/* The fog: three drifting layers, each with its own soft radial blob
          mask at a different spot and size — overlapping blobs instead of one
          band, so the cloud reads organic rather than a strip. Everything
          fades out well before the section edges. */}
      {!reduce && (
        <div
          className="absolute inset-0 z-10"
          aria-hidden
          style={{
            // Thin the whole cloud out toward the left so the copy stays
            // clear, and hard-stop it well inside the section vertically so
            // it never reaches the footer or the section above.
            WebkitMaskImage:
              "linear-gradient(to right, transparent 4%, #000 42%), linear-gradient(to bottom, transparent 10%, #000 32%, #000 68%, transparent 90%)",
            maskImage:
              "linear-gradient(to right, transparent 4%, #000 42%), linear-gradient(to bottom, transparent 10%, #000 32%, #000 68%, transparent 90%)",
            WebkitMaskComposite: "source-in",
            maskComposite: "intersect",
          }}
        >
          <motion.div
            className="absolute inset-[-15%] opacity-3"
            style={{
              filter: "blur(4px)",
              WebkitMaskImage:
                "radial-gradient(40% 30% at 66% 44%, #000 25%, transparent 74%)",
              maskImage:
                "radial-gradient(40% 30% at 66% 44%, #000 25%, transparent 74%)",
            }}
            animate={{ x: ["-3%", "4%", "-3%"], y: ["-2%", "2%", "-2%"] }}
            transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          >
            <FogBank id="fog-a" freq={0.011} seed={7} shimmer />
          </motion.div>
          <motion.div
            className="absolute inset-[-15%] opacity-20"
            style={{
              filter: "blur(14px)",
              WebkitMaskImage:
                "radial-gradient(44% 34% at 54% 60%, #000 20%, transparent 72%)",
              maskImage:
                "radial-gradient(44% 34% at 54% 60%, #000 20%, transparent 72%)",
            }}
            animate={{ x: ["3%", "-4%", "3%"], y: ["2%", "-3%", "2%"] }}
            transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
          >
            <FogBank id="fog-b" freq={0.02} seed={19} octaves={5} shimmer />
          </motion.div>
          <motion.div
            className="absolute inset-[-15%] opacity-25"
            style={{
              filter: "blur(20px)",
              WebkitMaskImage:
                "radial-gradient(30% 26% at 78% 32%, #000 20%, transparent 72%)",
              maskImage:
                "radial-gradient(30% 26% at 78% 32%, #000 20%, transparent 72%)",
            }}
            animate={{ x: ["-2%", "3%", "-2%"], y: ["3%", "-2%", "3%"] }}
            transition={{ duration: 41, repeat: Infinity, ease: "easeInOut" }}
          >
            <FogBank id="fog-c" freq={0.016} seed={53} octaves={4} shimmer />
          </motion.div>
          {/* bottom-right filler */}
          <motion.div
            className="absolute inset-[-15%] opacity-35"
            style={{
              filter: "blur(18px)",
              WebkitMaskImage:
                "radial-gradient(38% 30% at 72% 70%, #000 22%, transparent 72%)",
              maskImage:
                "radial-gradient(38% 30% at 72% 70%, #000 22%, transparent 72%)",
            }}
            animate={{ x: ["2%", "-3%", "2%"], y: ["-2%", "3%", "-2%"] }}
            transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
          >
            <FogBank id="fog-d" freq={0.014} seed={83} octaves={4} shimmer />
          </motion.div>
          {/* a denser puff right on top of the agent details, so they read as
              half-swallowed by the fog */}
          <motion.div
            className="absolute inset-[-15%] opacity-60"
            style={{
              filter: "blur(16px)",
              WebkitMaskImage:
                "radial-gradient(30% 24% at 68% 46%, #000 30%, transparent 70%)",
              maskImage:
                "radial-gradient(30% 24% at 68% 46%, #000 30%, transparent 70%)",
            }}
            animate={{ x: ["-2%", "2%", "-2%"], y: ["1%", "-2%", "1%"] }}
            transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
          >
            <FogBank id="fog-e" freq={0.018} seed={47} octaves={5} shimmer />
          </motion.div>
        </div>
      )}

      {/* Film grain, above the fog — feathered vertically so the texture
          doesn't stop dead at the section boundary (that step reads as a hard
          line across the page). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)",
          maskImage:
            "linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)",
        }}
      >
        <FilmGrain
          id="cta-grain"
          className="opacity-[0.16] mix-blend-overlay"
        />
      </div>

      {/* The agent details sitting under the fog on the right — dimmed and
          slightly soft, so they read as half-hidden behind the weather. */}
      <div className="absolute inset-0 z-5 mx-auto hidden w-full max-w-7xl items-center justify-end px-5 sm:px-8 lg:flex">
        <div className="w-[35%] pr-4 opacity-10 blur-[2px]">
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
            What they cost, when they break, what they say. You can't see any of
            it. One prompt turns the light on.
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
