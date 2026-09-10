"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { ENTRANCE_EASE } from "@/components/marketing/demo/entrance";
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
        {/* The mark's strokes overlap, so a translucent fill would darken at
            the joins. Opaque fill, faded with opacity, lands on the same tone
            as the wordmark's 60% color without the seams. */}
        <OptionLogo className="size-3.5 text-muted-foreground opacity-60" />
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

// Entrance: the copy fades in while rising a touch and sharpening from a soft
// blur, top to bottom. The dashboard's chrome and its glow are static; the
// chrome starts tilted (TILT below), its surfaces drop in along that tilt
// (see HeroDemo and DemoShell), and once the last one lands the frame swings
// flat. Then the AI SDK note.
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// The frame's pose while its surfaces drop in: leaned back and turned a
// touch, as if seen from above, and scaled past the viewport so it runs off
// both sides (the hero clips the overflow). The nudge right keeps most of
// the sidebar on screen while it lands. FLAT is the resting view.
const TILT = { rotateX: 32, rotateZ: -8, scale: 1.25, x: 100 };
const FLAT = { rotateX: 0, rotateZ: 0, scale: 1, x: 0 };

// A hairline frame around the product. The shadow lives on an overlay above
// the content: an inset shadow paints under an element's children, and the
// demo's opaque frame would cover the highlight ring entirely. Clipping is
// off while the demo's surfaces are still dropping in from above the frame.
function DemoFrame({
  clip,
  children,
}: {
  clip: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative transform-3d rounded-xl after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:shadow-(--custom-shadow-chrome)">
      <div className={cn("transform-3d rounded-xl", clip && "overflow-hidden")}>
        {children}
      </div>
    </div>
  );
}

export function Hero() {
  const reduce = useReducedMotion() ?? false;
  // True once the demo's last surface has dropped in and the frame can
  // swing flat. Reduced motion skips the tilt entirely.
  const [settled, setSettled] = useState(false);
  const flat = settled || reduce;

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
    <section className="relative isolate w-full overflow-x-clip pt-10">
      {/* Copy: left-aligned, sharing the dashboard's max-w-7xl left edge. */}
      <div className="mx-auto flex max-w-7xl justify-between items-end px-5 sm:px-8">
        <div className="flex-col">
          <motion.h1
            {...rise(0.3)}
            className="font-display mt-16 md:text-5xl text-4xl font-[450] tracking-tight text-balance"
          >
            Know what your agents are doing
          </motion.h1>
          <motion.p
            {...rise(0.4)}
            className="mt-6 max-w-md text-lg text-muted-foreground text-pretty"
          >
            Cost, latency, and quality of every call your agents make. Two lines
            of code, built for the Vercel AI SDK.
          </motion.p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <motion.div {...rise(0.5)}>
              <CopyPromptButton hero className="px-4.25 pl-4" />
            </motion.div>
            <motion.div {...rise(0.6)}>
              <Button
                render={<Link href="/login" />}
                size="lg"
                className="text-base h-10 px-4.5"
                variant="secondary"
              >
                Start free
              </Button>
            </motion.div>
          </div>
        </div>

        <motion.div
          {...rise(5)}
          className="hidden items-center gap-2 text-[13px] tracking-wide text-muted-foreground md:flex border-l pl-3"
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

      {/* The dashboard demo, below the copy and centered. The frame and its
          glow render in place; the sidebar and inset content blur in after
          the copy, inside DemoShell. */}
      <div
        // A touch wider than the copy's max-w-7xl so the dashboard breathes.
        className="relative mx-auto mt-20 hidden w-full max-w-376 px-5 sm:px-16 md:block"
      >
        {/* A soft stage behind the frame. In dark mode it lifts the page
            around the frame so the dark sidebar sits on lighter ground; in
            light mode it dims the page slightly so the frame reads as resting
            on it. The frame covers the center, so only the halo shows. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-64 -inset-y-32 [--glow:oklch(0.955_0_0)] dark:[--glow:oklch(0.24_0_0)] [background:radial-gradient(farthest-side,var(--glow)_40%,transparent)]"
        />
        <motion.div
          className="relative transform-3d"
          initial={reduce ? false : TILT}
          animate={flat ? FLAT : TILT}
          transition={{ duration: 1.7, ease: ENTRANCE_EASE }}
          style={{ transformPerspective: 2400, transformOrigin: "50% 50%" }}
        >
          <DemoFrame clip={flat}>
            <HeroDemo settled={flat} onSettled={() => setSettled(true)} />
          </DemoFrame>
        </motion.div>
      </div>

      {/* Small screens get a still of the same dashboard in the same frame.
          The frame runs wider than the screen and off its right edge, so the
          desktop layout shows at a size where it reads as an app rather than
          a thumbnail. The section clips the overflow, so the page never
          scrolls sideways. */}
      <motion.div
        {...rise(0.6)}
        className="mt-12 w-[150%] pl-5 sm:pl-8 md:hidden"
      >
        <DemoFrame clip>
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
          hero's grain. Real projects running on Foglamp, all monochrome.
          Phones fit one row of three, so the rest wait for wider screens. */}
      <motion.div
        {...rise(1.7)}
        className="mx-auto mt-18 w-full max-w-7xl px-5 sm:px-8 pb-18"
      >
        <ul className="flex w-full flex-wrap items-center justify-between gap-y-5 list-none">
          {TRUSTED.map(({ label, node }, i) => (
            <li
              key={label}
              title={label}
              className={cn(
                "flex-1 flex justify-center text-muted-foreground/60 grayscale min-w-24 sm:min-w-30",
                i >= 3 && "max-sm:hidden"
              )}
            >
              {node}
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
