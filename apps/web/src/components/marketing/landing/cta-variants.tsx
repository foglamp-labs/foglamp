"use client";

// Bake-off, take two: each variant is the COMPLETE closing CTA — copy and
// buttons on the left, bare agent details (no card) on the right — with a big
// feathered fog cloud floating ABOVE the details, larger than the content
// under it. Hovering the right side clears the fog, each variant its own way.
// Pick one; the winner replaces CtaSection's right side and the rest die.

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import { IconArrowBigRightFilled } from "@tabler/icons-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { FilmGrain, FogBank } from "@/components/marketing/noise-overlay";
import { AgentDetails } from "./cta-agent-details";
import { CopyPromptButton } from "./copy-prompt-button";

// ─── The fog cloud ────────────────────────────────────────────────────────────
// Oversized relative to the details it covers (extends ~10rem past on every
// side) and feathered with a radial mask, so it has no edges at all — it's a
// cloud sitting on the section, not a panel.

function FogCloud({
  id,
  className,
  innerStyle,
}: {
  id: string;
  className?: string;
  /** Extra mask applied INSIDE the feather (e.g. the flashlight hole). */
  innerStyle?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute -inset-x-40 -inset-y-24",
        className
      )}
      style={{
        WebkitMaskImage:
          "radial-gradient(58% 52% at 50% 50%, #000 30%, transparent 72%)",
        maskImage:
          "radial-gradient(58% 52% at 50% 50%, #000 30%, transparent 72%)",
      }}
    >
      {/* nested so a second mask (the hole) multiplies with the feather */}
      <div className="absolute inset-0" style={innerStyle}>
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[3px]" />
        <div
          className="absolute inset-[-10%] opacity-90"
          style={{ filter: "blur(12px)" }}
        >
          <FogBank id={`${id}-a`} freq={0.012} seed={7} />
        </div>
        <div
          className="absolute inset-[-10%] opacity-70"
          style={{ filter: "blur(20px)" }}
        >
          <FogBank id={`${id}-b`} freq={0.022} seed={29} octaves={5} />
        </div>
      </div>
    </div>
  );
}

// ─── The complete CTA frame ───────────────────────────────────────────────────

function CtaFrame({
  gid,
  children,
}: {
  gid: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="relative isolate flex w-full flex-col justify-center overflow-hidden py-24 sm:py-28"
      style={{ minHeight: "480px" }}
    >
      {/* faint dashboard grid */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 opacity-40 dark:opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
          backgroundSize: "24px 24px",
          WebkitMaskImage:
            "radial-gradient(ellipse 82% 72% at 50% 50%, #000 35%, transparent 100%)",
          maskImage:
            "radial-gradient(ellipse 82% 72% at 50% 50%, #000 35%, transparent 100%)",
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-2">
        <div className="max-w-xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Your agents are running in the fog.
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground text-pretty">
            What they cost, when they break, what they say. You can't see any
            of it. One prompt turns the light on.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <CopyPromptButton />
            <Button
              render={<Link href="/login" />}
              size="lg"
              className="text-base"
              variant="secondary"
            >
              Start free
              <IconArrowBigRightFilled className="size-4 text-muted-foreground ml-0.5" />
            </Button>
          </div>
        </div>

        {/* the reveal area: bare details + the fog cloud above them */}
        <div className="hidden justify-center lg:flex">{children}</div>
      </div>

      <FilmGrain className="z-20 opacity-[0.14] mix-blend-overlay" id={gid} />
    </section>
  );
}

// ─── Variants ─────────────────────────────────────────────────────────────────

// 1. Fade away: the cloud dissolves in place.
function VFade() {
  return (
    <div className="group relative">
      <AgentDetails />
      <FogCloud
        id="cv1"
        className="transition-opacity duration-700 group-hover:opacity-0"
      />
    </div>
  );
}

// 2. Drift off: the cloud slides away to the right and thins out, like wind
// pushing it off the page.
function VDrift() {
  return (
    <div className="group relative">
      <AgentDetails />
      <FogCloud
        id="cv2"
        className="transition-[transform,opacity] duration-1000 ease-out group-hover:translate-x-48 group-hover:opacity-0"
      />
    </div>
  );
}

// 3. Flashlight: the cursor pushes a hole through the cloud wherever it goes.
function VFlashlight() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // The cloud is offset -inset-x-40/-inset-y-24 from this wrapper, so the
  // cursor position needs that offset added to land in the cloud's own space.
  const mask = pos
    ? `radial-gradient(180px at ${pos.x + 160}px ${pos.y + 96}px, transparent 0%, transparent 35%, #000 95%)`
    : undefined;
  return (
    <div
      ref={ref}
      className="group relative"
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setPos(null)}
    >
      <AgentDetails />
      <FogCloud
        id="cv3"
        innerStyle={
          mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined
        }
      />
    </div>
  );
}

// 4. Lift: the cloud rises and burns off, morning-fog style.
function VLift() {
  return (
    <div className="group relative">
      <AgentDetails />
      <FogCloud
        id="cv4"
        className="transition-[transform,opacity] duration-1000 ease-out group-hover:-translate-y-40 group-hover:opacity-0"
      />
    </div>
  );
}

// 5. Focus: the details start soft-blurred and sharpen as the cloud clears.
function VFocus() {
  return (
    <div className="group relative">
      <div className="blur-[4px] transition-[filter] duration-700 group-hover:blur-0">
        <AgentDetails />
      </div>
      <FogCloud
        id="cv5"
        className="transition-opacity duration-700 group-hover:opacity-0"
      />
    </div>
  );
}

// 6. Light on: the cloud clears and the trace draws itself in, span by span.
function VLightOn() {
  return (
    <div className="group relative">
      <AgentDetails animateSpans />
      <FogCloud
        id="cv6"
        className="transition-opacity duration-500 group-hover:opacity-0"
      />
    </div>
  );
}

// 7. Thin out: the cloud never fully leaves — it shrinks toward the center and
// goes translucent, so the details read through a wisp of fog.
function VThin() {
  return (
    <div className="group relative">
      <AgentDetails />
      <FogCloud
        id="cv7"
        className="transition-[transform,opacity] duration-700 ease-out group-hover:scale-75 group-hover:opacity-25"
      />
    </div>
  );
}

// ─── The bake-off ─────────────────────────────────────────────────────────────

const VARIANTS = [
  { n: 1, name: "Fade away", C: VFade },
  { n: 2, name: "Drift off", C: VDrift },
  { n: 3, name: "Flashlight", C: VFlashlight },
  { n: 4, name: "Lift", C: VLift },
  { n: 5, name: "Focus", C: VFocus },
  { n: 6, name: "Light on", C: VLightOn },
  { n: 7, name: "Thin out", C: VThin },
];

export function CtaVariants() {
  return (
    <div className="flex flex-col gap-4">
      {VARIANTS.map(({ n, name, C }) => (
        <div key={n}>
          <p className="mx-auto w-full max-w-7xl px-5 text-xs font-medium uppercase tracking-widest text-muted-foreground sm:px-8">
            {n}. {name}
          </p>
          <CtaFrame gid={`cta-frame-grain-${n}`}>
            <C />
          </CtaFrame>
        </div>
      ))}
    </div>
  );
}
