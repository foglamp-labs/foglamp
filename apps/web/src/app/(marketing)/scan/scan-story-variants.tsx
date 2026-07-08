"use client";

// Bake-off: ten directions for the "One prompt, from repo to map" section.
// Each variant is the complete section (same heading + sub, different body),
// stacked with labels. Pick one; the winner replaces scan-story.tsx and this
// file dies.

import { cn } from "@foglamp/ui/lib/utils";
import {
  IconArrowRight,
  IconCheck,
  IconGhostFilled,
  IconLink,
  IconWorld,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

import { ClaudeCodeLogo, CodexLogo } from "@/components/brand-logos";
import { Favicon } from "@/components/scan/brand";

// ─── shared bits ──────────────────────────────────────────────────────────────

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
      <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        One prompt, from repo to map.
      </h2>
      <p className="mt-3 max-w-md text-muted-foreground text-pretty">
        Your agent explores the codebase, draws the map and publishes it to a
        link you can share.
      </p>
      <div className="mt-12">{children}</div>
    </section>
  );
}

// A tiny three-node map used by several variants.
function MiniMap({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-40 w-72", className)} aria-hidden>
      <svg className="absolute inset-0 overflow-visible" width="288" height="160">
        <path d="M 96 36 C 130 40, 100 80, 128 84" fill="none" stroke="color-mix(in oklab, var(--border) 65%, var(--muted-foreground) 35%)" strokeWidth="1.5" />
        <path d="M 232 92 C 260 96, 240 128, 256 130" fill="none" stroke="color-mix(in oklab, var(--border) 65%, var(--muted-foreground) 35%)" strokeWidth="1.5" />
      </svg>
      <span className="border-overlay absolute left-0 top-3 flex h-10 items-center gap-2 rounded-xl bg-card px-3 text-xs font-medium shadow-(--custom-shadow)">
        <span className="size-2 rounded-full bg-slate-500/80" /> Next.js app
      </span>
      <span className="border-overlay absolute left-32 top-16 flex h-10 items-center gap-2 rounded-xl bg-card px-3 text-xs font-medium shadow-(--custom-shadow)">
        <IconGhostFilled className="size-3.5 text-orange-500" /> Agents ×4
      </span>
      <span className="border-overlay absolute right-0 bottom-2 flex h-10 items-center gap-2 rounded-xl bg-card px-3 text-xs font-medium shadow-(--custom-shadow)">
        <span className="size-2 rounded-full bg-emerald-500/80" /> Postgres
      </span>
    </div>
  );
}

const URL_TEXT = "foglamp.dev/scan/olwen-x7f2";

function UrlPill() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-4 py-2 font-mono text-sm text-orange-500">
      <IconLink className="size-4" />
      {URL_TEXT}
    </span>
  );
}

// ─── 1. Terminal replay ───────────────────────────────────────────────────────

function V1() {
  const LINES = [
    { t: "❯ claude", c: "text-muted-foreground" },
    { t: "> paste the scan prompt…", c: "text-foreground" },
    { t: "⏺ Exploring apps/, packages/, supabase/…", c: "text-muted-foreground" },
    { t: "⏺ Found 6 agents · 2 models · 4 tools", c: "text-muted-foreground" },
    { t: "⏺ POST api.foglamp.dev/scan → 201", c: "text-muted-foreground" },
    { t: `➜ ${URL_TEXT}`, c: "text-orange-400 font-medium" },
  ];
  return (
    <div className="max-w-2xl rounded-3xl corner-squircle bg-card p-6 font-mono text-sm shadow-(--custom-shadow)">
      <div className="mb-4 flex gap-1.5">
        <span className="size-2.5 rounded-full bg-red-500/70" />
        <span className="size-2.5 rounded-full bg-amber-500/70" />
        <span className="size-2.5 rounded-full bg-green-500/70" />
      </div>
      <div className="flex flex-col gap-2">
        {LINES.map((l) => (
          <span key={l.t} className={l.c}>
            {l.t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── 2. Chat thread ───────────────────────────────────────────────────────────

function V2() {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="self-end rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-sm">
        *pastes the scan prompt*
      </div>
      <div className="flex items-start gap-3">
        <span className="mt-1 flex size-7 items-center justify-center rounded-lg bg-orange-500/10">
          <ClaudeCodeLogo className="size-4" />
        </span>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <span>Explored 214 files. Found 6 agents, 2 models, 4 tools.</span>
          <span>Published your scan:</span>
          <UrlPill />
        </div>
      </div>
    </div>
  );
}

// ─── 3. Three steps ───────────────────────────────────────────────────────────

function V3() {
  const STEPS = [
    { n: "1", t: "Paste the prompt", d: "Into Claude Code, Codex, or Cursor." },
    { n: "2", t: "The agent explores", d: "It reads the repo and drafts the map." },
    { n: "3", t: "Share the link", d: "A live page, no install, no account." },
  ];
  return (
    <div className="grid gap-10 md:grid-cols-3 md:gap-8">
      {STEPS.map((s) => (
        <div key={s.n}>
          <span className="font-display text-4xl font-semibold text-muted-foreground/30">
            {s.n}
          </span>
          <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">
            {s.t}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{s.d}</p>
        </div>
      ))}
    </div>
  );
}

// ─── 4. The prompt itself ─────────────────────────────────────────────────────

function V4() {
  return (
    <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:gap-12">
      <div className="max-w-md flex-1 rounded-3xl corner-squircle bg-card p-6 shadow-(--custom-shadow)">
        <p className="font-mono text-xs leading-relaxed text-muted-foreground">
          Explore this repo and map how it uses AI: agents, models, tools,
          stores. Write the result to .foglamp/scan.json following the
          contract below, then POST it to api.foglamp.dev/scan and open the
          returned URL…
        </p>
        <p className="mt-3 font-mono text-xs text-muted-foreground/50">
          — the whole prompt, 74 lines
        </p>
      </div>
      <IconArrowRight className="size-6 shrink-0 text-muted-foreground max-lg:rotate-90" />
      <MiniMap />
    </div>
  );
}

// ─── 5. File wall → map ───────────────────────────────────────────────────────

const FILES = [
  "apps/server/src/ai/agents/brand-analysis/agent.ts",
  "apps/server/src/routes/queue.ts",
  "packages/db/src/schema/brand-mention.ts",
  "apps/server/src/services/brightdata.ts",
  "apps/web/src/app/dashboard/page.tsx",
  "apps/server/src/ai/agents/content-creator/agent.ts",
  "packages/api/src/services/cms/github.ts",
  "apps/server/src/ai/models.ts",
];

function V5() {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto_1fr]">
      <div className="flex flex-col gap-2 font-mono text-[11px] leading-relaxed text-muted-foreground/60 [mask-image:linear-gradient(to_bottom,#000_40%,transparent)]">
        {FILES.map((f) => (
          <span key={f} className="truncate">
            {f}
          </span>
        ))}
      </div>
      <span className="mx-auto flex h-9 items-center gap-2 rounded-full bg-orange-500/90 px-4 text-sm font-medium text-white shadow-(--custom-shadow)">
        one prompt <IconArrowRight className="size-4" />
      </span>
      <MiniMap className="justify-self-end" />
    </div>
  );
}

// ─── 6. The unfurl ────────────────────────────────────────────────────────────

function V6() {
  return (
    <div className="max-w-xl rounded-3xl corner-squircle bg-card p-5 shadow-(--custom-shadow)">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-muted font-display text-xs font-bold">
          G
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">gustavo</span>
          <span className="text-xs text-muted-foreground">2:41 PM</span>
        </div>
      </div>
      <p className="mt-3 text-sm">
        our whole AI stack in one picture{" "}
        <span className="text-orange-500 underline decoration-orange-500/30">
          {URL_TEXT}
        </span>
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
        <div className="flex h-36 items-center justify-center bg-background">
          <MiniMap className="scale-75" />
        </div>
        <div className="border-t border-border/60 px-4 py-2.5">
          <p className="text-xs font-medium">Olwen • Foglamp Scan</p>
          <p className="text-xs text-muted-foreground">
            A living map of how Olwen uses AI.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── 7. One line ──────────────────────────────────────────────────────────────

function V7() {
  return (
    <div className="flex flex-col gap-6">
      <p className="font-mono text-2xl text-muted-foreground sm:text-3xl">
        paste prompt{" "}
        <IconArrowRight className="inline size-6 text-muted-foreground/50" />{" "}
        <span className="text-foreground">2 min</span>{" "}
        <IconArrowRight className="inline size-6 text-muted-foreground/50" />{" "}
        <span className="text-orange-500">{URL_TEXT}</span>
        <span className="ml-1 inline-block h-6 w-2.5 animate-pulse bg-orange-500 align-middle" />
      </p>
    </div>
  );
}

// ─── 8. Agent pipeline ────────────────────────────────────────────────────────

function V8() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <span className="border-overlay flex h-12 items-center gap-2 rounded-2xl bg-card px-4 text-sm font-medium shadow-(--custom-shadow)">
        the prompt
      </span>
      <IconArrowRight className="size-5 text-muted-foreground/50" />
      <span className="border-overlay flex h-12 items-center gap-3 rounded-2xl bg-card px-4 text-sm font-medium shadow-(--custom-shadow)">
        <ClaudeCodeLogo className="size-4.5" />
        <span className="text-muted-foreground/40">/</span>
        <CodexLogo className="size-4" />
        your agent
      </span>
      <IconArrowRight className="size-5 text-muted-foreground/50" />
      <MiniMap className="scale-90" />
    </div>
  );
}

// ─── 9. The numbers ───────────────────────────────────────────────────────────

function V9() {
  const STATS = [
    { v: "1", l: "prompt" },
    { v: "~2", l: "minutes" },
    { v: "0", l: "installs" },
    { v: "∞", l: "shares" },
  ];
  return (
    <div className="flex flex-wrap gap-14">
      {STATS.map((s) => (
        <div key={s.l} className="flex flex-col">
          <span className="font-display text-6xl font-semibold tracking-tight">
            {s.v}
          </span>
          <span className="mt-1 text-sm text-muted-foreground">{s.l}</span>
        </div>
      ))}
    </div>
  );
}

// ─── 10. The live page ────────────────────────────────────────────────────────

function V10() {
  return (
    <div className="max-w-2xl overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow)">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500/70" />
          <span className="size-2.5 rounded-full bg-amber-500/70" />
          <span className="size-2.5 rounded-full bg-green-500/70" />
        </div>
        <span className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-muted/60 py-1 font-mono text-xs text-muted-foreground">
          <IconWorld className="size-3.5" />
          {URL_TEXT}
        </span>
      </div>
      <div className="flex h-56 items-center justify-center bg-background/60">
        <MiniMap />
      </div>
      <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
        <span className="text-xs text-muted-foreground">
          Live, interactive, unlisted.
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
          <IconCheck className="size-3.5" /> link copied
        </span>
      </div>
    </div>
  );
}

// ─── The bake-off ─────────────────────────────────────────────────────────────

const VARIANTS = [
  { n: 1, name: "Terminal replay", C: V1 },
  { n: 2, name: "Chat thread", C: V2 },
  { n: 3, name: "Three steps", C: V3 },
  { n: 4, name: "The prompt itself", C: V4 },
  { n: 5, name: "File wall to map", C: V5 },
  { n: 6, name: "The unfurl", C: V6 },
  { n: 7, name: "One line", C: V7 },
  { n: 8, name: "Agent pipeline", C: V8 },
  { n: 9, name: "The numbers", C: V9 },
  { n: 10, name: "The live page", C: V10 },
];

export function ScanStoryVariants() {
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
