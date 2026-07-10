"use client";

// Bake-off: five layouts for a real-scans gallery between the hero and the
// CTA. Every card links to a live scan page and every thumbnail is the scan's
// real OG image (rendered from the actual map). Pick one; the winner becomes
// scan-gallery.tsx and this file dies.

import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAffiliateFilled,
  IconArrowUpRight,
  IconGhostFilled,
  IconSettingsFilled,
} from "@tabler/icons-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { OlwenLogo } from "@/components/brand-logos";

// ─── the real scans ───────────────────────────────────────────────────────────

type Scan = {
  slug: string;
  name: string;
  mark: ReactNode;
  tagline: string;
  archetype: string;
  ArchIcon: typeof IconGhostFilled;
  gradient: string;
  stats: { agents: number; models: number; tools: number; integrations: number };
};

const SCANS: Scan[] = [
  {
    slug: "olwen-banfkj",
    name: "Olwen",
    mark: <OlwenLogo className="size-5" />,
    tagline: "GEO on autopilot",
    archetype: "Boundless Integrator",
    ArchIcon: IconAffiliateFilled,
    gradient: "from-sky-400 to-cyan-300 dark:from-sky-700 dark:to-cyan-600",
    stats: { agents: 12, models: 1, tools: 4, integrations: 13 },
  },
  {
    slug: "lkpr-stuwry",
    name: "LKPR",
    mark: <span className="font-serif text-sm tracking-[0.25em]">LKPR</span>,
    tagline: "AI-run content agency",
    archetype: "Tireless Orchestrator",
    ArchIcon: IconGhostFilled,
    gradient:
      "from-orange-400 to-amber-300 dark:from-orange-700 dark:to-amber-600",
    stats: { agents: 14, models: 6, tools: 1, integrations: 6 },
  },
  {
    slug: "mainline-sbnriv",
    name: "Mainline",
    mark: <span className="font-mono text-sm font-semibold">mainline</span>,
    tagline: "147-domain content engine",
    archetype: "Crafty Toolsmith",
    ArchIcon: IconSettingsFilled,
    gradient:
      "from-violet-400 to-fuchsia-300 dark:from-violet-700 dark:to-fuchsia-600",
    stats: { agents: 7, models: 3, tools: 26, integrations: 14 },
  },
  {
    slug: "foglamp-yqbmcb",
    name: "Foglamp",
    mark: (
      <span className="flex" aria-hidden>
        <span className="size-3.5 rounded-full bg-neutral-200" />
        <span className="-ml-1.5 size-3.5 rounded-full bg-[#0090fd]" />
        <span className="-ml-1.5 size-3.5 rounded-full bg-[#ff5513]" />
      </span>
    ),
    tagline: "this very site, scanned",
    archetype: "Crafty Toolsmith",
    ArchIcon: IconSettingsFilled,
    gradient:
      "from-violet-400 to-fuchsia-300 dark:from-violet-700 dark:to-fuchsia-600",
    stats: { agents: 2, models: 4, tools: 16, integrations: 7 },
  },
];

// The scan's real OG image — an actual render of its map. Cropped a touch so
// the OG header falls outside the frame and only the map shows.
function Thumb({ slug, className }: { slug: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-[#0b0b0d]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://foglamp.dev/scan/${slug}/opengraph-image`}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full scale-[1.32] object-cover object-[center_88%]"
      />
    </div>
  );
}

function StatLine({ s }: { s: Scan["stats"] }) {
  return (
    <span className="text-xs text-muted-foreground">
      {s.agents} agents · {s.models} models · {s.tools} tools
    </span>
  );
}

function Privacy() {
  return (
    <p className="mt-10 text-xs text-muted-foreground">
      Your agent runs locally. Only a small architecture summary is uploaded,
      and every scan is unlisted.
    </p>
  );
}

function Frame({
  n,
  name,
  children,
}: {
  n: number;
  name: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <p className="mb-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {n}. {name}
      </p>
      <h2 className="font-display max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Real repos, really scanned.
      </h2>
      <p className="mt-3 max-w-lg text-muted-foreground text-pretty">
        Every card is a live page. Click through and poke the map.
      </p>
      <div className="mt-12">{children}</div>
      <Privacy />
    </section>
  );
}

// ─── 1. Card grid ─────────────────────────────────────────────────────────────

function V1() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {SCANS.map((s) => (
        <Link
          key={s.slug}
          href={`/scan/${s.slug}`}
          className="group overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow) transition-transform hover:-translate-y-1"
        >
          <Thumb slug={s.slug} className="h-40" />
          <div className="flex flex-col gap-1 p-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              {s.name}
              <IconArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            <StatLine s={s.stats} />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── 2. Featured + rail ───────────────────────────────────────────────────────

function V2() {
  const [featured, ...rest] = SCANS;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <Link
        href={`/scan/${featured!.slug}`}
        className="group overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow)"
      >
        <Thumb slug={featured!.slug} className="h-72" />
        <div className="flex items-center justify-between p-5">
          <div className="flex flex-col gap-1">
            <span className="font-display text-base font-semibold">
              {featured!.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {featured!.archetype} · {featured!.stats.agents} agents
            </span>
          </div>
          <IconArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </Link>
      <div className="flex flex-col gap-3">
        {rest.map((s) => (
          <Link
            key={s.slug}
            href={`/scan/${s.slug}`}
            className="group flex items-center gap-4 rounded-2xl corner-squircle bg-card p-3 pr-5 shadow-(--custom-shadow)"
          >
            <Thumb slug={s.slug} className="h-16 w-24 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{s.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {s.tagline}
              </span>
            </div>
            <IconArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── 3. Hover list ────────────────────────────────────────────────────────────

function V3() {
  const [active, setActive] = useState(0);
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.4fr]">
      <div className="flex flex-col">
        {SCANS.map((s, i) => (
          <Link
            key={s.slug}
            href={`/scan/${s.slug}`}
            onMouseEnter={() => setActive(i)}
            className={cn(
              "flex items-center gap-3 border-b border-border/60 py-4 transition-opacity",
              active === i ? "opacity-100" : "opacity-45 hover:opacity-100"
            )}
          >
            <span className="w-6 text-xs tabular-nums text-muted-foreground">
              0{i + 1}
            </span>
            <span className="font-display text-lg font-semibold">{s.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {s.stats.agents} agents
            </span>
            <IconArrowUpRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
      <div className="relative hidden overflow-hidden rounded-3xl corner-squircle shadow-(--custom-shadow) lg:block">
        <Thumb slug={SCANS[active]!.slug} className="h-80" />
      </div>
    </div>
  );
}

// ─── 4. Personality cards ─────────────────────────────────────────────────────

function V4() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {SCANS.map((s) => (
        <Link
          key={s.slug}
          href={`/scan/${s.slug}`}
          className="group overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow) transition-transform hover:-translate-y-1"
        >
          <div
            className={cn(
              "relative flex h-20 flex-col justify-between bg-linear-to-br p-4 text-white",
              s.gradient
            )}
          >
            <s.ArchIcon className="absolute -right-2 -bottom-4 size-16 text-white/20 transition-transform group-hover:rotate-6" />
            <span className="text-xs font-medium drop-shadow">
              {s.archetype}
            </span>
            <span className="font-display text-base font-semibold drop-shadow">
              {s.name}
            </span>
          </div>
          <Thumb slug={s.slug} className="h-32" />
          <div className="p-4">
            <StatLine s={s.stats} />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── 5. Ticket rail ───────────────────────────────────────────────────────────
// Horizontal snap-scroll of wide cards, like boarding passes.

function V5() {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8 [scrollbar-width:none]">
      <div className="flex w-max snap-x gap-5">
        {SCANS.map((s) => (
          <Link
            key={s.slug}
            href={`/scan/${s.slug}`}
            className="group flex w-105 shrink-0 snap-start overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow)"
          >
            <div className="flex w-40 shrink-0 flex-col justify-between border-r border-dashed border-border p-4">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">{s.mark}</span>
                <span className="font-display text-base font-semibold">
                  {s.name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {s.stats.agents} agents
                <br />
                {s.stats.integrations} integrations
              </span>
            </div>
            <Thumb slug={s.slug} className="h-44 flex-1" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── The bake-off ─────────────────────────────────────────────────────────────

const VARIANTS = [
  { n: 1, name: "Card grid", C: V1 },
  { n: 2, name: "Featured + rail", C: V2 },
  { n: 3, name: "Hover list", C: V3 },
  { n: 4, name: "Personality cards", C: V4 },
  { n: 5, name: "Ticket rail", C: V5 },
];

export function ScanGalleryVariants() {
  return (
    <div className="flex flex-col gap-32">
      {VARIANTS.map(({ n, name, C }) => (
        <Frame key={n} n={n} name={name}>
          <C />
        </Frame>
      ))}
    </div>
  );
}
