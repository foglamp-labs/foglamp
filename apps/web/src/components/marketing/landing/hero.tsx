import { Button } from "@foglamp/ui/components/button";
import { IconArrowRight, IconBrandOpenai } from "@tabler/icons-react";
import Link from "next/link";

import { CopyButton } from "../copy-button";
import { SETUP_PROMPT } from "../snippets";
import { HeroDemo } from "./hero-demo";

export function Hero() {
  return (
    // overflow-x-clip lets the demo overflow past the right viewport edge and be
    // clipped there (no horizontal scrollbar) — the demo "bleeds off the screen".
    <section className="relative w-full overflow-x-clip pt-20 pb-16 sm:pt-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        {/* Left: copy. Keeps the site's normal max-w-7xl left spacing. */}
        <div className="flex flex-col">
          {/* Brand mark — three overlapping circles (light → blue → orange,
              back to front). Sized to its viewBox so it scales cleanly. */}
          <svg
            viewBox="0 0 96 48"
            className="mb-7 h-12 w-auto"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="24" cy="24" r="24" fill="#EBEBEB" />
            <circle cx="48" cy="24" r="24" fill="#2884F5" />
            <circle cx="72" cy="24" r="24" fill="#F75226" />
          </svg>

          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-(--custom-shadow)">
            <IconBrandOpenai className="size-3.5" />
            Built for the Vercel AI SDK
          </span>

          <h1 className="font-display mt-6 text-5xl font-semibold tracking-tight text-balance">
            Don&apos;t ship junk agents.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
            The missing observability layer for the Vercel AI SDK. See cost,
            latency, traces, and eval scores for every call — and catch the junk
            before your users do.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" render={<Link href="/login" />}>
              Try for free
              <IconArrowRight className="size-4" />
            </Button>
            <CopyButton
              value={SETUP_PROMPT}
              idleLabel="Copy the prompt"
              copiedLabel="Prompt copied"
              size="lg"
              variant="outline"
            />
          </div>
        </div>

        {/* Right: the live dashboard demo. min-w-0 keeps it from widening the
            grid; on desktop it's sized to 60vw so it overruns its column and the
            right viewport edge, clipping off-screen. Stacks full-width on mobile. */}
        <div className="relative min-w-0">
          <div className="w-full lg:w-[60vw]">
            <HeroDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
