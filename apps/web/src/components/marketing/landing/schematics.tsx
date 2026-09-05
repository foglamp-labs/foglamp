import { type ReactNode, useId } from "react";

// Technical drawings for the three benefits. All share a 600 x 360 surface and
// one small kit: hairline strokes, dashed guides, hollow rings and filled dots
// for nodes, square handles on frames, and boxed mono tags for values.
//
// Two ink colors only, foreground and muted foreground. Nothing is drawn with
// an alpha: where two translucent lines cross they blend into a third tone,
// and that looks wrong at hairline scale. Emphasis comes from solid versus
// dashed, hollow versus filled, and hatching made of real lines.
//
// The SVG scales with its column; strokes do not (non-scaling-stroke). Text is
// HTML positioned in the same coordinate space so it keeps its size on small
// screens.

export type Section = "costs" | "traces" | "quality";

const W = 600;
const H = 360;

function Drawing({
  description,
  labels,
  children,
}: {
  description: string;
  labels?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={description}
      className="relative isolate aspect-[5/3] w-full min-w-0"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        fill="none"
        strokeWidth="1"
        aria-hidden="true"
        className="absolute inset-0 size-full stroke-foreground [&_*]:[vector-effect:non-scaling-stroke]"
      >
        {children}
      </svg>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {labels}
      </div>
    </div>
  );
}

// Text anchored at a drawing coordinate. Vertically centered on y; anchor
// picks which edge sits on x.
type Anchor = "start" | "middle" | "end";
const ANCHOR = {
  start: "-translate-y-1/2",
  middle: "-translate-x-1/2 -translate-y-1/2",
  end: "-translate-x-full -translate-y-1/2",
} as const;

function at(x: number, y: number) {
  return { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` };
}

// Plain mono note, muted by default.
function Note({
  x,
  y,
  anchor = "middle",
  strong = false,
  children,
}: {
  x: number;
  y: number;
  anchor?: Anchor;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`absolute whitespace-nowrap font-mono text-[10px] leading-none sm:text-[11px] ${ANCHOR[anchor]} ${strong ? "text-foreground" : "text-muted-foreground"}`}
      style={at(x, y)}
    >
      {children}
    </span>
  );
}

// Boxed mono tag. Opaque, so it can sit on a line and mask it, the way a
// value label sits on a dimension line.
function Tag({
  x,
  y,
  anchor = "middle",
  children,
}: {
  x: number;
  y: number;
  anchor?: Anchor;
  children: ReactNode;
}) {
  return (
    <span
      className={`absolute whitespace-nowrap border border-foreground bg-background px-1.5 py-[3px] font-mono text-[10px] leading-none sm:text-[11px] text-foreground ${ANCHOR[anchor]}`}
      style={at(x, y)}
    >
      {children}
    </span>
  );
}

// Ink helpers. `muted` swaps the stroke to the second color.
function Line({ d, muted = false, dashed = false }: { d: string; muted?: boolean; dashed?: boolean }) {
  return (
    <path
      d={d}
      className={muted ? "stroke-muted-foreground" : undefined}
      strokeDasharray={dashed ? "4 4" : undefined}
    />
  );
}

function Ring({ x, y, r = 4 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} className="fill-background" />;
}

function Dot({ x, y, r = 3.5 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} className="fill-foreground" stroke="none" />;
}

function Handle({ x, y }: { x: number; y: number }) {
  return <rect x={x - 3.5} y={y - 3.5} width={7} height={7} className="fill-background" />;
}

// A hatch made of real 45 degree lines. Used as a fill through url(#id).
function Hatch({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width="6"
      height="6"
      patternTransform="rotate(45)"
    >
      <line x1="0" y1="0" x2="0" y2="6" className="stroke-foreground" />
    </pattern>
  );
}

// Arrowhead pointing right (dir 1) or left (dir -1), tip at x.
function Head({ x, y, dir }: { x: number; y: number; dir: 1 | -1 }) {
  const b = x - dir * 6;
  return <path d={`M${b} ${y - 4}L${x} ${y}L${b} ${y + 4}`} />;
}

/* ------------------------------------------------------------------------ */
/* Costs                                                                     */
/* ------------------------------------------------------------------------ */

// Spend per agent, split by model, against a budget line one bar crosses.
// Scale: 6.4 units per dollar, so $50 lands at x=480.
const BAR_X = 160;
const PER_DOLLAR = 6.4;
const AGENTS: { name: string; y: number; parts: number[] }[] = [
  { name: "support", y: 80, parts: [10, 8, 4] },
  { name: "research", y: 140, parts: [24, 20, 12] },
  { name: "billing", y: 200, parts: [6, 4] },
  { name: "onboarding", y: 260, parts: [9, 3, 3] },
];

export function CostBars() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: spend per agent split by model, with one agent past the $50 budget line."
      labels={
        <>
          <Note x={176} y={41} anchor="start">gpt-5</Note>
          <Note x={246} y={41} anchor="start">claude</Note>
          <Note x={322} y={41} anchor="start">gemini</Note>
          {AGENTS.map((a) => (
            <Note key={a.name} x={144} y={a.y} anchor="end">{a.name}</Note>
          ))}
          <Tag x={480} y={40}>Budget $50</Tag>
          <Tag x={518} y={100}>$56.00</Tag>
          <Note x={160} y={320}>$0</Note>
          <Note x={320} y={320}>$25</Note>
          <Note x={480} y={320}>$50</Note>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>

      {/* legend swatches */}
      <rect x={160} y={36} width={10} height={10} className="fill-foreground" />
      <rect x={230} y={36} width={10} height={10} fill={`url(#${hatch})`} />
      <rect x={306} y={36} width={10} height={10} className="fill-background" />

      {/* axis */}
      <Line d="M160 300H560" />
      {[0, 1, 2, 3, 4, 5, 6].map((k) => (
        <Line key={k} d={`M${160 + k * 64} 300v6`} />
      ))}

      {/* bars */}
      {AGENTS.map((a) => {
        let x = BAR_X;
        return (
          <g key={a.name}>
            {a.parts.map((dollars, i) => {
              const w = dollars * PER_DOLLAR;
              const el = (
                <rect
                  key={i}
                  x={x}
                  y={a.y - 8}
                  width={w}
                  height={16}
                  className={i === 0 ? "fill-foreground" : i === 2 ? "fill-background" : undefined}
                  fill={i === 1 ? `url(#${hatch})` : undefined}
                />
              );
              x += w;
              return el;
            })}
            <Ring x={BAR_X} y={a.y} />
          </g>
        );
      })}

      {/* budget */}
      <Line d="M480 56V300" dashed />
      <Dot x={480} y={140} />
      <Line d="M518 132V110" />
    </Drawing>
  );
}

// Spend as area: one rectangle per agent, sized by cost. The biggest is
// hatched to read as the outlier.
export function CostTreemap() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a treemap of spend by agent, the largest cell hatched, totalling $42.80."
      labels={
        <>
          <Tag x={100} y={32} anchor="start">Total $42.80</Tag>
          <Tag x={226} y={128}>support $24.10</Tag>
          <Tag x={226} y={258}>research $8.40</Tag>
          <Tag x={456} y={108}>billing $6.10</Tag>
          <Tag x={456} y={238}>onboarding $4.20</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>

      {/* guides that carry the splits past the frame */}
      <Line d="M353 28V50M353 310V332M78 206H100M560 167H582M331 167H353" muted dashed />

      {/* cells */}
      <rect x={100} y={50} width={253} height={156} fill={`url(#${hatch})`} />
      <rect x={100} y={206} width={253} height={104} />
      <rect x={353} y={50} width={207} height={117} />
      <rect x={353} y={167} width={207} height={143} />

      {/* frame and handles */}
      <rect x={100} y={50} width={460} height={260} />
      <Handle x={100} y={50} />
      <Handle x={560} y={50} />
      <Handle x={100} y={310} />
      <Handle x={560} y={310} />
      <Dot x={353} y={206} />
    </Drawing>
  );
}

// Cumulative spend this week, projected forward until it meets the budget.
export function CostCurve() {
  return (
    <Drawing
      description="Illustration: cumulative spend at $42.80 today, projected to cross the $50 budget on Thursday, where an alert fires."
      labels={
        <>
          <Tag x={110} y={110}>Budget $50</Tag>
          <Tag x={388} y={150} anchor="end">$42.80</Tag>
          <Tag x={500} y={135} anchor="start">Alert</Tag>
          <Note x={400} y={306}>today</Note>
          <Note x={471} y={306}>thu</Note>
        </>
      }
    >
      {/* axes */}
      <Line d="M60 40V290H560" />
      {[160, 260, 360, 460, 560].map((x) => (
        <Line key={x} d={`M${x} 290v6`} />
      ))}

      {/* budget */}
      <Line d="M60 110H560" dashed />

      {/* spend so far, then the projection */}
      <Line d="M60 290L120 270L180 262L240 235L300 205L360 178L400 150" />
      <Line d="M400 150L540 71" dashed />

      {/* today */}
      <Line d="M400 40V290" />
      <Ring x={400} y={150} r={5} />

      {/* the crossing */}
      <Line d="M471 110V290" muted dashed />
      <Line d="M471 110L500 135" />
      <Dot x={471} y={110} />
    </Drawing>
  );
}

/* ------------------------------------------------------------------------ */
/* Traces                                                                    */
/* ------------------------------------------------------------------------ */

// The trace view: nested spans on a time axis. The tool call is filled and
// called out.
const SPANS: { name: string; depth: number; y: number; x0: number; x1: number; hot?: boolean }[] = [
  { name: "agent", depth: 0, y: 110, x0: 200, x1: 560 },
  { name: "generateText", depth: 1, y: 160, x0: 200, x1: 320 },
  { name: "searchDocs", depth: 1, y: 210, x0: 320, x1: 410, hot: true },
  { name: "generateText", depth: 1, y: 260, x0: 410, x1: 540 },
];

export function TraceWaterfall() {
  return (
    <Drawing
      description="Illustration: a trace waterfall with an agent span containing two model calls and a highlighted tool call."
      labels={
        <>
          {[
            [200, "0"],
            [290, "300ms"],
            [380, "600ms"],
            [470, "900ms"],
            [560, "1.2s"],
          ].map(([x, t]) => (
            <Note key={t} x={x as number} y={46}>{t}</Note>
          ))}
          {SPANS.map((s) => (
            <Note key={s.y} x={40 + s.depth * 20} y={s.y} anchor="start" strong={s.hot}>
              {s.name}
            </Note>
          ))}
          <Tag x={365} y={300}>searchDocs · 300ms</Tag>
        </>
      }
    >
      {/* time axis */}
      <Line d="M200 60H560" />
      {[200, 290, 380, 470, 560].map((x) => (
        <Line key={x} d={`M${x} 60v-6`} />
      ))}

      {/* tree connector on the left */}
      <Line d="M46 118V260M46 160h8M46 210h8M46 260h8" muted />

      {/* guides at the tool call's edges */}
      <Line d="M320 60V300M410 60V300" muted dashed />

      {/* spans */}
      {SPANS.map((s) => (
        <rect
          key={s.y}
          x={s.x0}
          y={s.y - 9}
          width={s.x1 - s.x0}
          height={18}
          className={s.hot ? "fill-foreground" : "fill-background"}
        />
      ))}

      {/* callout */}
      <Line d="M365 219V290" />
    </Drawing>
  );
}

// The same trace as a tree on the left, with a duration bar per row on the
// right. Scale: 1.2s across 230 units.
const TREE: { name: string; x: number; y: number; ms: number; hot?: boolean }[] = [
  { name: "agent", x: 110, y: 84, ms: 1200 },
  { name: "generateText", x: 170, y: 139, ms: 360 },
  { name: "searchDocs", x: 170, y: 194, ms: 300, hot: true },
  { name: "generateText", x: 170, y: 249, ms: 420 },
];
const TREE_BAR_X = 330;
const TREE_BAR_W = 230;

export function TraceTree() {
  return (
    <Drawing
      description="Illustration: a span tree with a duration bar for each span. The tool call is highlighted."
      labels={
        <>
          {TREE.map((n) => (
            <Note key={n.y} x={n.x + 16} y={n.y} anchor="start" strong={n.hot}>
              {n.name}
            </Note>
          ))}
          <Note x={TREE_BAR_X} y={46}>0</Note>
          <Note x={TREE_BAR_X + TREE_BAR_W} y={46}>1.2s</Note>
          <Tag x={TREE_BAR_X + (300 / 1200) * TREE_BAR_W + 12} y={194} anchor="start">300ms</Tag>
        </>
      }
    >
      {/* tree connectors */}
      <Line d="M110 88V249M110 139h60M110 194h60M110 249h60" />

      {/* axis guides */}
      <Line d={`M${TREE_BAR_X} 60V300M${TREE_BAR_X + TREE_BAR_W} 60V300`} muted dashed />
      <Line d={`M${TREE_BAR_X} 60H${TREE_BAR_X + TREE_BAR_W}`} />

      {/* bars */}
      {TREE.map((n) => (
        <rect
          key={n.y}
          x={TREE_BAR_X}
          y={n.y - 7}
          width={(n.ms / 1200) * TREE_BAR_W}
          height={14}
          className={n.hot ? "fill-foreground" : "fill-background"}
        />
      ))}

      {/* nodes, drawn last so they sit on the connectors */}
      {TREE.map((n) => (n.hot ? <Dot key={n.y} x={n.x} y={n.y} r={4.5} /> : <Ring key={n.y} x={n.x} y={n.y} r={4.5} />))}
    </Drawing>
  );
}

// A sequence diagram: agent, model, and tool exchanging messages in order.
const LANES = { agent: 140, model: 300, tool: 460 };
const MESSAGES: { from: keyof typeof LANES; to: keyof typeof LANES; y: number; label: string; reply?: boolean }[] = [
  { from: "agent", to: "model", y: 100, label: "prompt" },
  { from: "model", to: "agent", y: 140, label: "tool call", reply: true },
  { from: "agent", to: "tool", y: 180, label: "searchDocs" },
  { from: "tool", to: "agent", y: 220, label: "result", reply: true },
  { from: "agent", to: "model", y: 260, label: "prompt + result" },
  { from: "model", to: "agent", y: 300, label: "response", reply: true },
];

export function TraceSequence() {
  return (
    <Drawing
      description="Illustration: a sequence diagram where the agent prompts the model, runs the tool it asks for, and returns the result to get a response."
      labels={
        <>
          <Tag x={LANES.agent} y={50}>Agent</Tag>
          <Tag x={LANES.model} y={50}>Model</Tag>
          <Tag x={LANES.tool} y={50}>Tool</Tag>
          {MESSAGES.map((m) => {
            const a = LANES[m.from];
            const b = LANES[m.to];
            const mid = m.to === "tool" || m.from === "tool" ? (LANES.model + LANES.tool) / 2 : (a + b) / 2;
            return (
              <Note key={m.y} x={mid} y={m.y - 10} strong={m.from === "tool" || m.to === "tool"}>
                {m.label}
              </Note>
            );
          })}
          <Tag x={LANES.tool + 14} y={200} anchor="start">300ms</Tag>
        </>
      }
    >
      {/* lifelines */}
      {Object.values(LANES).map((x) => (
        <Line key={x} d={`M${x} 64V330`} muted dashed />
      ))}

      {/* activations */}
      <rect x={LANES.agent - 4} y={92} width={8} height={216} className="fill-background" />
      <rect x={LANES.model - 4} y={92} width={8} height={56} className="fill-background" />
      <rect x={LANES.model - 4} y={252} width={8} height={56} className="fill-background" />
      <rect x={LANES.tool - 4} y={172} width={8} height={56} className="fill-foreground" />

      {/* messages */}
      {MESSAGES.map((m) => {
        const a = LANES[m.from];
        const b = LANES[m.to];
        const dir: 1 | -1 = b > a ? 1 : -1;
        const x0 = a + dir * 4;
        const x1 = b - dir * 4;
        return (
          <g key={m.y}>
            <Line d={`M${x0} ${m.y}H${x1}`} dashed={m.reply} />
            <Head x={x1} y={m.y} dir={dir} />
          </g>
        );
      })}
    </Drawing>
  );
}

/* ------------------------------------------------------------------------ */
/* Quality                                                                   */
/* ------------------------------------------------------------------------ */

// Every response scored and plotted. After the "now" line a cluster falls
// under the threshold; a bracket groups it for the alert.
const PASSING: [number, number][] = [
  [90, 140], [112, 120], [134, 150], [156, 110], [178, 135], [200, 95], [222, 160],
  [244, 125], [266, 105], [288, 145], [310, 118], [332, 170], [354, 130], [376, 100], [398, 150],
];
const FAILING: [number, number][] = [
  [440, 215], [462, 240], [484, 225], [506, 255], [528, 235],
];

export function QualityScatter() {
  return (
    <Drawing
      description="Illustration: scored responses over time. Recent ones fall below the 0.7 threshold and are grouped for an alert."
      labels={
        <>
          <Note x={60} y={38}>score</Note>
          <Tag x={110} y={200}>Threshold 0.7</Tag>
          <Tag x={484} y={287}>5 below threshold</Tag>
          <Note x={420} y={316}>now</Note>
        </>
      }
    >
      {/* axes */}
      <Line d="M60 50V300H560" />
      {[160, 260, 360, 460, 560].map((x) => (
        <Line key={x} d={`M${x} 300v6`} />
      ))}

      {/* threshold and the now line */}
      <Line d="M60 200H560" dashed />
      <Line d="M420 50V300" />

      {/* the bracket */}
      <Line d="M430 262v6M430 268H538M538 262v6M484 268v10" />

      {/* responses */}
      {PASSING.map(([x, y]) => (
        <Ring key={x} x={x} y={y} />
      ))}
      <Ring x={450} y={170} />
      {FAILING.map(([x, y]) => (
        <Dot key={x} x={x} y={y} />
      ))}
    </Drawing>
  );
}

// A test report: one cell per response, filled when it failed, with the
// rolling pass rate drawn above and crossing the threshold.
const RATE = [
  100, 100, 100, 100, 100, 100, 100, 118, 110, 104, 100, 100, 100, 100, 100,
  100, 100, 100, 100, 100, 100, 100, 125, 130, 150, 172, 178, 196, 212, 216,
];
const FAILED = new Set([7, 22, 24, 25, 27, 28]);
const CELL_X = (i: number) => 72 + i * 16;

export function QualityRibbon() {
  const points = RATE.map((y, i) => `${CELL_X(i) + 6} ${y}`).join("L");
  return (
    <Drawing
      description="Illustration: the last thirty responses as cells, failures filled, with the pass rate falling through the 90 percent threshold."
      labels={
        <>
          <Note x={72} y={78} anchor="start">pass rate</Note>
          <Tag x={120} y={170}>Threshold 90%</Tag>
          <Tag x={500} y={148} anchor="start">Alert</Tag>
          <Note x={72} y={290} anchor="start">last 30 responses</Note>
        </>
      }
    >
      {/* threshold */}
      <Line d="M60 170H560" dashed />

      {/* guides from the failing run up to the curve */}
      <Line d="M436 250V125M484 250V172M532 250V212" muted dashed />

      {/* pass rate */}
      <Line d={`M${points}`} />
      <Dot x={476} y={170} />
      <Line d="M476 170L500 148" />

      {/* cells */}
      {RATE.map((_, i) => (
        <rect
          key={i}
          x={CELL_X(i)}
          y={250}
          width={12}
          height={12}
          className={FAILED.has(i) ? "fill-foreground" : "fill-background"}
        />
      ))}
    </Drawing>
  );
}

// One response under review: greeked text on the left, a three line scorecard
// on the right, and a leader from the flagged sentence to the failed check.
const GREEK = [290, 270, 300, 240, 285, 250, 295, 200, 280, 230];
const CHECKS: { name: string; y: number; pass: boolean }[] = [
  { name: "accurate", y: 110, pass: true },
  { name: "grounded", y: 170, pass: false },
  { name: "on topic", y: 230, pass: true },
];

export function QualityReview() {
  return (
    <Drawing
      description="Illustration: a response with one sentence flagged, scored against three checks. It fails the grounded check."
      labels={
        <>
          <Tag x={420} y={60} anchor="start">Score 2/3</Tag>
          {CHECKS.map((c) => (
            <Note key={c.name} x={425} y={c.y} anchor="start" strong={!c.pass}>
              {c.name}
            </Note>
          ))}
        </>
      }
    >
      {/* the document */}
      <rect x={70} y={60} width={250} height={240} className="fill-background" />
      <Handle x={70} y={60} />
      <Handle x={320} y={60} />
      <Handle x={70} y={300} />
      <Handle x={320} y={300} />
      {GREEK.map((x1, i) => {
        const y = 90 + i * 18;
        const flagged = i === 5;
        return <Line key={y} d={`M90 ${y}H${x1}`} muted={!flagged} />;
      })}
      <rect x={84} y={172} width={172} height={16} strokeDasharray="4 4" />

      {/* leader to the failed check */}
      <Line d="M256 180L386 170" />
      <Dot x={386} y={170} />

      {/* scorecard */}
      {CHECKS.map((c) => (
        <g key={c.name}>
          <Ring x={400} y={c.y} r={12} />
          {c.pass ? (
            <Line d={`M394 ${c.y}L399 ${c.y + 5}L407 ${c.y - 5}`} />
          ) : (
            <Line d={`M395 ${c.y - 5}L405 ${c.y + 5}M405 ${c.y - 5}L395 ${c.y + 5}`} />
          )}
        </g>
      ))}
    </Drawing>
  );
}

/* ------------------------------------------------------------------------ */
/* Registry                                                                  */
/* ------------------------------------------------------------------------ */

export type Variant = { id: string; label: string; component: () => ReactNode };

export const SCHEMATICS: Record<Section, Variant[]> = {
  costs: [
    { id: "bars", label: "Bars", component: CostBars },
    { id: "treemap", label: "Treemap", component: CostTreemap },
    { id: "curve", label: "Curve", component: CostCurve },
  ],
  traces: [
    { id: "waterfall", label: "Waterfall", component: TraceWaterfall },
    { id: "tree", label: "Tree", component: TraceTree },
    { id: "sequence", label: "Sequence", component: TraceSequence },
  ],
  quality: [
    { id: "scatter", label: "Scatter", component: QualityScatter },
    { id: "ribbon", label: "Ribbon", component: QualityRibbon },
    { id: "review", label: "Review", component: QualityReview },
  ],
};
