"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { cn } from "@foglamp/ui/lib/utils";
import NumberFlow from "@number-flow/react";
import {
  IconCheck,
  IconChevronDown,
  IconCircleCheckFilled,
  IconLoader2,
} from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { ClaudeLogo, GeminiLogo, OpenAILogo } from "../../brand-logos";
import { productBySlug, type Product } from "../products";
import "./bento.css";

// Mini, dependency-free widgets — one per feature. Hand-built SVG/CSS so the
// landing page stays light (no Recharts here; the real charts live in the lazy
// demo). They're *live*: CSS keyframes (gated behind `motion-safe:`) plus a few
// value cycles, so the grid feels like a running product. Colors are hardcoded
// per slug because Tailwind v4 can't JIT classes from a runtime `accent`.
//
// To keep the section calm, only one widget animates at a time: a single active
// slot (see useActiveCard) holds the `active` flag and advances every few
// seconds; every other card holds a static frame until its turn comes round.

type WidgetProps = { active: boolean };

/** Cycle through `length` frames every `ms`, restarting at 0 each time the card
 * becomes active so the animation always plays from the top. Pauses and holds
 * its last frame when `enabled` is false (inactive card or reduced motion). */
function useCycle(length: number, ms: number, enabled: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    setI(0);
    const id = setInterval(() => setI((p) => (p + 1) % length), ms);
    return () => clearInterval(id);
  }, [length, ms, enabled]);
  return i;
}

function SdkWidget({ active }: WidgetProps) {
  // The whole pitch in two lines — with a live terminal caret.
  return (
    <div className="flex h-full flex-col justify-center gap-1 font-mono text-xs leading-relaxed">
      <span>
        <span className="text-violet-600 dark:text-violet-400">import</span>{" "}
        <span className="text-muted-foreground">{"{ foglamp }"}</span>{" "}
        <span className="text-violet-600 dark:text-violet-400">from</span>{" "}
        <span className="text-emerald-600 dark:text-emerald-400">
          {'"foglamp"'}
        </span>
      </span>
      <span className="flex items-center">
        <span className="text-violet-600 dark:text-violet-400">const</span>
        &nbsp;fog =&nbsp;
        <span className="text-emerald-600 dark:text-emerald-400">foglamp</span>
        ()
        <span
          className={cn(
            "ml-1 inline-block h-3.5 w-1.5 rounded-[1px] bg-sky-500/80",
            active && "motion-safe:animate-[bento-blink_1.1s_step-end_infinite]"
          )}
        />
      </span>
    </div>
  );
}

const TRACE_BARS = [
  { left: 0, width: 100, c: "bg-[#8b5e34]/70 dark:bg-[#c9a888]/70" },
  { left: 4, width: 22, c: "bg-violet-500/70" },
  { left: 26, width: 14, c: "bg-blue-500/70" },
  { left: 40, width: 34, c: "bg-blue-500/70" },
  { left: 46, width: 22, c: "bg-violet-500/70" },
  { left: 74, width: 24, c: "bg-violet-500/70" },
];

function TracesWidget({ active }: WidgetProps) {
  // A waterfall with a playhead sweeping across it.
  return (
    <div className="relative flex h-full flex-col justify-center gap-1.5">
      {TRACE_BARS.map((b, i) => (
        <div key={i} className="relative h-2">
          <span
            className={cn("absolute top-0 h-2 rounded-full", b.c)}
            style={{ left: `${b.left}%`, width: `${b.width}%` }}
          />
        </div>
      ))}
      <span
        className={cn(
          "pointer-events-none absolute inset-y-0 w-px bg-foreground/25",
          active &&
            "motion-safe:animate-[bento-sweep_4.4s_ease-in-out_infinite]"
        )}
      />
    </div>
  );
}

const COST_CALLS = [
  { m: "Claude Opus 4.8", icon: ClaudeLogo, a: 0.142 },
  { m: "GPT-5.5", icon: OpenAILogo, a: 0.088 },
  { m: "Gemini 3.5 Flash", icon: GeminiLogo, a: 0.004 },
  { m: "GPT-5.5 mini", icon: OpenAILogo, a: 0.011 },
  { m: "Gemini 3.5 Pro", icon: GeminiLogo, a: 0.046 },
];
const COST_START = 1248.5;
const COST_TICK = 0.05;

function CostWidget({ active }: WidgetProps) {
  // A live receipt: recent calls stream in at the top, the day's total ticks up.
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((x) => x + 1), 2500);
    return () => clearInterval(id);
  }, [active]);

  const L = COST_CALLS.length;
  const head = n % L;
  const total = COST_START + n * COST_TICK;
  const rows = [0, 1, 2].map((k) => COST_CALLS[(head - k + L) % L]);

  return (
    <div className="flex h-full flex-col justify-center gap-0.5 text-xs">
      {rows.map((r, k) => {
        const Logo = r.icon;
        return (
          <div
            key={k === 0 ? `h${head}` : `r${k}`}
            className={cn(
              "flex items-center gap-2",
              k === 0 &&
                active &&
                "motion-safe:animate-[bento-stream_0.5s_ease-out]"
            )}
          >
            <Logo className="size-3.5 shrink-0" />
            <span className="truncate text-muted-foreground">{r.m}</span>
            <span
              className={cn(
                "ml-auto tabular-nums",
                k === 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-foreground/55"
              )}
            >
              {`$${r.a.toFixed(3)}`}
            </span>
          </div>
        );
      })}
      <div className="my-0.5 h-px bg-border" />
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">total</span>
        <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
          <NumberFlow
            value={total}
            format={{ style: "currency", currency: "USD" }}
          />
        </span>
      </div>
    </div>
  );
}

const EVAL_RATES = [0.94, 0.96, 0.89, 0.99];
const EVAL_PILLS = 42;

function EvalsWidget({ active }: WidgetProps) {
  // The overview's pill-meter style, with a pass rate that ticks live.
  const rate = EVAL_RATES[useCycle(EVAL_RATES.length, 3600, active)];
  const filled = Math.max(1, Math.round(rate * EVAL_PILLS));
  return (
    <div className="flex h-full flex-col justify-center gap-2 text-fuchsia-500 dark:text-fuchsia-400">
      <div className="flex items-baseline justify-end gap-2">
        <span className="text-lg font-semibold tabular-nums text-foreground">
          <span className="text-xs text-muted-foreground mr-1.5">
            Pass rate:
          </span>
          <NumberFlow
            value={rate}
            format={{ style: "percent", maximumFractionDigits: 0 }}
          />
        </span>
      </div>
      <div className="flex h-3.5 items-stretch gap-[3px]">
        {Array.from({ length: EVAL_PILLS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-full transition-colors duration-500",
              i < filled ? "bg-current" : "bg-muted-foreground/10"
            )}
            style={{ transitionDelay: `${i * 12}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

const ALERT_SERIES = [440, 640, 980, 1180, 720, 500];
const ALERT_THRESHOLD = 800;
const ALERT_SCALE = 1300;

function AlertsWidget({ active }: WidgetProps) {
  // p95 latency climbs across a threshold; the monitor trips OK → FIRING.
  const phase = useCycle(ALERT_SERIES.length, 900, active);
  const v = ALERT_SERIES[phase];
  const firing = v >= ALERT_THRESHOLD;
  const reduce = useReducedMotion() ?? false;

  const L = ALERT_SERIES.length;
  const pts = ALERT_SERIES.map(
    (s, i) => `${(i / (L - 1)) * 100},${(1 - s / ALERT_SCALE) * 40}`
  ).join(" ");
  const dotX = (phase / (L - 1)) * 100;
  const dotY = (1 - v / ALERT_SCALE) * 100;
  const thrY = (1 - ALERT_THRESHOLD / ALERT_SCALE) * 40;

  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-center justify-between h-8">
        <span className="text-xs text-muted-foreground">
          Latency{" "}
          <span className="tabular-nums text-primary">
            <NumberFlow value={v} />
            ms
          </span>
        </span>
        <AnimatePresence initial={false}>
          {firing && (
            <motion.span
              key="firing"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
            >
              <Badge variant="rose">
                <span
                  className={cn(
                    "relative size-1.5 rounded-full bg-rose-500",
                    active ? "animate-pulse" : ""
                  )}
                />
                Alert
              </Badge>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="relative h-9">
        <svg
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          className="h-full w-full"
        >
          <line
            x1="0"
            y1={thrY}
            x2="100"
            y2={thrY}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            className="text-rose-800"
          />
          <polyline
            points={pts}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="text-foreground/10"
          />
        </svg>
        <span
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
          style={{ left: `${dotX}%`, top: `${dotY}%` }}
        >
          <span className="relative grid place-items-center">
            {firing && active && (
              <span className="absolute size-3 rounded-full bg-rose-500/40 motion-safe:animate-ping" />
            )}
            <span
              className={cn(
                "relative size-2 rounded-full ring-2 ring-card transition-colors",
                firing ? "bg-rose-500" : "bg-emerald-500"
              )}
            />
          </span>
        </span>
      </div>
    </div>
  );
}

const AGENT_TREE = [
  { name: "researcher", tool: "search()" },
  { name: "writer", tool: "draft()" },
  { name: "critic", tool: "score()" },
];

function AgentsWidget({ active }: WidgetProps) {
  // A live call-tree: the orchestrator works down its children — earlier ones
  // are done, the active one is running (with its tool call), the rest queued.
  // length + 1 adds a final all-done frame so the card rests on a completed
  // run instead of freezing a spinner caught mid-rotation at hand-off.
  const current = useCycle(AGENT_TREE.length + 1, 2100, active);
  const [dur, setDur] = useState(2.4);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(
      () => setDur((d) => (d >= 6 ? 2 : Math.round((d + 0.1) * 10) / 10)),
      850
    );
    return () => clearInterval(id);
  }, [active]);

  return (
    <div className="flex h-full flex-col justify-center gap-0.5 text-xs">
      <div className="flex items-center gap-1.5">
        <IconChevronDown className="size-3 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">orchestrator</span>
        <span className="ml-auto tabular-nums text-muted-foreground">
          <NumberFlow
            value={dur}
            format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
          />
          s
        </span>
      </div>
      <div className="ml-[5px] flex flex-col gap-0.5 border-l border-border pl-3">
        {AGENT_TREE.map((a, i) => {
          const state =
            i < current ? "done" : i === current ? "running" : "queued";
          return (
            <div key={a.name} className="flex items-center gap-1.5">
              {state === "done" && (
                <IconCheck className="size-3 shrink-0 text-emerald-500" />
              )}
              {state === "running" && (
                <IconLoader2
                  className={cn(
                    "size-3 shrink-0 text-orange-500",
                    active && "motion-safe:animate-spin"
                  )}
                />
              )}
              {state === "queued" && (
                <span className="grid size-3 shrink-0 place-items-center">
                  <span className="size-1 rounded-full bg-muted-foreground/40" />
                </span>
              )}
              <span
                className={
                  state === "running"
                    ? "text-foreground"
                    : "text-muted-foreground"
                }
              >
                {a.name}
              </span>
              <span className="ml-auto text-[11px] tabular-nums">
                {state === "running" ? (
                  <span className="text-orange-500">{a.tool}</span>
                ) : (
                  <span className="text-muted-foreground/60">
                    {state === "done" ? "done" : "queued"}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WIDGETS: Record<string, (props: WidgetProps) => React.ReactNode> = {
  "cost-intelligence": CostWidget,
  evals: EvalsWidget,
  alerts: AlertsWidget,
  agents: AgentsWidget,
  "distributed-traces": TracesWidget,
  sdk: SdkWidget,
};

// Narrative order — follow the data's life: instrument → see → spend → judge →
// alert → group. Kept local (not in products.ts) so the navbar dropdown order
// is unaffected.
const CARD_ORDER = [
  "sdk",
  "distributed-traces",
  "cost-intelligence",
  "evals",
  "alerts",
  "agents",
];

// Per-widget cycle lengths (ms): how long each widget needs to play its loop
// through once. The active slot holds a card for its own duration so the loop
// finishes before advancing, instead of being cut off mid-animation.
const CYCLE_MS: Record<string, number> = {
  sdk: 3300, // ~3 caret blinks (1.1s each)
  "distributed-traces": 4400, // one full playhead sweep
  "cost-intelligence": 5500, // a few receipt rows stream in and settle
  evals: 8000, // two pass-rate ticks (3.6s each), then settle in the gap
  alerts: 5200, // a full OK -> FIRING -> OK walk (6 steps), settled low
  agents: 7000, // step through the tree, then rest on the all-done frame
};

// Move a single active slot across the cards so exactly one widget animates at a
// time. Each card holds the slot for its own cycle length so its animation runs
// to completion before advancing. Empty under reduced motion, which leaves every
// widget on a static frame.
function useActiveCard(durations: number[], enabled: boolean) {
  const [active, setActive] = useState(0);
  const count = durations.length;
  const ms = durations[active];
  useEffect(() => {
    if (!enabled) return;
    const id = setTimeout(() => setActive((s) => (s + 1) % count), ms);
    return () => clearTimeout(id);
  }, [active, ms, count, enabled]);
  return (i: number) => enabled && i === active;
}

function BentoCard({ product, active }: { product: Product; active: boolean }) {
  const Icon = product.icon;
  const Widget = WIDGETS[product.slug];
  return (
    <div className="flex h-full flex-col gap-2 rounded-3xl corner-squircle bg-card dark:bg-card/50 p-6 shadow-(--custom-shadow)">
      <div className="flex items-center gap-2.5">
        <span className={product.chipClassName}>
          <Icon className="size-3.5" />
        </span>
        <h3 className="text-base font-medium leading-0">{product.label}</h3>
      </div>
      <p className="text-sm text-muted-foreground/80 text-pretty">
        {product.tagline}
      </p>
      <div className="h-20 flex- mt-1">
        {Widget ? <Widget active={active} /> : null}
      </div>
    </div>
  );
}

export function BentoGrid() {
  const cards = CARD_ORDER.map((slug) => productBySlug(slug)).filter(
    (p): p is Product => Boolean(p)
  );
  const reduce = useReducedMotion() ?? false;
  const durations = cards.map((p) => CYCLE_MS[p.slug] ?? 4000);
  const isActive = useActiveCard(durations, !reduce);
  return (
    <section className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <div className="mb-1">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          One SDK in. Everything out.
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground text-pretty">
          Instrument once. Get cost, traces, evals, alerts, and per-agent spend
          on every call.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-8">
        {cards.map((product, i) => (
          <BentoCard
            key={product.slug}
            product={product}
            active={isActive(i)}
          />
        ))}
      </div>
    </section>
  );
}
