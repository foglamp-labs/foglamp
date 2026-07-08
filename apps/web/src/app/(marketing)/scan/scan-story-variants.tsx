"use client";

// Bake-off, take two: ten genuinely different section concepts for the scan
// page's middle act. Each has its own headline, copy and body. Pick one; the
// winner replaces scan-story.tsx and this file dies.

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

// ─── shared bits ──────────────────────────────────────────────────────────────

function Frame({
  n,
  name,
  title,
  sub,
  children,
}: {
  n: number;
  name: string;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <p className="mb-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {n}. {name}
      </p>
      <h2 className="font-display max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 max-w-lg text-muted-foreground text-pretty">{sub}</p>
      <div className="mt-12">{children}</div>
    </section>
  );
}

// A tiny three-node map used by several variants.
function MiniMap({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-40 w-72", className)} aria-hidden>
      <svg
        className="absolute inset-0 overflow-visible"
        width="288"
        height="160"
      >
        <path
          d="M 96 36 C 130 40, 100 80, 128 84"
          fill="none"
          stroke="color-mix(in oklab, var(--border) 65%, var(--muted-foreground) 35%)"
          strokeWidth="1.5"
        />
        <path
          d="M 232 92 C 260 96, 240 128, 256 130"
          fill="none"
          stroke="color-mix(in oklab, var(--border) 65%, var(--muted-foreground) 35%)"
          strokeWidth="1.5"
        />
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

// ─── 1. Your repo has a shape ─────────────────────────────────────────────────

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

function V1() {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto_1fr]">
      <div className="flex flex-col gap-2 font-mono text-[11px] leading-relaxed text-muted-foreground/60 [mask-image:linear-gradient(to_bottom,#000_40%,transparent)]">
        {FILES.map((f) => (
          <span key={f} className="truncate">
            {f}
          </span>
        ))}
      </div>
      <IconArrowRight className="mx-auto size-6 text-muted-foreground/50 max-lg:rotate-90" />
      <MiniMap className="justify-self-end" />
    </div>
  );
}

// ─── 2. Show and tell ─────────────────────────────────────────────────────────

function V2() {
  const LINES = [
    { t: "❯ claude", c: "text-muted-foreground" },
    { t: "> paste the scan prompt…", c: "text-foreground" },
    { t: "⏺ Exploring apps/, packages/, supabase/…", c: "text-muted-foreground" },
    { t: "⏺ Found 6 agents · 2 models · 4 tools", c: "text-muted-foreground" },
    { t: `➜ ${URL_TEXT}`, c: "text-orange-400 font-medium" },
  ];
  return (
    <div className="max-w-2xl rounded-3xl corner-squircle bg-card p-6 font-mono text-sm shadow-(--custom-shadow)">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500/70" />
          <span className="size-2.5 rounded-full bg-amber-500/70" />
          <span className="size-2.5 rounded-full bg-green-500/70" />
        </div>
        <span className="text-xs text-muted-foreground">1m 52s</span>
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

// ─── 3. Made to be shared ─────────────────────────────────────────────────────

function V3() {
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

// ─── 4. The agent does the drawing ────────────────────────────────────────────

function V4() {
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
          <span>
            Explored 214 files. Your app has 6 agents on 2 models, plus
            Firecrawl, Exa and Parallel.
          </span>
          <span>Here is the map:</span>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-orange-500/10 px-4 py-2 font-mono text-sm text-orange-500">
            <IconLink className="size-4" />
            {URL_TEXT}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── 5. What is actually calling the model? ───────────────────────────────────

function V5() {
  const FOUND = [
    { label: "6 agents", note: "one you forgot existed" },
    { label: "2 models", note: "Fable 5, GPT-5.5" },
    { label: "4 tools", note: "one calling prod" },
    { label: "13 integrations", note: "3 undocumented" },
  ];
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {FOUND.map((f) => (
        <div key={f.label}>
          <div className="flex items-center gap-2">
            <IconCheck className="size-4 text-emerald-500" />
            <span className="font-display text-xl font-semibold">
              {f.label}
            </span>
          </div>
          <p className="mt-1 pl-6 text-sm text-muted-foreground">{f.note}</p>
        </div>
      ))}
    </div>
  );
}

// ─── 6. No install. No account. ───────────────────────────────────────────────

function V6() {
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

// ─── 7. The diagram you never drew ────────────────────────────────────────────

function V7() {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div className="max-w-md">
        <div className="rounded-2xl border border-dashed border-border p-5">
          <p className="font-mono text-xs text-muted-foreground/70">
            docs/architecture.md
          </p>
          <p className="mt-2 text-sm text-muted-foreground line-through decoration-muted-foreground/40">
            TODO: add a diagram of the AI pipeline
          </p>
          <p className="mt-1 text-xs text-muted-foreground/50">
            last updated 14 months ago
          </p>
        </div>
      </div>
      <MiniMap />
    </div>
  );
}

// ─── 8. Paste. Wait. Share. ───────────────────────────────────────────────────

function V8() {
  const WORDS = [
    { w: "Paste.", d: "Into Claude Code, Codex, or Cursor." },
    { w: "Wait.", d: "About two minutes, while it explores." },
    { w: "Share.", d: "A live link, unlisted, yours." },
  ];
  return (
    <div className="grid gap-10 md:grid-cols-3">
      {WORDS.map((x) => (
        <div key={x.w}>
          <span className="font-display text-5xl font-semibold tracking-tight">
            {x.w}
          </span>
          <p className="mt-3 max-w-2xs text-sm text-muted-foreground">{x.d}</p>
        </div>
      ))}
    </div>
  );
}

// ─── 9. Works with the agent you already use ──────────────────────────────────

function V9() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <span className="border-overlay flex h-14 items-center gap-3 rounded-2xl bg-card px-5 text-base font-medium shadow-(--custom-shadow)">
        <ClaudeCodeLogo className="size-5" /> Claude Code
      </span>
      <span className="border-overlay flex h-14 items-center gap-3 rounded-2xl bg-card px-5 text-base font-medium shadow-(--custom-shadow)">
        <CodexLogo className="size-5" /> Codex
      </span>
      <span className="text-sm text-muted-foreground">
        or any agent that can read a repo and run curl.
      </span>
    </div>
  );
}

// ─── 10. A map that stays alive ───────────────────────────────────────────────

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
          Updated 2 days ago, same URL since March.
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
          <IconCheck className="size-3.5" /> up to date
        </span>
      </div>
    </div>
  );
}

// ─── The bake-off ─────────────────────────────────────────────────────────────

const VARIANTS = [
  {
    n: 1,
    name: "Your repo has a shape",
    title: "Your repo has a shape. Nobody can see it.",
    sub: "To everyone else it is ten thousand files. The scan turns it into one picture: who calls what, which agents run, where the data lands.",
    C: V1,
  },
  {
    n: 2,
    name: "Show and tell",
    title: "Two minutes to show and tell.",
    sub: "Paste the prompt, let your agent read the repo, get a link. That is the whole workflow.",
    C: V2,
  },
  {
    n: 3,
    name: "Made to be shared",
    title: "Made to be posted.",
    sub: "Every scan is a live page with a proper unfurl. Drop it in Slack, on X, in your README, and the map speaks for itself.",
    C: V3,
  },
  {
    n: 4,
    name: "The agent does the drawing",
    title: "Your agent does the drawing.",
    sub: "You do not document anything. The agent reads the code, finds the AI, and publishes the map for you.",
    C: V4,
  },
  {
    n: 5,
    name: "The audit",
    title: "So, what is actually calling the model?",
    sub: "Repos accumulate AI the way attics accumulate boxes. The scan finds all of it, including the parts nobody remembers shipping.",
    C: V5,
  },
  {
    n: 6,
    name: "The numbers",
    title: "No install. No account. No excuses.",
    sub: "The cheapest way to see your AI stack. It costs one prompt.",
    C: V6,
  },
  {
    n: 7,
    name: "The diagram you never drew",
    title: "The architecture diagram you never drew.",
    sub: "Every team means to draw one. The scan draws it from the code itself, so it is never out of date and nobody had to open Figma.",
    C: V7,
  },
  {
    n: 8,
    name: "Paste. Wait. Share.",
    title: "The whole manual fits in three words.",
    sub: "There is no step four.",
    C: V8,
  },
  {
    n: 9,
    name: "Your agent, not ours",
    title: "Works with the agent you already pay for.",
    sub: "The scan is just a prompt. Your own coding agent does the work, with the repo access it already has.",
    C: V9,
  },
  {
    n: 10,
    name: "A map that stays alive",
    title: "A map that stays alive.",
    sub: "Run the prompt again after a refactor and the same URL updates. Your architecture doc is now a living page.",
    C: V10,
  },
];

export function ScanStoryVariants() {
  return (
    <div className="flex flex-col gap-32">
      {VARIANTS.map(({ n, name, title, sub, C }) => (
        <Frame key={n} n={n} name={name} title={title} sub={sub}>
          <C />
        </Frame>
      ))}
    </div>
  );
}
