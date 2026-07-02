"use client";

import { Button } from "@foglamp/ui/components/button";
import {
  IconArrowRight,
  IconClipboardText,
  IconRoute,
  IconShare2,
} from "@tabler/icons-react";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ComponentType } from "react";
import type { IconProps } from "@tabler/icons-react";

import { CopyPosterPromptButton } from "./copy-poster-prompt-button";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const STEPS: { Icon: ComponentType<IconProps>; title: string; body: string }[] =
  [
    {
      Icon: IconClipboardText,
      title: "Paste the prompt",
      body: "Into Claude Code, Cursor, or any coding agent that can run shell commands.",
    },
    {
      Icon: IconRoute,
      title: "It maps your repo",
      body: "Agents, models, tools, crons, and the flows between them — no code or secrets leave summarized.",
    },
    {
      Icon: IconShare2,
      title: "Share the link",
      body: "A living, animated map at foglamp.dev/poster/… that unfurls on socials.",
    },
  ];

export function PosterHero() {
  const reduce = useReducedMotion() ?? false;
  const rise = (delay: number): MotionProps =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.7, ease: EASE, delay },
        };

  return (
    <section className="relative w-full overflow-x-clip pt-28 pb-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <motion.p
          {...rise(0.05)}
          className="text-sm font-medium tracking-wide text-orange-500"
        >
          Codebase Poster
        </motion.p>
        <motion.h1
          {...rise(0.15)}
          className="font-display mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl"
        >
          Map your codebase. Share it.
        </motion.h1>
        <motion.p
          {...rise(0.27)}
          className="mt-5 max-w-md text-lg text-muted-foreground text-pretty"
        >
          One prompt turns your repo into a beautiful, interactive map of how it
          uses AI. <span className="text-primary">No install, no account.</span>
        </motion.p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <motion.div {...rise(0.39)}>
            <CopyPosterPromptButton />
          </motion.div>
          <motion.div {...rise(0.49)}>
            <Button
              render={<Link href="/poster/prompt" target="_blank" />}
              size="lg"
              className="text-base"
              variant="secondary"
            >
              Read the prompt
              <IconArrowRight className="ml-0.5 size-4 opacity-90" />
            </Button>
          </motion.div>
        </div>

        <div className="mt-20 grid gap-10 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div key={s.title} {...rise(0.6 + i * 0.12)}>
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md bg-orange-500/10 text-orange-500">
                  <s.Icon className="size-4" stroke={2} />
                </span>
                <h3 className="font-display text-sm font-semibold">
                  {s.title}
                </h3>
              </div>
              <p className="mt-2.5 max-w-xs text-sm text-muted-foreground text-pretty">
                {s.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
