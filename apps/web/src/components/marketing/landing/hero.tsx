"use client";

import { Button } from "@foglamp/ui/components/button";
import {
  IconArrowBigRightFilled,
  IconCircleChevronRightFilled,
} from "@tabler/icons-react";
import { BorderBeam } from "border-beam";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { type SVGProps, useEffect, useState } from "react";

import { CopyPromptButton } from "./copy-prompt-button";
import { FilmGrain } from "@/components/marketing/noise-overlay";
import { HeroDemo } from "./hero-demo";
import Image from "next/image";

// Projects running on Foglamp. Olwen and Option ship real marks (dark
// line-art, inverted for dark mode); the rest are wordmarks, each in its own
// type voice so they read as distinct brands.
const TRUSTED: { label: string; node: React.ReactNode }[] = [
  {
    label: "Olwen",
    node: (
      <span className="flex items-center gap-2">
        <Image
          src="/trusted/olwen.png"
          alt=""
          width={1024}
          height={1024}
          // Blend modes drop the artwork's solid ground on any page bg: the
          // white square multiplies away in light mode; inverted, the black
          // square screens away in dark mode. Only the face lines remain.
          className="size-6 mix-blend-multiply dark:invert dark:mix-blend-screen"
        />
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
        M
        <svg viewBox="0 0 24 24" className="mx-px size-4" aria-hidden>
          <path
            d="M7.05 2.81a2.2 2.2 0 0 1 3.11 0L12 4.65l1.84-1.84a2.2 2.2 0 0 1 3.11 0l4.24 4.24a2.2 2.2 0 0 1 0 3.11L19.35 12l1.84 1.84a2.2 2.2 0 0 1 0 3.11l-4.24 4.24a2.2 2.2 0 0 1-3.11 0L12 19.35l-1.84 1.84a2.2 2.2 0 0 1-3.11 0l-4.24-4.24a2.2 2.2 0 0 1 0-3.11L4.65 12 2.81 10.16a2.2 2.2 0 0 1 0-3.11l4.24-4.24z"
            fill="currentColor"
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
        <Image
          src="/trusted/option.svg"
          alt=""
          width={1000}
          height={1000}
          className="size-4.5 dark:invert"
        />
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
      <span className="font-mono text-base font-semibold tracking-tight">
        mainline
      </span>
    ),
  },
  {
    label: "KA'A",
    node: (
      <span className="text-xl font-black tracking-tight">
        KA&rsquo;A
      </span>
    ),
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

// interfere.com-style entrance: each element fades in while rising a touch and
// sharpening from a soft blur, sequenced top-to-bottom. The dashboard follows
// last with a longer, gently scaled reveal so it reads as the hero's payoff.
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// The border beam doesn't just appear — it powers on, counting its strength up
// from 0 to its resting 0.4 in 0.01 steps so the frame's edge glows to life as
// the chrome settles around it.
const BEAM_STRENGTH = 0.2;
const BEAM_STEP = 0.01;
const BEAM_STEP_MS = 20;
const BEAM_START_MS = 600;

// Ramps the beam's strength prop one 0.01 step at a time after a short beat,
// letting the chrome reveal get underway first. Reduced-motion users skip the
// ramp and get the resting strength immediately.
function useBeamStrength(reduce: boolean) {
  const [strength, setStrength] = useState(reduce ? BEAM_STRENGTH : 0);

  useEffect(() => {
    if (reduce) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      let value = 0;
      interval = setInterval(() => {
        // toFixed(2) keeps the running sum free of float drift (0.30000004…).
        value = Math.min(BEAM_STRENGTH, +(value + BEAM_STEP).toFixed(2));
        setStrength(value);
        if (value >= BEAM_STRENGTH && interval) clearInterval(interval);
      }, BEAM_STEP_MS);
    }, BEAM_START_MS);

    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [reduce]);

  return strength;
}

// The dashboard demo wrapped in its house BorderBeam. Isolated into its own
// component so the beam's strength ramp (a setState every 20ms for ~0.6s) only
// re-renders the demo — not the hero copy, whose entrance animations shouldn't
// churn (and risk flickering) while the beam powers on.
function BeamedDemo({ reduce }: { reduce: boolean }) {
  const beamStrength = useBeamStrength(reduce);
  return (
    <BorderBeam
      size="pulse-outside"
      colorVariant="colorful"
      strength={beamStrength}
      borderRadius={16}
      className="w-full"
    >
      <HeroDemo />
    </BorderBeam>
  );
}

export function Hero() {
  const reduce = useReducedMotion() ?? false;

  // Motion props for a "blur up" reveal at a given delay — or nothing for
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
    <section className="relative isolate w-full overflow-x-clip pt-28 pb-16 sm:pt-28">
      {/* Subtle film-grain noise over the hero. A high-frequency feTurbulence
          fractal, desaturated and dropped to a low opacity with screen blending
          so it lifts the dark background without muddying the copy. */}
      <FilmGrain
        id="hero-noise"
        className="-z-10 opacity-10 mix-blend-screen"
      />

      {/* Copy: left-aligned, sharing the dashboard's max-w-7xl left edge. */}
      <div className="mx-auto flex max-w-7xl justify-between items-end px-5 sm:px-8">
        <div className="flex-col">
          <motion.h1
            {...rise(0.15)}
            className="font-display mt-6 md:text-5xl text-4xl font-medium tracking-tight text-balance"
          >
            Ship AI agents like a pro
          </motion.h1>
          <motion.p
            {...rise(0.27)}
            className="mt-5 max-w-md text-lg text-muted-foreground text-pretty"
          >
            See the cost, latency, and quality of every LLM call.{" "}
            <span className="text-primary">
              Catch bad output before your users do.
            </span>
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
                <IconArrowBigRightFilled className="size-4 text-muted-foreground ml-0.5" />
              </Button>
            </motion.div>
          </div>
        </div>

        <motion.div
          {...rise(1.54)}
          className="text-sm font-normal tracking-wide text-muted-foreground hidden md:flex gap-1.5 items-center"
        >
          <span className="text-muted-foreground/40">|</span> Tailor made for{" "}
          <div className="flex gap-1.5 items-center ">
            <Image
              src="/ai-sdk-logo.png"
              alt="AI SDK"
              className="w-12"
              width={1080}
              height={1080}
            />
          </div>
        </motion.div>
      </div>

      {/* The dashboard demo, below the copy and centered. This is step 1 of the
          demo's three-beat entrance: the chrome — the BorderBeam and the frame
          it wraps — blurs in as one unit. The frame's inner surfaces start
          hidden (their own opacity-0) and follow as steps 2 and 3 inside
          DemoShell, so only the empty chrome shows during this reveal. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, filter: "blur(0px)" }}
        animate={reduce ? undefined : { opacity: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.55, ease: EASE, delay: 0.6 }}
        className="mx-auto mt-16 hidden w-full max-w-7xl md:block"
      >
        {/* Same house border beam as the pricing page's featured card. Its
            circular-arc corners are matched by corner-round! on the demo frame
            (see DemoShell). borderRadius 16 == the frame's rounded-3xl. */}
        <BeamedDemo reduce={reduce} />
      </motion.div>

      {/* Trusted-by strip: left-aligned under the demo, still inside the
          hero's grain. Real projects running on Foglamp, all monochrome. */}
      <motion.div
        {...rise(1.7)}
        className="mx-auto mt-14 flex w-full max-w-7xl flex-wrap items-center gap-x-14 gap-y-5 px-5 sm:px-8"
      >
        <p className="text-sm text-muted-foreground">Trusted by</p>
        <ul className="contents list-none">
          {TRUSTED.map(({ label, node }) => (
            <li
              key={label}
              title={label}
              className="text-muted-foreground/80 grayscale"
            >
              {node}
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
