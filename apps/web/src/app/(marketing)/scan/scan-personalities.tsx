"use client";

// The personality deck: every scan gets dealt an archetype card based on its
// architecture. All seven, fanned like a held hand of cards (the same art
// language as the real PersonalityCard on scan pages: gradient, film grain,
// big rotated glyph). Hovering a card lifts it out of the fan.

import { cn } from "@foglamp/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";

import { ARCHETYPES } from "@/components/scan/personality";

// Fan geometry: cards spread along a shallow arc, rotated outward from the
// center. The ANIMATION is interfacecraft.dev's (spread from a gathered
// pile, subtle hover), the LAYOUT stays the fan.
const ORDER = [
  "scheduler",
  "archivist",
  "orchestrator",
  "integrator",
  "toolsmith",
  "builder",
  "minimalist",
] as const;

export function ScanPersonalities() {
  const reduce = useReducedMotion() ?? false;
  const n = ORDER.length;
  const mid = (n - 1) / 2;

  return (
    <section className="mx-auto w-full max-w-7xl overflow-x-clip px-5 sm:px-8">
      <h2 className="font-display max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Get your card
      </h2>
      <p className="mt-3 max-w-lg text-muted-foreground text-pretty">
        The scan reads your architecture and picks your repo's personality.
        Seven archetypes. Which one is yours?
      </p>

      {/* the fan */}
      <div className="relative mx-auto mt-20 hidden h-96 max-w-4xl md:block">
        {ORDER.map((key, i) => {
          const a = ARCHETYPES[key];
          const off = i - mid; // -3 .. 3
          const rotate = off * 7;
          const x = off * 118;
          const y = Math.abs(off) * 26;
          return (
            <motion.div
              key={key}
              className="absolute left-1/2 top-4 cursor-pointer select-none"
              style={{ zIndex: 10 + i, x: "-50%" }}
              initial={
                reduce
                  ? { rotate, translateX: x, y }
                  : {
                      rotate,
                      translateX: x * 0.3,
                      y: y + 40,
                      scale: 0.7,
                      opacity: 0,
                      filter: "blur(8px)",
                    }
              }
              whileInView={{
                rotate,
                translateX: x,
                y,
                scale: 1,
                opacity: 1,
                filter: "blur(0px)",
              }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{
                duration: 0.7,
                ease: [0.22, 1, 0.36, 1],
                delay: reduce ? 0 : i * 0.03,
                opacity: { duration: 0.35, ease: "easeOut" },
              }}
            >
              {/* hover lives on its own element so both the lift and the
                  settle-back use this fast transition, not the entrance's */}
              <motion.div
                whileHover={reduce ? undefined : { y: -8, scale: 1.03 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className={cn(
                  "relative h-72 w-52 origin-bottom overflow-hidden rounded-3xl corner-squircle bg-linear-to-br shadow-(--custom-shadow)",
                  a.gradient
                )}
              >
                {/* film grain, same recipe as the scan page's identity card */}
                <figure
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay filter-[url('#deck-noise-fx')_grayscale(100%)]"
                >
                  <svg className="size-full">
                    <filter id="deck-noise-fx">
                      <feTurbulence baseFrequency="0.8" />
                    </filter>
                  </svg>
                </figure>
                {/* light + shade orbs */}
                <div className="absolute -top-8 -right-4 size-24 rounded-full bg-white/20 blur-2xl" />
                <div className="absolute -bottom-10 left-4 size-24 rounded-full bg-black/15 blur-2xl" />
                {/* the big glyph, centered so the fan overlap never hides it */}
                <a.Icon className="absolute left-1/2 top-[38%] size-24 -translate-x-1/2 -translate-y-1/2 rotate-12 text-white/25" />
                {/* title, bottom-left like the reference */}
                <span className="absolute bottom-5 left-5 right-5 font-display text-xl font-semibold leading-tight tracking-tight text-white drop-shadow">
                  {a.title}
                </span>
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* small screens: a simple snap-scroll row instead of the fan */}
      <div className="-mx-5 mt-12 flex snap-x gap-4 overflow-x-auto px-5 md:hidden [scrollbar-width:none]">
        {ORDER.map((key) => {
          const a = ARCHETYPES[key];
          return (
            <div
              key={key}
              className={cn(
                "relative h-60 w-44 shrink-0 snap-start overflow-hidden rounded-3xl corner-squircle bg-linear-to-br shadow-(--custom-shadow)",
                a.gradient
              )}
            >
              <a.Icon className="absolute left-1/2 top-[36%] size-20 -translate-x-1/2 -translate-y-1/2 rotate-12 text-white/25" />
              <span className="absolute bottom-4 left-4 right-4 font-display text-lg font-semibold leading-tight tracking-tight text-white drop-shadow">
                {a.title}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
