"use client";

import type { ScanData } from "@foglamp/contracts/scan";
import { cn } from "@foglamp/ui/lib/utils";
import { motion } from "motion/react";

import { BrandMark, Favicon } from "./brand";
import { derivePersonality } from "./personality";

/** Arc-style art block — the scan's identity card, deterministic per archetype. */
export function PersonalityCard({ data }: { data: ScanData }) {
  const { project } = data;
  const personality = derivePersonality(data);
  return (
    <div
      className={cn(
        "border-overlay relative h-32 shrink-0 overflow-hidden rounded-[36px] corner-squircle bg-linear-to-br shadow-(--custom-shadow)",
        personality.gradient
      )}
    >
      {/* film grain — feTurbulence speckle; overlay blend so it reads on the
          bright gradient (screen-only specks vanish on light backgrounds) */}
      <figure
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay filter-[url('#personality-noise-fx')_grayscale(100%)]"
      >
        <svg className="size-full">
          <filter id="personality-noise-fx">
            <feTurbulence baseFrequency="0.8" />
          </filter>
        </svg>
      </figure>
      {/* pseudo-art: soft light + shade orbs, and a big rotated glyph */}
      <div className="absolute -top-8 -right-2 size-28 rounded-full bg-white/20 blur-2xl" />
      <div className="absolute -bottom-10 left-6 size-24 rounded-full bg-black/15 blur-2xl" />
      <div className="absolute top-4 left-1/2 size-10 rounded-full bg-white/10 blur-lg" />
      <motion.span
        className="absolute -right-1 -bottom-7"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", duration: 1.1, bounce: 0.3, delay: 0.35 }}
      >
        <personality.Icon className="size-24 text-white/20" />
      </motion.span>
      <div className="absolute top-4 left-5 flex items-center gap-[5px] text-white">
        <personality.Icon className="mb-px size-3.5 drop-shadow" />
        <span className="font-display text-sm font-semibold tracking-tight drop-shadow">
          {personality.title}
        </span>
      </div>
      {/* foglamp brand mark */}
      <a
        href="https://foglamp.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-5 right-5 text-white transition-opacity hover:opacity-80"
      >
        <BrandMark className="h-2.5 w-auto drop-shadow" />
      </a>
      {/* project identity lockup */}
      <div className="absolute bottom-4 left-5 flex items-center gap-[7px] text-white">
        <Favicon
          domain={project.iconDomain}
          className="size-3.5 rounded-md"
          fallback={
            <span className="flex size-3.5 items-center justify-center rounded-[4px] bg-white/25 font-display text-[9px] font-bold leading-none shadow-sm">
              {project.name.charAt(0)}
            </span>
          }
        />
        <h1 className="font-display text-base font-semibold tracking-tight drop-shadow">
          {project.name}
        </h1>
      </div>
    </div>
  );
}
