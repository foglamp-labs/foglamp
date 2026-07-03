"use client";

// Bake-off: 7 takes on the "fog over an agent card, hover to clear it" idea
// for the CTA's right side. Rendered together, labeled, so we can pick one —
// then the winner stays and the rest get deleted. The current CtaSection
// stays live above this section.

import { cn } from "@foglamp/ui/lib/utils";
import { IconGhostFilled } from "@tabler/icons-react";
import { useRef, useState } from "react";

import { ClaudeLogo } from "@/components/brand-logos";
import { FogBank } from "@/components/marketing/noise-overlay";

// ─── The agent card being revealed (shared by every variant) ─────────────────

const SPANS = [
  { label: "plan", w: "34%", x: "0%", color: "#f97316" },
  { label: "search_docs", w: "22%", x: "18%", color: "#8b5cf6" },
  { label: "generateText", w: "48%", x: "34%", color: "#3b82f6" },
  { label: "reply", w: "14%", x: "80%", color: "#22c55e" },
];

function AgentPeek({ animate = false }: { animate?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col justify-between rounded-3xl corner-squircle border-overlay bg-card p-5 text-left shadow-(--custom-shadow)">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
          <IconGhostFilled className="size-4" />
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-medium leading-tight">
            support-agent
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ClaudeLogo className="size-3" /> Claude Haiku 4.5
          </span>
        </span>
        <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
          passed
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {SPANS.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-20 truncate font-mono text-[10px] text-muted-foreground">
              {s.label}
            </span>
            <div className="relative h-2 flex-1">
              <div
                className={cn(
                  "absolute top-0 h-2 rounded-full",
                  animate &&
                    "origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
                )}
                style={{
                  left: s.x,
                  width: s.w,
                  background: s.color,
                  opacity: 0.75,
                  transitionDelay: animate ? `${150 + i * 110}ms` : undefined,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-end justify-between">
        <Stat label="cost" value="$0.0041" />
        <Stat label="latency" value="2.3s" />
        <Stat label="tokens" value="1,842" />
        <Stat label="evals" value="94%" />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-display text-sm font-semibold tabular-nums">
        {value}
      </span>
    </span>
  );
}

// ─── Fog overlay building block ───────────────────────────────────────────────

function FogCover({
  id,
  className,
  style,
}: {
  id: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-3xl corner-squircle",
        className
      )}
      style={style}
    >
      <div className="absolute inset-0 bg-background/55 backdrop-blur-[3px]" />
      <div className="absolute inset-[-20%] opacity-90" style={{ filter: "blur(10px)" }}>
        <FogBank id={`${id}-a`} freq={0.012} seed={7} />
      </div>
      <div className="absolute inset-[-20%] opacity-70" style={{ filter: "blur(18px)" }}>
        <FogBank id={`${id}-b`} freq={0.022} seed={29} octaves={5} />
      </div>
    </div>
  );
}

// ─── Variants ─────────────────────────────────────────────────────────────────

// 1. Fade away: the whole blanket dissolves on hover.
function VFade() {
  return (
    <div className="group relative h-64">
      <AgentPeek />
      <FogCover
        id="ctav1"
        className="transition-opacity duration-700 group-hover:opacity-0"
      />
    </div>
  );
}

// 2. Curtains: the fog parts, half sliding left, half sliding right.
function VCurtains() {
  return (
    <div className="group relative h-64 overflow-hidden rounded-3xl corner-squircle">
      <AgentPeek />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[60%] overflow-hidden transition-transform duration-700 ease-out group-hover:-translate-x-full">
        <div className="absolute inset-0 bg-background/55 backdrop-blur-[3px]" />
        <div className="absolute inset-[-30%] opacity-90" style={{ filter: "blur(10px)" }}>
          <FogBank id="ctav2-a" freq={0.012} seed={7} />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[60%] overflow-hidden transition-transform duration-700 ease-out group-hover:translate-x-full">
        <div className="absolute inset-0 bg-background/55 backdrop-blur-[3px]" />
        <div className="absolute inset-[-30%] opacity-90" style={{ filter: "blur(10px)" }}>
          <FogBank id="ctav2-b" freq={0.014} seed={29} />
        </div>
      </div>
    </div>
  );
}

// 3. Flashlight: the cursor burns a hole through the fog wherever it goes.
function VSpotlight() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const mask = pos
    ? `radial-gradient(140px at ${pos.x}px ${pos.y}px, transparent 0%, transparent 40%, #000 100%)`
    : undefined;
  return (
    <div
      ref={ref}
      className="relative h-64"
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setPos(null)}
    >
      <AgentPeek />
      <FogCover
        id="ctav3"
        style={{ WebkitMaskImage: mask, maskImage: mask }}
      />
    </div>
  );
}

// 4. Lift: the fog rises off the card like morning fog burning away.
function VLift() {
  return (
    <div className="group relative h-64 overflow-hidden rounded-3xl corner-squircle">
      <AgentPeek />
      <FogCover
        id="ctav4"
        className="transition-transform duration-700 ease-out group-hover:-translate-y-full"
      />
    </div>
  );
}

// 5. Focus: the card starts blurred under the fog and sharpens as it clears.
function VFocus() {
  return (
    <div className="group relative h-64">
      <div className="h-full blur-[5px] transition-[filter,transform] duration-700 group-hover:blur-0 group-hover:scale-[1.01]">
        <AgentPeek />
      </div>
      <FogCover
        id="ctav5"
        className="transition-opacity duration-700 group-hover:opacity-0"
      />
    </div>
  );
}

// 6. Light on: the fog clears and the trace draws itself in, span by span.
function VLightOn() {
  return (
    <div className="group relative h-64">
      <AgentPeek animate />
      <FogCover
        id="ctav6"
        className="transition-opacity duration-500 group-hover:opacity-0"
      />
    </div>
  );
}

// 7. Tiles: each stat sits under its own patch of fog; clear them one by one.
function VTiles() {
  const tiles = [
    { label: "cost", value: "$0.0041", sub: "this run" },
    { label: "latency", value: "2.3s", sub: "p95 4.1s" },
    { label: "evals", value: "94%", sub: "no PII, grounded" },
  ];
  return (
    <div className="grid h-64 grid-rows-3 gap-3">
      {tiles.map((t, i) => (
        <div key={t.label} className="group relative">
          <div className="flex h-full items-center justify-between rounded-2xl corner-squircle border-overlay bg-card px-5 shadow-(--custom-shadow)">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t.label}
            </span>
            <span className="flex flex-col items-end">
              <span className="font-display text-lg font-semibold tabular-nums">
                {t.value}
              </span>
              <span className="text-xs text-muted-foreground">{t.sub}</span>
            </span>
          </div>
          <FogCover
            id={`ctav7-${i}`}
            className="rounded-2xl transition-opacity duration-500 group-hover:opacity-0"
          />
        </div>
      ))}
    </div>
  );
}

// ─── The bake-off section ─────────────────────────────────────────────────────

const VARIANTS = [
  { n: 1, name: "Fade away", C: VFade },
  { n: 2, name: "Curtains", C: VCurtains },
  { n: 3, name: "Flashlight", C: VSpotlight },
  { n: 4, name: "Lift", C: VLift },
  { n: 5, name: "Focus", C: VFocus },
  { n: 6, name: "Light on", C: VLightOn },
  { n: 7, name: "Stat tiles", C: VTiles },
];

export function CtaVariants() {
  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <p className="mb-8 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        CTA bake-off: hover each card to clear the fog (temp, pick one)
      </p>
      <div className="grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
        {VARIANTS.map(({ n, name, C }) => (
          <div key={n}>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {n}. {name}
            </p>
            <C />
          </div>
        ))}
      </div>
    </section>
  );
}
