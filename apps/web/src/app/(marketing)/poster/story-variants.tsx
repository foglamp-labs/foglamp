"use client";

// Five candidate directions for the "how it works" band, rendered together so
// we can pick one. Once chosen, the winners stays and the rest get deleted.

import { cn } from "@foglamp/ui/lib/utils";
import {
  IconArrowRight,
  IconBrandSlack,
  IconBrandX,
  IconClipboardTextFilled,
  IconGhostFilled,
  IconLink,
  IconSparkles,
} from "@tabler/icons-react";
import { type MotionProps, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function useReveal() {
  const reduce = useReducedMotion() ?? false;
  return (delay: number, from: { x?: number; y?: number } = {}): MotionProps =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, ...from },
          whileInView: { opacity: 1, x: 0, y: 0 },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.55, ease: EASE, delay },
        };
}

function Band({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-[64px] corner-squircle bg-card dark:bg-card/50 shadow-(--custom-shadow) px-6 py-14 sm:px-12 sm:py-20",
        className
      )}
    >
      {children}
    </div>
  );
}

function VariantLabel({ n, name }: { n: number; name: string }) {
  return (
    <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
      Direction {n} — {name}
    </p>
  );
}

// ─── 1. Terminal replay ───────────────────────────────────────────────────────
// The whole story inside one fake terminal: prompt pasted, agent log lines,
// the URL at the end. Dev-native, zero metaphor.

const TERM_LINES: { text: string; cls?: string }[] = [
  { text: "❯ claude", cls: "text-muted-foreground" },
  { text: "> paste the foglamp poster prompt…", cls: "text-foreground" },
  { text: "⏺ Exploring apps/, packages/, supabase/…" },
  { text: "⏺ Found 6 agents · 1 model · 4 tools · 13 integrations" },
  { text: "⏺ Writing .foglamp/poster.json ✓" },
  { text: "⏺ POST api.foglamp.dev/poster → 201 ✓" },
  {
    text: "➜ https://foglamp.dev/poster/olwen-x7f2",
    cls: "text-orange-400 font-medium",
  },
  { text: "opened in your browser — go share it", cls: "text-muted-foreground" },
];

function VariantTerminal() {
  const reveal = useReveal();
  return (
    <Band>
      <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[0.8fr_1fr]">
        <div>
          <motion.h2
            {...reveal(0, { y: 10 })}
            className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            Your agent does all of it.
          </motion.h2>
          <motion.p
            {...reveal(0.12, { y: 10 })}
            className="mt-3 max-w-sm text-muted-foreground text-pretty"
          >
            Paste the prompt, keep sipping your coffee. Ninety seconds later
            there&apos;s a link in your browser.
          </motion.p>
        </div>
        <motion.div
          {...reveal(0.15, { y: 14 })}
          className="border-overlay overflow-hidden rounded-2xl bg-background/80 shadow-(--custom-shadow)"
        >
          <div className="flex items-center gap-1.5 border-b border-muted px-4 py-3">
            <span className="size-2.5 rounded-full bg-rose-500/70" />
            <span className="size-2.5 rounded-full bg-amber-500/70" />
            <span className="size-2.5 rounded-full bg-emerald-500/70" />
            <span className="ml-3 text-xs text-muted-foreground">
              your-repo — claude
            </span>
          </div>
          <div className="flex flex-col gap-2 p-5 font-mono text-[13px] leading-relaxed">
            {TERM_LINES.map((l, i) => (
              <motion.span
                key={i}
                {...reveal(0.3 + i * 0.25)}
                className={cn("text-muted-foreground", l.cls)}
              >
                {l.text}
              </motion.span>
            ))}
            <motion.span
              {...reveal(0.3 + TERM_LINES.length * 0.25)}
              className="mt-1 inline-block h-4 w-2 animate-pulse bg-foreground/70"
            />
          </div>
        </motion.div>
      </div>
    </Band>
  );
}

// ─── 2. Chat thread ───────────────────────────────────────────────────────────
// You ↔ agent bubbles ending in a link-preview card. Conversational.

function VariantChat() {
  const reveal = useReveal();
  return (
    <Band>
      <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[0.8fr_1fr]">
        <div>
          <motion.h2
            {...reveal(0, { y: 10 })}
            className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            One message. One masterpiece.
          </motion.h2>
          <motion.p
            {...reveal(0.12, { y: 10 })}
            className="mt-3 max-w-sm text-muted-foreground text-pretty"
          >
            It reads like a conversation because it is one — with whatever
            coding agent you already use.
          </motion.p>
        </div>
        <div className="flex flex-col gap-3">
          <motion.div
            {...reveal(0.2, { x: 12 })}
            className="ml-auto max-w-sm rounded-3xl corner-squircle rounded-br-md bg-orange-500/90 px-4 py-3 text-sm text-white shadow-(--custom-shadow)"
          >
            Analyze this repository and publish a shareable codebase poster
          </motion.div>
          <motion.div
            {...reveal(0.5, { x: -12 })}
            className="mr-auto max-w-sm rounded-3xl corner-squircle rounded-bl-md bg-muted/60 px-4 py-3 text-sm text-foreground shadow-sm"
          >
            Mapped it — 6 agents, 1 model, 4 tools, and every flow between
            them. Here&apos;s your poster:
          </motion.div>
          <motion.a
            {...reveal(0.85, { y: 10 })}
            className="border-overlay mr-auto w-full max-w-sm overflow-hidden rounded-2xl corner-squircle bg-background/70 shadow-(--custom-shadow) transition-opacity hover:opacity-90"
          >
            <div className="relative h-20 bg-gradient-to-br from-orange-500 to-amber-400">
              <IconGhostFilled className="absolute -right-1 -bottom-3 size-16 rotate-12 text-white/25" />
              <span className="absolute bottom-2.5 left-4 font-display text-sm font-semibold text-white drop-shadow">
                Tireless Orchestrator
              </span>
            </div>
            <div className="px-4 py-2.5">
              <p className="text-xs font-medium">Olwen — Codebase Poster</p>
              <p className="text-xs text-muted-foreground">
                foglamp.dev/poster/olwen-x7f2
              </p>
            </div>
          </motion.a>
        </div>
      </div>
    </Band>
  );
}

// ─── 3. Numbered panels ───────────────────────────────────────────────────────
// Three oversized panels in a row, one per step, joined by a pulse line.

function VariantPanels() {
  const reveal = useReveal();
  const steps = [
    {
      n: "01",
      title: "Paste the prompt",
      body: "Claude Code, Cursor — anything that can run shell commands.",
      visual: (
        <div className="flex flex-col gap-1.5">
          <span className="h-2 w-4/5 rounded-full bg-foreground/15" />
          <span className="h-2 w-3/5 rounded-full bg-foreground/15" />
          <span className="h-2 w-2/3 rounded-full bg-orange-500/50" />
        </div>
      ),
    },
    {
      n: "02",
      title: "It maps the repo",
      body: "Agents, models, tools, crons — summarized, never your code.",
      visual: (
        <div className="relative h-12">
          <span className="border-overlay absolute left-0 top-0 h-5 w-16 rounded-md bg-background/80" />
          <span className="border-overlay absolute left-10 top-7 h-5 w-16 rounded-md bg-background/80" />
          <span className="border-overlay absolute right-0 top-2 h-5 w-14 rounded-md bg-background/80" />
          <svg className="absolute inset-0 size-full overflow-visible">
            <path
              d="M 64 10 L 84 10 L 84 36 L 40 36"
              fill="none"
              stroke="rgba(249,115,22,0.5)"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      ),
    },
    {
      n: "03",
      title: "Share the link",
      body: "Animated, interactive, unfurls anywhere you drop it.",
      visual: (
        <div className="flex items-center gap-2">
          <span className="border-overlay flex h-7 items-center gap-1.5 rounded-full bg-background/80 px-3 text-xs text-muted-foreground">
            <IconLink className="size-3" />
            foglamp.dev/poster/…
          </span>
          <IconBrandX className="size-4 text-muted-foreground" />
          <IconBrandSlack className="size-4 text-muted-foreground" />
        </div>
      ),
    },
  ];
  return (
    <Band>
      <div className="relative mx-auto grid max-w-5xl gap-6 sm:grid-cols-3">
        {steps.map((s, i) => (
          <motion.div
            key={s.n}
            {...reveal(i * 0.2, { y: 16 })}
            className="border-overlay flex flex-col gap-4 rounded-3xl corner-squircle bg-background/50 p-6"
          >
            <span className="font-display text-3xl font-semibold text-orange-500/80">
              {s.n}
            </span>
            <div className="min-h-14">{s.visual}</div>
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground text-pretty">
                {s.body}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </Band>
  );
}

// ─── 4. Before / After ────────────────────────────────────────────────────────
// A wall of illegible repo paths on the left, the clean map on the right,
// "one prompt" bridging them.

const FILE_WALL = [
  "apps/server/src/ai/agents/brand-analysis/agent.ts",
  "apps/server/src/routes/queue.ts",
  "packages/db/src/schema/brand-mention.ts",
  "apps/server/src/services/brightdata.ts",
  "apps/web/src/app/dashboard/page.tsx",
  "apps/server/src/ai/agents/content-creator/agent.ts",
  "packages/api/src/services/cms/github.ts",
  "apps/server/src/services/firecrawl.ts",
  "apps/server/src/ai/models.ts",
  "apps/server/vercel.json",
  "apps/server/src/ai/agents/geo-strategy/agent.ts",
  "packages/db/src/schema/content.ts",
];

function VariantBeforeAfter() {
  const reveal = useReveal();
  return (
    <Band>
      <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[1fr_auto_1fr]">
        <motion.div {...reveal(0)} className="relative overflow-hidden">
          <div className="flex flex-col gap-2 font-mono text-[11px] leading-relaxed text-muted-foreground/60 [mask-image:linear-gradient(to_bottom,#000_35%,transparent_95%)]">
            {FILE_WALL.map((f) => (
              <span key={f} className="truncate">
                {f}
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            What your repo looks like to everyone else
          </p>
        </motion.div>

        <motion.div
          {...reveal(0.3)}
          className="mx-auto flex flex-col items-center gap-2"
        >
          <span className="flex h-9 items-center gap-2 rounded-full bg-orange-500/90 px-4 text-sm font-medium text-white shadow-(--custom-shadow)">
            one prompt
            <IconArrowRight className="size-4" />
          </span>
        </motion.div>

        <motion.div {...reveal(0.5, { x: 10 })} className="relative">
          <div className="relative h-44">
            <span className="border-overlay absolute left-0 top-2 flex h-9 w-28 items-center gap-2 rounded-xl bg-background/80 px-2.5 text-xs font-medium shadow-(--custom-shadow)">
              <IconClipboardTextFilled className="size-3.5 text-muted-foreground" />
              Daily cron
            </span>
            <span className="border-overlay absolute left-24 top-16 flex h-9 w-32 items-center gap-2 rounded-xl bg-background/80 px-2.5 text-xs font-medium shadow-(--custom-shadow)">
              <IconGhostFilled className="size-3.5 text-orange-500" />
              Agents ×6
            </span>
            <span className="border-overlay absolute right-0 top-32 flex h-9 w-28 items-center gap-2 rounded-xl bg-background/80 px-2.5 text-xs font-medium shadow-(--custom-shadow)">
              <IconSparkles className="size-3.5 text-emerald-500" />
              Postgres
            </span>
            <svg className="absolute inset-0 size-full overflow-visible">
              <path
                d="M 112 24 L 140 24 L 140 84 L 96 84 M 224 84 L 250 84 L 250 146 L 232 146"
                fill="none"
                stroke="rgba(120,124,136,0.45)"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            What it looks like as a poster
          </p>
        </motion.div>
      </div>
    </Band>
  );
}

// ─── 5. Unfurl showcase ───────────────────────────────────────────────────────
// The social payoff: an X post + Slack message with the poster unfurling.

function VariantUnfurl() {
  const reveal = useReveal();
  return (
    <Band>
      <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[0.8fr_1fr]">
        <div>
          <motion.h2
            {...reveal(0, { y: 10 })}
            className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            Built to be posted.
          </motion.h2>
          <motion.p
            {...reveal(0.12, { y: 10 })}
            className="mt-3 max-w-sm text-muted-foreground text-pretty"
          >
            The link unfurls into a branded card on X, Slack, Discord —
            your architecture, doing numbers.
          </motion.p>
        </div>
        <div className="relative">
          {/* X post */}
          <motion.div
            {...reveal(0.25, { y: 14 })}
            className="border-overlay relative z-10 max-w-md rounded-3xl corner-squircle bg-background/80 p-4 shadow-(--custom-shadow)"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 font-display text-sm font-bold text-white">
                G
              </span>
              <div className="text-sm leading-tight">
                <p className="font-medium">Gustavo</p>
                <p className="text-xs text-muted-foreground">@gustavo · 2m</p>
              </div>
              <IconBrandX className="ml-auto size-4 text-muted-foreground" />
            </div>
            <p className="mt-2.5 text-sm">
              our whole AI stack, mapped by one prompt 🤯
            </p>
            <div className="border-overlay mt-3 overflow-hidden rounded-xl">
              <div className="relative h-24 bg-gradient-to-br from-orange-500 to-amber-400">
                <IconGhostFilled className="absolute -right-1 -bottom-4 size-20 rotate-12 text-white/25" />
                <span className="absolute top-2.5 left-3.5 font-display text-xs font-semibold text-white/95">
                  Tireless Orchestrator
                </span>
                <span className="absolute bottom-2.5 left-3.5 font-display text-sm font-semibold text-white">
                  Olwen
                </span>
              </div>
              <div className="bg-background/60 px-3.5 py-2 text-xs text-muted-foreground">
                foglamp.dev/poster/olwen-x7f2
              </div>
            </div>
          </motion.div>
          {/* Slack message peeking behind */}
          <motion.div
            {...reveal(0.55, { y: 14 })}
            className="border-overlay absolute -right-2 -bottom-8 z-0 hidden w-72 rounded-2xl corner-squircle bg-muted/60 p-3.5 shadow-(--custom-shadow) backdrop-blur sm:block"
          >
            <div className="flex items-center gap-2 text-xs">
              <IconBrandSlack className="size-3.5 text-muted-foreground" />
              <span className="font-medium">#engineering</span>
              <span className="text-muted-foreground">now</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              new teammate onboarding = this link. that&apos;s it, that&apos;s
              the doc.
            </p>
          </motion.div>
        </div>
      </div>
    </Band>
  );
}

// ─── All five, labeled ────────────────────────────────────────────────────────

export function StoryVariants() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-5 sm:px-8">
      <div>
        <VariantLabel n={1} name="Terminal replay" />
        <VariantTerminal />
      </div>
      <div>
        <VariantLabel n={2} name="Chat thread" />
        <VariantChat />
      </div>
      <div>
        <VariantLabel n={3} name="Numbered panels" />
        <VariantPanels />
      </div>
      <div>
        <VariantLabel n={4} name="Before / after" />
        <VariantBeforeAfter />
      </div>
      <div>
        <VariantLabel n={5} name="Unfurl showcase" />
        <VariantUnfurl />
      </div>
    </div>
  );
}
