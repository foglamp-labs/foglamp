"use client";

import { motion, useReducedMotion } from "motion/react";

// How it works, in three steps, each with a small line illustration. No cards,
// no demo (the hero already has one) — just type and drawings.

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// ─── Step illustrations ───────────────────────────────────────────────────────
// Hand-drawn SVGs in theme colors: muted strokes, one accent per drawing.

function PromptArt() {
  return (
    <svg viewBox="0 0 240 110" className="h-28 w-full" aria-hidden>
      {/* prompt window */}
      <rect
        x="8"
        y="10"
        width="224"
        height="90"
        rx="14"
        fill="var(--card)"
        stroke="var(--border)"
      />
      {/* prompt text lines */}
      <rect x="26" y="30" width="150" height="7" rx="3.5" fill="var(--muted)" />
      <rect x="26" y="46" width="180" height="7" rx="3.5" fill="var(--muted)" />
      <rect x="26" y="62" width="120" height="7" rx="3.5" fill="var(--muted)" />
      {/* the copy chip */}
      <g>
        <rect
          x="150"
          y="72"
          width="64"
          height="20"
          rx="10"
          fill="#f97316"
          opacity="0.9"
        />
        <text
          x="182"
          y="86"
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          fill="#fff"
        >
          copy
        </text>
      </g>
    </svg>
  );
}

function WireArt() {
  return (
    <svg viewBox="0 0 240 110" className="h-28 w-full" aria-hidden>
      <rect
        x="8"
        y="10"
        width="224"
        height="90"
        rx="14"
        fill="var(--card)"
        stroke="var(--border)"
      />
      {/* untouched code lines */}
      <rect x="26" y="26" width="130" height="6" rx="3" fill="var(--muted)" />
      <rect x="26" y="40" width="170" height="6" rx="3" fill="var(--muted)" />
      {/* the two added lines */}
      <g opacity="0.9">
        <rect
          x="20"
          y="52"
          width="200"
          height="14"
          rx="4"
          fill="#22c55e"
          opacity="0.12"
        />
        <text x="27" y="63" fontSize="10" fontWeight="700" fill="#22c55e">
          +
        </text>
        <rect x="40" y="56" width="120" height="6" rx="3" fill="#22c55e" opacity="0.7" />
        <rect
          x="20"
          y="68"
          width="200"
          height="14"
          rx="4"
          fill="#22c55e"
          opacity="0.12"
        />
        <text x="27" y="79" fontSize="10" fontWeight="700" fill="#22c55e">
          +
        </text>
        <rect x="40" y="72" width="88" height="6" rx="3" fill="#22c55e" opacity="0.7" />
      </g>
      <rect x="26" y="88" width="100" height="6" rx="3" fill="var(--muted)" />
    </svg>
  );
}

function LightArt() {
  return (
    <svg viewBox="0 0 240 110" className="h-28 w-full" aria-hidden>
      <rect
        x="8"
        y="10"
        width="224"
        height="90"
        rx="14"
        fill="var(--card)"
        stroke="var(--border)"
      />
      {/* tiny stat tiles */}
      <rect x="24" y="24" width="60" height="26" rx="8" fill="var(--muted)" opacity="0.5" />
      <rect x="90" y="24" width="60" height="26" rx="8" fill="var(--muted)" opacity="0.5" />
      <rect x="156" y="24" width="60" height="26" rx="8" fill="var(--muted)" opacity="0.5" />
      <rect x="30" y="32" width="26" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.6" />
      <rect x="96" y="32" width="30" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.6" />
      <rect x="162" y="32" width="22" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.6" />
      <rect x="30" y="40" width="16" height="4" rx="2" fill="#f97316" opacity="0.8" />
      <rect x="96" y="40" width="20" height="4" rx="2" fill="#3b82f6" opacity="0.8" />
      <rect x="162" y="40" width="14" height="4" rx="2" fill="#22c55e" opacity="0.8" />
      {/* sparkline */}
      <path
        d="M 24 86 L 52 80 L 78 84 L 106 70 L 134 76 L 162 62 L 190 68 L 216 58"
        fill="none"
        stroke="#f97316"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="216" cy="58" r="3.5" fill="#f97316" />
    </svg>
  );
}

const STEPS = [
  {
    n: "1",
    title: "Copy the prompt",
    body: "One click. The prompt has everything your coding agent needs.",
    Art: PromptArt,
  },
  {
    n: "2",
    title: "Your agent sets it up",
    body: "It finds your AI calls and plugs Foglamp in. You review the diff.",
    Art: WireArt,
  },
  {
    n: "3",
    title: "See everything",
    body: "Open the dashboard. Every call is there: what it cost, how long it took, what it said.",
    Art: LightArt,
  },
] as const;

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
        Set up in one prompt.
      </motion.h2>
      <motion.p
        {...reveal(0.08)}
        className="mt-3 max-w-md text-muted-foreground text-pretty"
      >
        Nothing to read, nothing to learn. Your coding agent does the work.
      </motion.p>

      <div className="mt-12 grid gap-12 md:grid-cols-3 md:gap-8">
        {STEPS.map((step, i) => (
          <motion.div key={step.n} {...reveal(0.12 + i * 0.1)}>
            <step.Art />
            <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">
              <span className="mr-2 text-muted-foreground/60">{step.n}</span>
              {step.title}
            </h3>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground text-pretty">
              {step.body}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
