"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Fragment, useRef } from "react";

import { products } from "@/components/marketing/products";
import { CopyPromptButton } from "./copy-prompt-button";
import { HeroDemo } from "./hero-demo";

// Prompt-first "how it works": three short beats, then the payoff (the real
// dashboard demo, mounted only when scrolled into view so the homepage doesn't
// pay for two live demos up front). Full-bleed by design: no cards, just type.

const BEATS = [
  {
    n: "1",
    title: "Copy the prompt",
    body: "One button. The prompt tells your coding agent everything it needs to know.",
  },
  {
    n: "2",
    title: "Your agent wires it up",
    body: "It finds your AI calls and hooks Foglamp into them. You review the diff.",
  },
  {
    n: "3",
    title: "Watch it light up",
    body: "Open the dashboard. Cost, latency and quality on every call, from the first run.",
  },
] as const;

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function DemoOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  // Mount once, shortly before it scrolls into view, and stay mounted.
  const inView = useInView(ref, { once: true, margin: "0px 0px 25% 0px" });
  return (
    <div ref={ref} className="hidden w-full md:block">
      {inView ? <HeroDemo /> : <div className="h-[660px]" />}
    </div>
  );
}

export function HowItWorks() {
  const reduce = useReducedMotion() ?? false;
  const reveal = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14, filter: "blur(6px)" },
          whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
          viewport: { once: true, amount: 0.4 },
          transition: { duration: 0.6, ease: EASE, delay },
        };

  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <motion.h2
        {...reveal(0)}
        className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
      >
        Up and running in one prompt.
      </motion.h2>
      <motion.p
        {...reveal(0.08)}
        className="mt-3 max-w-md text-muted-foreground text-pretty"
      >
        No docs to read, no SDK to learn. Your coding agent does the wiring.
      </motion.p>

      <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
        {BEATS.map((beat, i) => (
          <motion.div key={beat.n} {...reveal(0.12 + i * 0.1)}>
            <span className="font-display text-sm font-semibold text-muted-foreground/60">
              {beat.n}
            </span>
            <h3 className="mt-2 font-display text-lg font-semibold tracking-tight">
              {beat.title}
            </h3>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground text-pretty">
              {beat.body}
            </p>
            {i === 0 ? (
              <div className="mt-5">
                <CopyPromptButton />
              </div>
            ) : null}
          </motion.div>
        ))}
      </div>

      <motion.div {...reveal(0.15)} className="mt-16">
        <DemoOnScroll />
      </motion.div>

      {/* The six feature pages as one plain sentence, not six cards. */}
      <motion.p
        {...reveal(0.1)}
        className="mt-14 max-w-2xl text-muted-foreground text-pretty"
      >
        One prompt gets you all of it:{" "}
        {products.map((p, i) => (
          <Fragment key={p.slug}>
            <Link
              href={p.href}
              className="text-foreground underline decoration-foreground/20 underline-offset-4 transition-colors hover:decoration-foreground"
            >
              {p.label.toLowerCase()}
            </Link>
            {i < products.length - 2 ? ", " : i === products.length - 2 ? " and " : "."}
          </Fragment>
        ))}
      </motion.p>
    </section>
  );
}
