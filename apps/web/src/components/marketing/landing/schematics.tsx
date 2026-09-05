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
// Axes carry ticks at their interior stops but never at the far end.
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

const MONO = "whitespace-nowrap font-mono text-[10px] leading-none sm:text-[11px]";

// Plain mono note, muted by default. `mask` gives it an opaque background so
// it stays legible over hatching.
function Note({
  x,
  y,
  anchor = "middle",
  strong = false,
  mask = false,
  children,
}: {
  x: number;
  y: number;
  anchor?: Anchor;
  strong?: boolean;
  mask?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`absolute ${MONO} ${ANCHOR[anchor]} ${strong ? "text-foreground" : "text-muted-foreground"} ${mask ? "bg-background px-1" : ""}`}
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
      className={`absolute border border-foreground bg-background px-1.5 py-[3px] text-foreground ${MONO} ${ANCHOR[anchor]}`}
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

function Diamond({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y - 5}L${x + 5} ${y}L${x} ${y + 5}L${x - 5} ${y}Z`} className="fill-background" />;
}

// A rectangle with a handle on each corner. Dashed when it is a selection.
function Frame({ x, y, w, h, dashed = false }: { x: number; y: number; w: number; h: number; dashed?: boolean }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} strokeDasharray={dashed ? "4 4" : undefined} />
      <Handle x={x} y={y} />
      <Handle x={x + w} y={y} />
      <Handle x={x} y={y + h} />
      <Handle x={x + w} y={y + h} />
    </>
  );
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

// A dimension line with arrowheads at both ends.
function Dimension({ x0, x1, y }: { x0: number; x1: number; y: number }) {
  return (
    <>
      <Line d={`M${x0} ${y}H${x1}`} />
      <Head x={x0} y={y} dir={-1} />
      <Head x={x1} y={y} dir={1} />
    </>
  );
}

// An x axis: the line plus ticks at the given stops. Pass interior stops only.
function Axis({ x0, x1, y, ticks }: { x0: number; x1: number; y: number; ticks: number[] }) {
  return <Line d={`M${x0} ${y}H${x1}` + ticks.map((x) => `M${x} ${y}v6`).join("")} />;
}

/* ------------------------------------------------------------------------ */
/* Costs                                                                     */
/* ------------------------------------------------------------------------ */

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

      <Frame x={100} y={50} w={460} h={260} />
      <Dot x={353} y={206} />
    </Drawing>
  );
}

// The same treemap, with the biggest cell opened up by model.
export function CostNested() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a treemap of spend by agent, with the support cell split by model. gpt-5 is the largest share."
      labels={
        <>
          <Tag x={100} y={32} anchor="start">Total $42.80</Tag>
          <Note x={170} y={64} mask>gpt-5</Note>
          <Note x={274} y={64}>claude</Note>
          <Note x={331} y={64}>gemini</Note>
          <Tag x={226} y={150}>support $24.10</Tag>
          <Tag x={226} y={258}>research $8.40</Tag>
          <Tag x={456} y={108}>billing $6.10</Tag>
          <Tag x={456} y={238}>onboarding $4.20</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>

      <Line d="M353 28V50M353 310V332M78 206H100M560 167H582M331 167H353" muted dashed />

      {/* support, by model */}
      <rect x={100} y={50} width={139} height={156} fill={`url(#${hatch})`} />
      <rect x={239} y={50} width={71} height={156} />
      <rect x={310} y={50} width={43} height={156} />
      <Line d="M239 78V206M310 78V206" />

      {/* the rest */}
      <rect x={100} y={206} width={253} height={104} />
      <rect x={353} y={50} width={207} height={117} />
      <rect x={353} y={167} width={207} height={143} />

      <Frame x={100} y={50} w={460} h={260} />
      <Dot x={353} y={206} />
    </Drawing>
  );
}

// Spend as one band split by agent, dimensioned like a part drawing.
const BAND: { name: string; w: number; value: string; drop: number }[] = [
  { name: "support", w: 269, value: "$24.10", drop: 232 },
  { name: "research", w: 96, value: "$8.40", drop: 232 },
  { name: "billing", w: 67, value: "$6.10", drop: 264 },
  { name: "onboarding", w: 48, value: "$4.20", drop: 296 },
];

export function CostBand() {
  const hatch = useId();
  let x = 80;
  const segments = BAND.map((s) => {
    const seg = { ...s, x, mid: x + s.w / 2 };
    x += s.w;
    return seg;
  });
  return (
    <Drawing
      description="Illustration: total spend as one band divided by agent, each segment dimensioned with its cost."
      labels={
        <>
          <Tag x={320} y={110}>Total $42.80</Tag>
          {segments.map((s) => (
            <Tag key={s.name} x={s.name === "onboarding" ? 560 : s.mid} y={s.drop} anchor={s.name === "onboarding" ? "end" : "middle"}>
              {s.name} {s.value}
            </Tag>
          ))}
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>

      {/* overall dimension */}
      <Line d="M80 100V150M560 100V150" muted dashed />
      <Dimension x0={80} x1={560} y={110} />

      {/* the band */}
      {segments.map((s, i) => (
        <rect
          key={s.name}
          x={s.x}
          y={150}
          width={s.w}
          height={40}
          fill={i === 0 ? `url(#${hatch})` : undefined}
          className={i === 0 ? undefined : "fill-background"}
        />
      ))}
      <Frame x={80} y={150} w={480} h={40} />

      {/* leaders down to the labels */}
      {segments.map((s) => (
        <Line key={s.name} d={`M${s.mid} 190V${s.drop - 10}`} />
      ))}
    </Drawing>
  );
}

// Spend per customer: one cell each. Filled is the biggest, hatched the next
// few, hollow the long tail.
const WAFFLE = { cols: 12, rows: 5, cell: 26, pitch: 34, x: 100, y: 80 };
const HEAVY = new Set([3, 15, 16, 27, 44]);
const TOP = 35;

export function CostWaffle() {
  const hatch = useId();
  const cellAt = (i: number) => ({
    x: WAFFLE.x + (i % WAFFLE.cols) * WAFFLE.pitch,
    y: WAFFLE.y + Math.floor(i / WAFFLE.cols) * WAFFLE.pitch,
  });
  const top = cellAt(TOP);
  return (
    <Drawing
      description="Illustration: sixty customers as a grid of cells, the five that cost the most marked, the top one at $9.80."
      labels={
        <>
          <Tag x={100} y={46} anchor="start">Total $42.80</Tag>
          <Note x={560} y={46} anchor="end">60 customers</Note>
          <Tag x={526} y={161} anchor="start">acme $9.80</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>

      {Array.from({ length: WAFFLE.cols * WAFFLE.rows }, (_, i) => {
        const c = cellAt(i);
        return (
          <rect
            key={i}
            x={c.x}
            y={c.y}
            width={WAFFLE.cell}
            height={WAFFLE.cell}
            fill={i === TOP ? undefined : HEAVY.has(i) ? `url(#${hatch})` : undefined}
            className={i === TOP ? "fill-foreground" : HEAVY.has(i) ? undefined : "fill-background"}
          />
        );
      })}

      {/* leader from the top customer */}
      <Line d={`M${top.x + WAFFLE.cell} ${top.y + WAFFLE.cell / 2}H${518}`} />
      <Dot x={top.x + WAFFLE.cell} y={top.y + WAFFLE.cell / 2} />
    </Drawing>
  );
}

// Spend accumulating along the week, one stop per day, heading for the
// budget marker.
const DAYS: { name: string; total: string; up: boolean }[] = [
  { name: "mon", total: "$6.10", up: true },
  { name: "tue", total: "$12.40", up: false },
  { name: "wed", total: "$18.90", up: true },
  { name: "thu", total: "$26.30", up: false },
  { name: "fri", total: "$34.80", up: true },
  { name: "sat", total: "$38.60", up: false },
  { name: "sun", total: "$42.80", up: true },
];
const DAY_X = (i: number) => 90 + i * 62;

export function CostRail() {
  return (
    <Drawing
      description="Illustration: spend accumulating day by day along a rail, at $42.80 on Sunday and heading for the $50 budget marker."
      labels={
        <>
          {DAYS.map((d, i) => (
            <Note key={d.name} x={DAY_X(i)} y={155} strong={i === DAYS.length - 1}>
              {d.name}
            </Note>
          ))}
          {DAYS.map((d, i) => (
            <Tag key={d.name} x={DAY_X(i)} y={d.up ? 232 : 272}>
              {d.total}
            </Tag>
          ))}
          <Tag x={520} y={100}>Budget $50</Tag>
        </>
      }
    >
      {/* the rail: solid through today, dashed beyond */}
      <Line d={`M60 180H${DAY_X(6)}`} />
      <Line d={`M${DAY_X(6)} 180H560`} dashed />

      {/* leaders to the daily totals */}
      {DAYS.map((d, i) => (
        <Line key={d.name} d={`M${DAY_X(i)} 184V${d.up ? 222 : 262}`} />
      ))}

      {/* the budget */}
      <Line d="M520 112V180" muted dashed />
      <Diamond x={520} y={180} />

      {/* days */}
      {DAYS.map((d, i) =>
        i === DAYS.length - 1 ? <Ring key={d.name} x={DAY_X(i)} y={180} r={5} /> : <Dot key={d.name} x={DAY_X(i)} y={180} />
      )}
    </Drawing>
  );
}

/* ------------------------------------------------------------------------ */
/* Traces                                                                    */
/* ------------------------------------------------------------------------ */

// One trace, used by every trace drawing: an agent run of 1.2s with two
// model calls around a tool call. Time maps to x at 0.3 units per ms.
const T0 = 200;
const T1 = 560;
const ms = (t: number) => T0 + t * 0.3;
const TRACE: { name: string; depth: number; start: number; end: number; tokens: string; hot?: boolean }[] = [
  { name: "agent", depth: 0, start: 0, end: 1200, tokens: "3,420" },
  { name: "generateText", depth: 1, start: 0, end: 400, tokens: "1,180" },
  { name: "searchDocs", depth: 1, start: 400, end: 700, tokens: "820", hot: true },
  { name: "generateText", depth: 1, start: 700, end: 1130, tokens: "1,420" },
];
const HOT = TRACE[2]!;
const TIME_STOPS = [0, 300, 600, 900];
const TIME_LABELS = ["0", "300ms", "600ms", "900ms"];

function TimeNotes({ y }: { y: number }) {
  return (
    <>
      {TIME_STOPS.map((t, i) => (
        <Note key={t} x={ms(t)} y={y}>{TIME_LABELS[i]}</Note>
      ))}
      <Note x={T1} y={y}>1.2s</Note>
    </>
  );
}

// The waterfall as a table: hairline rows, names in the first column, thin
// bars in the second. The tool call is filled and dimensioned below.
const ROW_Y = (i: number) => 100 + i * 50;

export function TraceRows() {
  return (
    <Drawing
      description="Illustration: a trace waterfall with hairline rows. An agent span holds two model calls around a highlighted 300ms tool call."
      labels={
        <>
          <TimeNotes y={46} />
          {TRACE.map((s, i) => (
            <Note key={i} x={60 + s.depth * 16} y={ROW_Y(i)} anchor="start" strong={s.hot}>
              {s.name}
            </Note>
          ))}
          <Tag x={(ms(HOT.start) + ms(HOT.end)) / 2} y={306}>300ms</Tag>
        </>
      }
    >
      <Axis x0={T0} x1={T1} y={60} ticks={TIME_STOPS.map(ms)} />

      {/* rows */}
      {TRACE.map((_, i) => (
        <Line key={i} d={`M60 ${ROW_Y(i) + 25}H560`} muted />
      ))}

      {/* guides at the tool call's edges */}
      <Line d={`M${ms(HOT.start)} 60V296M${ms(HOT.end)} 60V296`} muted dashed />

      {/* spans */}
      {TRACE.map((s, i) => (
        <rect
          key={i}
          x={ms(s.start)}
          y={ROW_Y(i) - 5}
          width={ms(s.end) - ms(s.start)}
          height={10}
          className={s.hot ? "fill-foreground" : "fill-background"}
        />
      ))}

      <Dimension x0={ms(HOT.start)} x1={ms(HOT.end)} y={306} />
    </Drawing>
  );
}

// Each span as a rail: a ring where it starts, a dot where it ends. The tool
// call is a hatched capsule on its rail.
export function TraceRails() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a trace drawn as rails, a ring at each span's start and a dot at its end. The tool call is a hatched capsule."
      labels={
        <>
          <TimeNotes y={46} />
          {TRACE.map((s, i) => (
            <Note key={i} x={60 + s.depth * 16} y={ROW_Y(i)} anchor="start" strong={s.hot}>
              {s.name}
            </Note>
          ))}
          <Tag x={(ms(HOT.start) + ms(HOT.end)) / 2} y={300}>searchDocs · 300ms</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>

      <Axis x0={T0} x1={T1} y={60} ticks={TIME_STOPS.map(ms)} />

      {/* faint rails across every row, then the spans on top */}
      {TRACE.map((_, i) => (
        <Line key={i} d={`M${T0} ${ROW_Y(i)}H${T1}`} muted dashed />
      ))}
      {TRACE.map((s, i) =>
        s.hot ? (
          <rect
            key={i}
            x={ms(s.start)}
            y={ROW_Y(i) - 8}
            width={ms(s.end) - ms(s.start)}
            height={16}
            rx={8}
            fill={`url(#${hatch})`}
          />
        ) : (
          <Line key={i} d={`M${ms(s.start)} ${ROW_Y(i)}H${ms(s.end)}`} />
        )
      )}
      {TRACE.map((s, i) =>
        s.hot ? null : (
          <g key={i}>
            <Ring x={ms(s.start)} y={ROW_Y(i)} />
            <Dot x={ms(s.end)} y={ROW_Y(i)} />
          </g>
        )
      )}

      {/* callout */}
      <Line d={`M${(ms(HOT.start) + ms(HOT.end)) / 2} ${ROW_Y(2) + 8}V290`} />
    </Drawing>
  );
}

// Nesting as containment: the agent span is a dashed frame around its
// children.
export function TraceNested() {
  const hatch = useId();
  const rows = [130, 185, 240];
  return (
    <Drawing
      description="Illustration: an agent span drawn as a dashed frame containing two model calls and a hatched tool call."
      labels={
        <>
          <TimeNotes y={46} />
          <Tag x={380} y={90}>agent · 1.2s</Tag>
          {TRACE.slice(1).map((s, i) => (
            <Note key={i} x={60} y={rows[i]!} anchor="start" strong={s.hot}>
              {s.name}
            </Note>
          ))}
          <Tag x={(ms(HOT.start) + ms(HOT.end)) / 2} y={318}>300ms</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>

      <Axis x0={T0} x1={T1} y={60} ticks={TIME_STOPS.map(ms)} />

      <Frame x={T0} y={90} w={T1 - T0} h={190} dashed />

      {TRACE.slice(1).map((s, i) => (
        <rect
          key={i}
          x={ms(s.start)}
          y={rows[i]! - 9}
          width={ms(s.end) - ms(s.start)}
          height={18}
          fill={s.hot ? `url(#${hatch})` : undefined}
          className={s.hot ? undefined : "fill-background"}
        />
      ))}

      <Line d={`M${ms(HOT.start)} 280V308M${ms(HOT.end)} 280V308`} muted dashed />
      <Dimension x0={ms(HOT.start)} x1={ms(HOT.end)} y={318} />
    </Drawing>
  );
}

// A ruler along the top, a tick every 100ms, and the duration noted at the
// end of each bar.
export function TraceRuler() {
  return (
    <Drawing
      description="Illustration: a trace under a ruler marked every 100ms. Each span's duration sits at its end; the 300ms tool call is highlighted."
      labels={
        <>
          <TimeNotes y={44} />
          {TRACE.map((s, i) => (
            <Note key={i} x={60 + s.depth * 16} y={ROW_Y(i)} anchor="start" strong={s.hot}>
              {s.name}
            </Note>
          ))}
          {TRACE.slice(1).map((s, i) => (
            <Note key={i} x={ms(s.end) + 10} y={ROW_Y(i + 1)} anchor="start" strong={s.hot}>
              {s.end - s.start}ms
            </Note>
          ))}
        </>
      }
    >
      {/* the ruler */}
      <Line
        d={
          `M${T0} 60H${T1}` +
          Array.from({ length: 12 }, (_, i) => `M${ms(i * 100)} 60v${i % 3 === 0 ? 10 : 5}`).join("")
        }
      />

      {TRACE.map((s, i) => (
        <rect
          key={i}
          x={ms(s.start)}
          y={ROW_Y(i) - 6}
          width={ms(s.end) - ms(s.start)}
          height={12}
          className={s.hot ? "fill-foreground" : "fill-background"}
        />
      ))}

      {/* the highlighted span, projected back up to the ruler */}
      <Line d={`M${ms(HOT.start)} 70V${ROW_Y(2) - 6}M${ms(HOT.end)} 70V${ROW_Y(2) - 6}`} muted dashed />
    </Drawing>
  );
}

// The trace as a ledger: name, duration, tokens, and a small bar per row.
const LEDGER_Y = (i: number) => 120 + i * 50;
const LEDGER_BAR = { x0: 400, x1: 560 };
const lx = (t: number) => LEDGER_BAR.x0 + (t / 1200) * (LEDGER_BAR.x1 - LEDGER_BAR.x0);

export function TraceLedger() {
  return (
    <Drawing
      description="Illustration: the trace as a ledger with a column each for span, duration, tokens, and timing. The tool call row is highlighted."
      labels={
        <>
          <Note x={60} y={70} anchor="start">span</Note>
          <Note x={290} y={70} anchor="end">ms</Note>
          <Note x={370} y={70} anchor="end">tokens</Note>
          <Note x={400} y={70} anchor="start">timing</Note>
          {TRACE.map((s, i) => (
            <Note key={`n${i}`} x={60 + s.depth * 16} y={LEDGER_Y(i)} anchor="start" strong={s.hot}>
              {s.name}
            </Note>
          ))}
          {TRACE.map((s, i) => (
            <Note key={`d${i}`} x={290} y={LEDGER_Y(i)} anchor="end" strong={s.hot}>
              {s.end - s.start}
            </Note>
          ))}
          {TRACE.map((s, i) => (
            <Note key={`t${i}`} x={370} y={LEDGER_Y(i)} anchor="end" strong={s.hot}>
              {s.tokens}
            </Note>
          ))}
        </>
      }
    >
      {/* header rule, then hairlines */}
      <Line d="M60 95H560" />
      {TRACE.map((_, i) => (
        <Line key={i} d={`M60 ${LEDGER_Y(i) + 25}H560`} muted />
      ))}

      {TRACE.map((s, i) => (
        <rect
          key={i}
          x={lx(s.start)}
          y={LEDGER_Y(i) - 5}
          width={lx(s.end) - lx(s.start)}
          height={10}
          className={s.hot ? "fill-foreground" : "fill-background"}
        />
      ))}
    </Drawing>
  );
}

/* ------------------------------------------------------------------------ */
/* Quality                                                                   */
/* ------------------------------------------------------------------------ */

// Every response scored and plotted. Shared by the scatter family.
const PASSING: [number, number][] = [
  [90, 140], [112, 120], [134, 150], [156, 110], [178, 135], [200, 95], [222, 160],
  [244, 125], [266, 105], [288, 145], [310, 118], [332, 170], [354, 130], [376, 100], [398, 150],
];
const FAILING: [number, number][] = [
  [440, 215], [462, 240], [484, 225], [506, 255], [528, 235],
];
const THRESHOLD = 200;
const NOW = 420;
const Q_TICKS = [160, 260, 360, 460];

function Points() {
  return (
    <>
      {PASSING.map(([x, y]) => (
        <Ring key={x} x={x} y={y} />
      ))}
      <Ring x={450} y={170} />
      {FAILING.map(([x, y]) => (
        <Dot key={x} x={x} y={y} />
      ))}
    </>
  );
}

// After the "now" line a cluster falls under the threshold; a bracket groups
// it for the alert.
export function QualityScatter() {
  return (
    <Drawing
      description="Illustration: scored responses over time. Recent ones fall below the 0.7 threshold and are grouped for an alert."
      labels={
        <>
          <Note x={60} y={38}>score</Note>
          <Tag x={110} y={THRESHOLD}>Threshold 0.7</Tag>
          <Tag x={484} y={287}>5 below threshold</Tag>
          <Note x={NOW} y={316}>now</Note>
        </>
      }
    >
      <Line d="M60 50V300" />
      <Axis x0={60} x1={560} y={300} ticks={Q_TICKS} />
      <Line d={`M60 ${THRESHOLD}H560`} dashed />
      <Line d={`M${NOW} 50V300`} />
      <Line d="M430 262v6M430 268H538M538 262v6M484 268v10" />
      <Points />
    </Drawing>
  );
}

// The same points with their rolling mean drawn through them. The alert is
// where the mean crosses the threshold.
export function QualityMean() {
  return (
    <Drawing
      description="Illustration: scored responses with a rolling mean drawn through them. The mean crosses the 0.7 threshold and an alert fires."
      labels={
        <>
          <Note x={60} y={38}>score</Note>
          <Tag x={110} y={THRESHOLD}>Threshold 0.7</Tag>
          <Tag x={488} y={160} anchor="start">Alert</Tag>
          <Note x={200} y={316}>mean</Note>
        </>
      }
    >
      <Line d="M60 50V300" />
      <Axis x0={60} x1={560} y={300} ticks={Q_TICKS} />
      <Line d={`M60 ${THRESHOLD}H560`} dashed />

      <Line d="M90 135L150 130L210 128L270 132L330 138L390 150L420 175L440 200L480 225L530 238" />
      <Points />
      <Line d="M440 200L478 162" />
      <Dot x={440} y={200} r={4.5} />
    </Drawing>
  );
}

// Scores split by check, one rail each. The grounded check is where the
// failures are.
const STRIPS: { name: string; y: number; pass: number[]; fail: number[]; hot?: boolean }[] = [
  { name: "accurate", y: 110, pass: [392, 418, 446, 470, 494, 522, 548], fail: [330] },
  { name: "grounded", y: 180, pass: [400, 436, 466, 512, 540], fail: [214, 246, 292, 322], hot: true },
  { name: "on topic", y: 250, pass: [384, 410, 440, 462, 488, 518, 546], fail: [] },
];
const S0 = 160;
const S_THRESHOLD = 360;

export function QualityStrips() {
  return (
    <Drawing
      description="Illustration: scores per check on three rails. Passing scores sit right of the 0.7 line; the grounded check has four below it."
      labels={
        <>
          {STRIPS.map((s) => (
            <Note key={s.name} x={140} y={s.y} anchor="end" strong={s.hot}>
              {s.name}
            </Note>
          ))}
          <Tag x={S_THRESHOLD} y={60}>Threshold 0.7</Tag>
          <Tag x={268} y={214}>4 below threshold</Tag>
          <Note x={S0} y={316}>0.4</Note>
          <Note x={293} y={316}>0.6</Note>
          <Note x={427} y={316}>0.8</Note>
        </>
      }
    >
      <Axis x0={S0} x1={560} y={300} ticks={[S0, 293, 427]} />
      <Line d={`M${S_THRESHOLD} 72V300`} dashed />

      {STRIPS.map((s) => (
        <Line key={s.name} d={`M${S0} ${s.y}H560`} muted />
      ))}
      {STRIPS.map((s) => (
        <g key={s.name}>
          {s.pass.map((x) => (
            <Ring key={x} x={x} y={s.y} />
          ))}
          {s.fail.map((x) => (
            <Dot key={x} x={x} y={s.y} />
          ))}
        </g>
      ))}

      {/* the grounded failures, bracketed */}
      <Line d="M204 194v6M204 200H332M332 194v6M268 200v6" />
    </Drawing>
  );
}

// The failing cluster caught in a dashed selection frame.
export function QualityFrame() {
  return (
    <Drawing
      description="Illustration: scored responses over time, with the five recent ones below the 0.7 threshold inside a dashed selection frame."
      labels={
        <>
          <Note x={60} y={38}>score</Note>
          <Tag x={110} y={THRESHOLD}>Threshold 0.7</Tag>
          <Tag x={484} y={278}>5 below threshold</Tag>
        </>
      }
    >
      <Line d="M60 50V300" />
      <Axis x0={60} x1={560} y={300} ticks={Q_TICKS} />
      <Line d={`M60 ${THRESHOLD}H560`} dashed />
      <Frame x={424} y={208} w={120} h={70} dashed />
      <Points />
    </Drawing>
  );
}

// The scatter with its distribution in the margin: a count per score band,
// hatched under the threshold.
const BANDS = [1, 3, 4, 5, 3, 2, 2, 1];

export function QualityMargin() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: scored responses with a histogram of scores in the right margin. The bands under the 0.7 threshold are hatched."
      labels={
        <>
          <Note x={60} y={38}>score</Note>
          <Note x={450} y={38} anchor="start">count</Note>
          <Tag x={110} y={THRESHOLD}>Threshold 0.7</Tag>
          <Tag x={484} y={287}>5 below threshold</Tag>
        </>
      }
    >
      <Line d="M60 50V300" />
      <Axis x0={60} x1={430} y={300} ticks={[160, 260, 360]} />
      <Line d="M440 50V300" muted dashed />
      <Line d={`M60 ${THRESHOLD}H560`} dashed />

      {/* points: the scatter is narrower here, so the failures pack in */}
      {PASSING.map(([x, y]) => (
        <Ring key={x} x={x} y={y} />
      ))}
      {FAILING.map(([x, y], i) => (
        <Dot key={x} x={x - 140 + i * 8} y={y} />
      ))}

      {/* the histogram */}
      <defs>
        <Hatch id={hatch} />
      </defs>
      {BANDS.map((n, i) => {
        const y = 50 + i * 30;
        const below = y >= THRESHOLD;
        return (
          <rect
            key={i}
            x={450}
            y={y + 4}
            width={n * 14}
            height={22}
            fill={below ? `url(#${hatch})` : undefined}
            className={below ? undefined : "fill-background"}
          />
        );
      })}
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
      <Frame x={70} y={60} w={250} h={240} />
      {GREEK.map((x1, i) => {
        const y = 90 + i * 18;
        return <Line key={y} d={`M90 ${y}H${x1}`} muted={i !== 5} />;
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

// The answer beside its sources. Grounded sentences point at a source line;
// the flagged one points at nothing.
const ANSWER = [180, 170, 190, 150, 175, 160, 185, 120];
const SOURCE = [140, 130, 145, 110, 135, 125, 140, 100, 130, 115, 135];

export function QualitySources() {
  return (
    <Drawing
      description="Illustration: an answer beside its sources. Two sentences trace to a source line; the flagged one has none."
      labels={
        <>
          <Tag x={175} y={60}>Answer</Tag>
          <Tag x={480} y={60}>Sources</Tag>
          <Tag x={340} y={212}>no source</Tag>
        </>
      }
    >
      {/* the answer */}
      <rect x={70} y={60} width={210} height={240} className="fill-background" />
      <Frame x={70} y={60} w={210} h={240} />
      {ANSWER.map((w, i) => {
        const y = 90 + i * 20;
        return <Line key={y} d={`M90 ${y}h${w}`} muted={i !== 4} />;
      })}
      <rect x={84} y={162} width={190} height={16} strokeDasharray="4 4" />

      {/* the sources */}
      <rect x={400} y={60} width={160} height={240} className="fill-background" />
      <Frame x={400} y={60} w={160} h={240} />
      {SOURCE.map((w, i) => {
        const y = 84 + i * 20;
        return <Line key={y} d={`M420 ${y}h${w}`} muted />;
      })}

      {/* leaders: grounded sentences reach a source line */}
      <Line d="M280 110L400 124M280 150L400 164" />
      <Ring x={280} y={110} />
      <Ring x={280} y={150} />
      <Dot x={400} y={124} />
      <Dot x={400} y={164} />

      {/* the flagged one stops short */}
      <Line d="M280 170H326" dashed />
      <Ring x={280} y={170} />
      <Line d="M328 165L338 175M338 165L328 175" />
      <Line d="M333 180V202" muted dashed />
    </Drawing>
  );
}

/* ------------------------------------------------------------------------ */
/* Registry                                                                  */
/* ------------------------------------------------------------------------ */

export type Variant = { id: string; label: string; component: () => ReactNode };

export const SCHEMATICS: Record<Section, Variant[]> = {
  costs: [
    { id: "treemap", label: "Treemap", component: CostTreemap },
    { id: "nested", label: "Nested", component: CostNested },
    { id: "band", label: "Band", component: CostBand },
    { id: "waffle", label: "Waffle", component: CostWaffle },
    { id: "rail", label: "Rail", component: CostRail },
  ],
  traces: [
    { id: "rows", label: "Rows", component: TraceRows },
    { id: "rails", label: "Rails", component: TraceRails },
    { id: "nested", label: "Nested", component: TraceNested },
    { id: "ruler", label: "Ruler", component: TraceRuler },
    { id: "ledger", label: "Ledger", component: TraceLedger },
  ],
  quality: [
    { id: "scatter", label: "Scatter", component: QualityScatter },
    { id: "mean", label: "Mean", component: QualityMean },
    { id: "strips", label: "Strips", component: QualityStrips },
    { id: "frame", label: "Frame", component: QualityFrame },
    { id: "margin", label: "Margin", component: QualityMargin },
    { id: "review", label: "Review", component: QualityReview },
    { id: "sources", label: "Sources", component: QualitySources },
  ],
};
