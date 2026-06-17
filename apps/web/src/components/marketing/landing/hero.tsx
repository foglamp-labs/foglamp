"use client";

import { Button } from "@foglamp/ui/components/button";
import { IconCircleChevronRightFilled } from "@tabler/icons-react";
import { BorderBeam } from "border-beam";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { type SVGProps, useEffect, useState } from "react";

import { CopyIcon } from "@/components/app/copy-icon";
import { useCopied } from "@/components/app/use-copied";
import { buildLandingPrompt } from "@/lib/agent-prompt";
import {
  AnthropicLogo,
  ClaudeLogo,
  CohereLogo,
  DeepSeekLogo,
  GeminiLogo,
  GrokLogo,
  MetaLogo,
  MistralLogo,
  OpenAILogo,
  PerplexityLogo,
} from "@/components/brand-logos";
import { HeroDemo } from "./hero-demo";
import Image from "next/image";

// interfere.com-style entrance: each element fades in while rising a touch and
// sharpening from a soft blur, sequenced top-to-bottom. The dashboard follows
// last with a longer, gently scaled reveal so it reads as the hero's payoff.
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// The border beam doesn't just appear — it powers on, counting its strength up
// from 0 to its resting 0.4 in 0.01 steps so the frame's edge glows to life as
// the chrome settles around it.
const BEAM_STRENGTH = 0.3;
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

export function Hero() {
  const reduce = useReducedMotion() ?? false;
  const beamStrength = useBeamStrength(reduce);
  // Pre-signup "paste into your coding agent" prompt — the agent runs
  // `npx foglamp login` to sign up + grab a key, then instruments the app.
  const { copied, markCopied } = useCopied(2000);
  const copyPrompt = () => {
    void navigator.clipboard.writeText(buildLandingPrompt());
    markCopied();
  };

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
    <section className="relative w-full overflow-x-clip pt-20 pb-16 sm:pt-28">
      {/* Copy: left-aligned, sharing the dashboard's max-w-7xl left edge. */}
      <div className="mx-auto flex max-w-7xl justify-between items-end px-5 sm:px-8">
        <div className="flex-col">
          <motion.h1
            {...rise(0.15)}
            className="font-display mt-6 text-5xl font-semibold tracking-tight text-balance"
          >
            Ship AI agents you can actually see
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
              <Button
                render={<Link href="/login" />}
                size="lg"
                className="text-base"
              >
                Start free
                <IconCircleChevronRightFilled className="size-5.5 ml-0.5 opacity-90" />
              </Button>
            </motion.div>
            <motion.div {...rise(0.49)}>
              <Button
                variant="ghost"
                size="lg"
                className="text-base h-9"
                onClick={copyPrompt}
                aria-label="Copy the coding-agent prompt"
              >
                Copy agent prompt
                <CopyIcon
                  copied={copied}
                  className="size-4 ml-1 text-muted-foreground"
                  checkClassName="size-4 text-green-400 ml-1"
                />
              </Button>
            </motion.div>
          </div>
        </div>

        <motion.div
          {...rise(1.54)}
          className="text-sm font-normal tracking-wide text-muted-foreground flex gap-1.5 items-center"
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
        className="mx-auto mt-16 w-full max-w-7xl "
      >
        {/* Same house border beam as the pricing page's featured card. Its
            circular-arc corners are matched by corner-round! on the demo frame
            (see DemoShell). borderRadius 22 == the frame's rounded-3xl. */}
        <BorderBeam
          size="pulse-outside"
          colorVariant="colorful"
          strength={beamStrength}
          borderRadius={16}
          className="w-full"
        >
          <HeroDemo />
        </BorderBeam>
      </motion.div>
    </section>
  );
}
