"use client";

// Bake-off, take three: six interactive/animated concepts for the scan page's
// middle act, each playing on a different idea of "scanning". Pick one; the
// winner replaces scan-story.tsx and this file dies.

import { cn } from "@foglamp/ui/lib/utils";
import {
  IconGhostFilled,
  IconWorld,
} from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import { type PointerEvent, type ReactNode, useRef, useState } from "react";

import { OlwenLogo, OptionLogo } from "@/components/brand-logos";
import { FogBank } from "@/components/marketing/noise-overlay";

// ─── shared ───────────────────────────────────────────────────────────────────

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

type Chip = {
  x: number;
  y: number;
  label: string;
  dot: string;
  Icon?: typeof IconGhostFilled;
};

// Node chips laid out on a 0-100 coordinate grid, reused by several bodies.
const CHIPS: Chip[] = [
  { x: 6, y: 22, label: "Next.js app", dot: "bg-slate-500" },
  { x: 4, y: 70, label: "Daily cron", dot: "bg-amber-500" },
  { x: 40, y: 14, label: "Research agent", dot: "bg-orange-500", Icon: IconGhostFilled },
  { x: 42, y: 62, label: "Support agent", dot: "bg-orange-500", Icon: IconGhostFilled },
  { x: 78, y: 26, label: "Postgres", dot: "bg-emerald-500" },
  { x: 80, y: 74, label: "Resend", dot: "bg-sky-500" },
];

const EDGES: [number, number][] = [
  [0, 2],
  [1, 3],
  [2, 4],
  [3, 4],
  [2, 5],
];

function ChipCard({ chip }: { chip: Chip }) {
  return (
    <span className="border-overlay flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-xs font-medium whitespace-nowrap shadow-(--custom-shadow)">
      {chip.Icon ? (
        <chip.Icon className="size-3.5 text-orange-500" />
      ) : (
        <span className={cn("size-2 rounded-full", chip.dot)} />
      )}
      {chip.label}
    </span>
  );
}

// A full node map on an absolute coordinate plane. `w`/`h` in px.
function NodeMap({ w, h, showEdges = true }: { w: number; h: number; showEdges?: boolean }) {
  const px = (c: Chip) => ({ left: `${c.x}%`, top: `${c.y}%` });
  return (
    <div className="relative" style={{ width: w, height: h }} aria-hidden>
      {showEdges ? (
        <svg className="absolute inset-0 overflow-visible" width={w} height={h}>
          {EDGES.map(([a, b], i) => {
            const A = CHIPS[a]!;
            const B = CHIPS[b]!;
            const ax = (A.x / 100) * w + 60;
            const ay = (A.y / 100) * h + 16;
            const bx = (B.x / 100) * w;
            const by = (B.y / 100) * h + 16;
            const mx = (ax + bx) / 2;
            return (
              <path
                key={i}
                d={`M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`}
                fill="none"
                stroke="color-mix(in oklab, var(--border) 65%, var(--muted-foreground) 35%)"
                strokeWidth={1.4}
              />
            );
          })}
        </svg>
      ) : null}
      {CHIPS.map((c) => (
        <span key={c.label} className="absolute" style={px(c)}>
          <ChipCard chip={c} />
        </span>
      ))}
    </div>
  );
}

const URL_TEXT = "foglamp.dev/scan/olwen-x7f2";

// ─── 1. Scanner beam ──────────────────────────────────────────────────────────
// A beam sweeps across a field of dim "file" dots; the nodes light up in its
// wake, then it keeps sweeping for ambiance. The literal reading of "scan".

function Scanner({ reduce }: { reduce: boolean }) {
  return (
    <div className="border-overlay relative h-80 w-full overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow)">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklab, var(--muted-foreground) 40%, transparent) 1px, transparent 1.5px)",
          backgroundSize: "22px 22px",
        }}
      />
      <NodeMapReveal reduce={reduce} />
      {!reduce && (
        <>
          <motion.div
            className="absolute inset-y-0 w-40"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklab, #f97316 22%, transparent), transparent)",
              filter: "blur(3px)",
            }}
            animate={{ x: ["-12%", "112%"] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-y-0 w-px bg-orange-500/70"
            animate={{ left: ["-2%", "102%"] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }}
          />
        </>
      )}
    </div>
  );
}

function NodeMapReveal({ reduce }: { reduce: boolean }) {
  return (
    <div className="absolute inset-8">
      <div className="relative h-full w-full">
        {CHIPS.map((c) => (
          <motion.span
            key={c.label}
            className="absolute"
            style={{ left: `${c.x}%`, top: `${c.y}%` }}
            initial={reduce ? false : { opacity: 0.12, filter: "blur(3px)" }}
            whileInView={{ opacity: 1, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 + (c.x / 100) * 4 }}
          >
            <ChipCard chip={c} />
          </motion.span>
        ))}
      </div>
    </div>
  );
}

// ─── 2. Cursor flashlight through the fog ─────────────────────────────────────
// The map sits under a bank of fog; the cursor is the only light. Ties the
// scan directly to Foglamp's fog language.

function Flashlight({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const mask = pos
    ? `radial-gradient(180px at ${pos.x}px ${pos.y}px, transparent 0%, transparent 42%, #000 78%)`
    : "none";
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onPointerLeave={() => setPos(null)}
      className="border-overlay relative h-80 w-full overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow)"
    >
      <div className="absolute inset-8">
        <NodeMap w={640} h={240} />
      </div>
      {!reduce && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ WebkitMaskImage: mask, maskImage: mask }}
        >
          <div className="absolute inset-0 bg-background/55 backdrop-blur-[2px]" />
          <div className="absolute inset-[-20%] opacity-90" style={{ filter: "blur(10px)" }}>
            <FogBank id="sv-fog-a" freq={0.012} seed={7} />
          </div>
          <div className="absolute inset-[-20%] opacity-70" style={{ filter: "blur(18px)" }}>
            <FogBank id="sv-fog-b" freq={0.022} seed={29} octaves={5} />
          </div>
        </div>
      )}
      <span className="pointer-events-none absolute bottom-4 left-5 text-xs text-muted-foreground">
        move your cursor over the fog
      </span>
    </div>
  );
}

// ─── 3. Drag: repo → map ──────────────────────────────────────────────────────

const FILES = [
  "apps/server/src/ai/agents/brand-analysis/agent.ts",
  "apps/server/src/routes/queue.ts",
  "packages/db/src/schema/brand-mention.ts",
  "apps/server/src/services/brightdata.ts",
  "apps/web/src/app/dashboard/page.tsx",
  "apps/server/src/ai/agents/content-creator/agent.ts",
  "packages/api/src/services/cms/github.ts",
  "apps/server/src/ai/models.ts",
  "apps/server/vercel.json",
  "apps/server/src/ai/agents/geo-strategy/agent.ts",
];

function DragReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(52);
  const dragging = useRef(false);
  const set = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPct(Math.min(92, Math.max(8, ((clientX - r.left) / r.width) * 100)));
  };
  const onDown = (e: PointerEvent) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    set(e.clientX);
  };
  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={(e) => dragging.current && set(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      className="border-overlay relative h-80 w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow)"
    >
      {/* map (bottom layer) */}
      <div className="absolute inset-8 flex items-center">
        <NodeMap w={640} h={240} />
      </div>
      {/* files (top layer, clipped to the left of the handle) */}
      <div
        className="absolute inset-0 bg-card"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      >
        <div className="absolute inset-8 flex flex-col gap-2 font-mono text-[11px] leading-relaxed text-muted-foreground/60">
          {FILES.map((f) => (
            <span key={f} className="truncate">
              {f}
            </span>
          ))}
        </div>
      </div>
      {/* handle */}
      <div
        className="absolute inset-y-0 w-px bg-orange-500/60"
        style={{ left: `${pct}%` }}
      >
        <span className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white shadow-(--custom-shadow)">
          ⇆
        </span>
      </div>
      <span className="pointer-events-none absolute bottom-4 left-5 text-xs text-muted-foreground">
        your repo
      </span>
      <span className="pointer-events-none absolute bottom-4 right-5 text-xs text-muted-foreground">
        the scan
      </span>
    </div>
  );
}

// ─── 4. Radar ─────────────────────────────────────────────────────────────────

const BLIPS = [
  { x: 72, y: 30, r: 0.9 },
  { x: 30, y: 22, r: 0.7 },
  { x: 78, y: 66, r: 1.1 },
  { x: 24, y: 70, r: 0.75 },
  { x: 58, y: 82, r: 1.0 },
];

function Radar({ reduce }: { reduce: boolean }) {
  return (
    <div className="border-overlay relative mx-auto flex h-80 w-full max-w-3xl items-center justify-center overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow)">
      <div className="relative size-64">
        {[0, 1, 2].map((i) =>
          reduce ? (
            <div
              key={i}
              className="absolute inset-0 rounded-full border border-orange-500/20"
              style={{ transform: `scale(${0.4 + i * 0.3})` }}
            />
          ) : (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full border border-orange-500/40"
              initial={{ scale: 0.15, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 0 }}
              transition={{
                duration: 3,
                delay: i,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          )
        )}
        <span className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-orange-500/15 text-orange-500">
          <IconGhostFilled className="size-4" />
        </span>
        {BLIPS.map((bp, i) => (
          <motion.span
            key={i}
            className="absolute size-2.5 rounded-full bg-orange-500"
            style={{ left: `${bp.x}%`, top: `${bp.y}%` }}
            initial={reduce ? false : { opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0.5], scale: 1 }}
            transition={{
              duration: 2.4,
              delay: bp.r,
              repeat: Infinity,
              repeatDelay: 0.6,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── 5. A wall of real scans (marquee) ────────────────────────────────────────

type ScanCard = { name: string; mark: ReactNode; tag: string };
const SCANS: ScanCard[] = [
  {
    name: "Olwen",
    mark: <OlwenLogo className="size-5" />,
    tag: "12 agents · Gemini",
  },
  {
    name: "Option",
    mark: <OptionLogo className="size-4" />,
    tag: "5 agents · Claude",
  },
  {
    name: "LKPR",
    mark: <span className="font-serif text-sm tracking-widest">LKPR</span>,
    tag: "14 agents · 6 models",
  },
  {
    name: "Mainline",
    mark: <span className="font-mono text-sm font-semibold">mainline</span>,
    tag: "7 agents · Haiku",
  },
];

function MarqueeRow({ reduce }: { reduce: boolean }) {
  const cards = [...SCANS, ...SCANS];
  return (
    <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]">
      <motion.div
        className="flex w-max gap-5"
        animate={reduce ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
      >
        {cards.map((s, i) => (
          <div
            key={i}
            className="border-overlay flex w-64 shrink-0 flex-col gap-3 rounded-3xl corner-squircle bg-card p-4 shadow-(--custom-shadow)"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              {s.mark}
              <span className="text-sm font-medium text-foreground">{s.name}</span>
            </div>
            <div className="relative h-24 overflow-hidden rounded-xl bg-background/60">
              <div className="scale-[0.42] origin-top-left">
                <NodeMap w={560} h={210} />
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{s.tag}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// ─── 6. The scan receipt ──────────────────────────────────────────────────────

function Receipt() {
  const ITEMS = [
    ["Agents", "6"],
    ["Models", "2"],
    ["Tools", "4"],
    ["Integrations", "13"],
    ["Data stores", "1"],
  ];
  return (
    <div className="w-80 rounded-t-xl bg-card p-6 font-mono text-sm shadow-(--custom-shadow) [mask:radial-gradient(6px_at_bottom,transparent_98%,#000)_bottom_/_16px_100%_repeat-x]">
      <p className="text-center text-xs tracking-[0.3em] text-muted-foreground">
        FOGLAMP SCAN
      </p>
      <p className="mt-1 text-center text-xs text-muted-foreground/60">
        olwen · main · {new Date().getFullYear()}
      </p>
      <div className="my-4 border-t border-dashed border-border" />
      <div className="flex flex-col gap-2">
        {ITEMS.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-muted-foreground">{k}</span>
            <span className="tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      <div className="my-4 border-t border-dashed border-border" />
      <div className="flex justify-between font-semibold">
        <span>Mapped</span>
        <span>1m 52s</span>
      </div>
      <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-orange-500">
        <IconWorld className="size-3.5" />
        {URL_TEXT}
      </p>
    </div>
  );
}

// ─── The bake-off ─────────────────────────────────────────────────────────────

const VARIANTS: {
  n: number;
  name: string;
  title: string;
  sub: string;
  render: (reduce: boolean) => ReactNode;
}[] = [
  {
    n: 1,
    name: "Scanner beam",
    title: "Point it at your repo. Watch the AI light up.",
    sub: "The prompt sweeps your codebase and surfaces every agent, model and tool it finds. Literally a scan.",
    render: (r) => <Scanner reduce={r} />,
  },
  {
    n: 2,
    name: "Flashlight through the fog",
    title: "Your AI stack is hiding in plain sight.",
    sub: "It is all in there, spread across files nobody opens together. The scan is the light. Move your cursor.",
    render: (r) => <Flashlight reduce={r} />,
  },
  {
    n: 3,
    name: "Drag: repo to map",
    title: "One is unreadable. The other you can share.",
    sub: "Same codebase, two views. Drag the handle to turn a wall of files into a map.",
    render: () => <DragReveal />,
  },
  {
    n: 4,
    name: "Radar",
    title: "It finds the agents you forgot you shipped.",
    sub: "AI creeps into a codebase one PR at a time. The scan pings all of it, including the parts off everyone's radar.",
    render: (r) => <Radar reduce={r} />,
  },
  {
    n: 5,
    name: "Wall of real scans",
    title: "See what other repos look like.",
    sub: "Every scan is a live, shareable page. Here are a few, drawn straight from the code.",
    render: (r) => <MarqueeRow reduce={r} />,
  },
  {
    n: 6,
    name: "The scan receipt",
    title: "An itemized look at your AI.",
    sub: "Every model call, tool and integration, counted. One prompt, about two minutes, one link.",
    render: () => <Receipt />,
  },
];

export function ScanStoryVariants() {
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="flex flex-col gap-32">
      {VARIANTS.map(({ n, name, title, sub, render }) => (
        <Frame key={n} n={n} name={name} title={title} sub={sub}>
          {render(reduce)}
        </Frame>
      ))}
    </div>
  );
}
