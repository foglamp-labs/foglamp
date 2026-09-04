"use client";

import { Button } from "@foglamp/ui/components/button";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";

import { OlwenLogo, OptionLogo } from "@/components/brand-logos";
import { CopyPromptButton } from "./copy-prompt-button";
import { HeroDemo } from "./hero-demo";

// Projects running on Foglamp. Olwen and Option use their real marks as
// currentColor components (from brand-logos), so every lockup tints exactly
// like its text; the rest are wordmarks, each in its own type voice.
const TRUSTED: { label: string; node: React.ReactNode }[] = [
  {
    label: "Olwen",
    node: (
      <span className="flex items-center gap-1.5">
        <OlwenLogo className="size-6" />
        <span className="font-display text-lg font-semibold tracking-tight">
          Olwen
        </span>
      </span>
    ),
  },
  {
    label: "MOTIM",
    node: (
      <span className="flex items-center text-xl font-black tracking-tight">
        M{/* the O: a circle with the brand X knocked out of it */}
        <svg
          viewBox="0 0 24 24"
          className="mx-0.5 mr-0 size-[0.9em]"
          aria-hidden
        >
          <mask id="motim-o-x">
            <rect width="24" height="24" fill="#fff" />
            <path
              d="M 8.4 8.4 L 15.6 15.6 M 15.6 8.4 L 8.4 15.6"
              stroke="#000"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </mask>
          <circle
            cx="12"
            cy="12"
            r="10.5"
            fill="currentColor"
            mask="url(#motim-o-x)"
          />
        </svg>
        TIM
      </span>
    ),
  },
  {
    label: "Option",
    node: (
      <span className="flex items-center gap-2">
        <OptionLogo className="size-3.5 text-[#676767]" />
        <span className="text-lg font-semibold tracking-normal">Option</span>
      </span>
    ),
  },
  {
    label: "LKPR",
    node: (
      <span className="font-serif text-lg font-medium tracking-[0.3em]">
        LKPR
      </span>
    ),
  },
  {
    label: "Mainline",
    node: (
      <span className="font-mono text-base font-semibold tracking-widest">
        mainline
      </span>
    ),
  },
  {
    label: "KA'A",
    node: <span className="text-xl font-black tracking-tight">KA&rsquo;A</span>,
  },
  {
    label: "LVargas",
    node: (
      <span className="text-sm font-semibold uppercase tracking-[0.25em]">
        LVargas
      </span>
    ),
  },
];

// Entrance: each element fades in while rising a touch and sharpening from a
// soft blur, sequenced top-to-bottom. The dashboard follows last with a longer
// reveal so it reads as the hero's payoff.
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// A hairline frame around the product, with a schematic caption underneath in
// the voice of the section marks: figure number left, a note right.
function DemoFrame({ children }: { children: React.ReactNode }) {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-xl ring-1 ring-border">
        {children}
      </div>
      <figcaption className="mt-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground/70">
        <span>Fig. 01</span>
        <span className="hidden md:inline">Live demo. Click around.</span>
        <span className="md:hidden">Overview</span>
      </figcaption>
    </figure>
  );
}

export function Hero() {
  const reduce = useReducedMotion() ?? false;

  // Motion props for a "blur up" reveal at a given delay, or nothing for
  // reduced-motion users, so the element simply renders in place.
  const rise = (delay: number): MotionProps =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.7, ease: EASE, delay },
        };

  return (
    // overflow-x-clip keeps the soft blur on the wide dashboard from ever
    // nudging a horizontal scrollbar during its entrance.
    <section className="relative isolate w-full overflow-x-clip pt-28">
      {/* Copy: left-aligned, sharing the dashboard's max-w-7xl left edge. */}
      <div className="mx-auto flex max-w-7xl justify-between items-end px-5 sm:px-8">
        <div className="flex-col">
          <motion.h1
            {...rise(0.15)}
            className="font-display mt-6 md:text-5xl text-4xl font-medium tracking-tight text-balance"
          >
            Know what your agents are doing.
          </motion.h1>
          <motion.p
            {...rise(0.27)}
            className="mt-5 max-w-md text-lg text-muted-foreground text-pretty"
          >
            Cost, latency, and quality of every call your agents make. Two
            lines of code, built for the Vercel AI SDK.
          </motion.p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <motion.div {...rise(0.39)}>
              <CopyPromptButton />
            </motion.div>
            <motion.div {...rise(0.49)}>
              <Button
                render={<Link href="/login" />}
                size="lg"
                className="text-base"
                variant="secondary"
              >
                Start free
              </Button>
            </motion.div>
          </div>
        </div>

        <motion.div
          {...rise(0.6)}
          className="hidden items-center gap-2 text-sm tracking-wide text-muted-foreground md:flex"
        >
          Built for the
          <Image
            src="/ai-sdk-logo.png"
            alt="Vercel AI SDK"
            className="w-12 invert dark:invert-0"
            width={1080}
            height={1080}
          />
        </motion.div>
      </div>

      {/* The dashboard demo, below the copy and centered. Step 1 of the demo's
          three-beat entrance: the frame blurs in as one unit, and its inner
          surfaces follow as steps 2 and 3 inside DemoShell. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, filter: "blur(6px)" }}
        animate={reduce ? undefined : { opacity: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.55, ease: EASE, delay: 0.6 }}
        // A touch wider than the copy's max-w-7xl so the dashboard breathes.
        className="mx-auto mt-16 hidden w-full max-w-344 px-5 sm:px-8 md:block"
      >
        <DemoFrame>
          <HeroDemo />
        </DemoFrame>
      </motion.div>

      {/* Small screens get a still of the same dashboard in the same frame. */}
      <motion.div
        {...rise(0.6)}
        className="mx-auto mt-12 w-full px-5 sm:px-8 md:hidden"
      >
        <DemoFrame>
          <Image
            src="/demo-overview-dark.png"
            alt="The Foglamp overview dashboard"
            width={2072}
            height={1320}
            className="hidden w-full dark:block"
          />
          <Image
            src="/demo-overview-light.png"
            alt="The Foglamp overview dashboard"
            width={2072}
            height={1320}
            className="w-full dark:hidden"
          />
        </DemoFrame>
      </motion.div>

      {/* Trusted-by strip: left-aligned under the demo, still inside the
          hero's grain. Real projects running on Foglamp, all monochrome. */}
      <motion.div
        {...rise(1.7)}
        className="mx-auto mt-18 flex w-full max-w-7xl flex-wrap items-center gap-x-20 gap-y-5 px-5 sm:px-8 pb-18"
      >
        <p className="text-sm text-muted-foreground/50">Trusted by</p>
        <ul className="contents list-none">
          {TRUSTED.map(({ label, node }) => (
            <li
              key={label}
              title={label}
              className="text-muted-foreground/60 grayscale"
            >
              {node}
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
