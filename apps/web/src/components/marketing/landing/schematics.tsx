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
// it stays legible over hatching or a line.
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

// Crop marks: an L at each corner of a rectangle, nothing along the edges.
function Corners({ x, y, w, h, l = 10 }: { x: number; y: number; w: number; h: number; l?: number }) {
  return (
    <Line
      d={
        `M${x} ${y + l}V${y}H${x + l}` +
        `M${x + w - l} ${y}H${x + w}V${y + l}` +
        `M${x} ${y + h - l}V${y + h}H${x + l}` +
        `M${x + w - l} ${y + h}H${x + w}V${y + h - l}`
      }
    />
  );
}

// A hatch made of real 45 degree lines. Used as a fill through url(#id).
function Hatch({ id, muted = false }: { id: string; muted?: boolean }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width="6"
      height="6"
      patternTransform="rotate(45)"
    >
      <line x1="0" y1="0" x2="0" y2="6" className={muted ? "stroke-muted-foreground" : "stroke-foreground"} />
    </pattern>
  );
}

// A stipple: one small filled dot per cell. Used as a fill through url(#id).
function Stipple({ id }: { id: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="8" height="8">
      <circle cx="4" cy="4" r="1" className="fill-foreground" stroke="none" />
    </pattern>
  );
}

// A capsule on a rail. Opaque, so the rail under it disappears; hatched or
// solid on top of that.
function Capsule({
  x0,
  x1,
  y,
  h = 16,
  hatch,
  solid = false,
}: {
  x0: number;
  x1: number;
  y: number;
  h?: number;
  hatch?: string;
  solid?: boolean;
}) {
  const base = { x: x0, y: y - h / 2, width: x1 - x0, height: h, rx: h / 2 };
  return (
    <>
      <rect {...base} className={solid ? "fill-foreground" : "fill-background"} />
      {hatch ? <rect {...base} fill={`url(#${hatch})`} /> : null}
    </>
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

// Spend as area: one rectangle per agent, sized by cost. The frame is
// 100,50 to 560,310; support takes the top left, research sits under it,
// billing and onboarding stack on the right.
const CELLS = {
  support: { x: 100, y: 50, w: 253, h: 156 },
  research: { x: 100, y: 206, w: 253, h: 104 },
  billing: { x: 353, y: 50, w: 207, h: 117 },
  onboarding: { x: 353, y: 167, w: 207, h: 143 },
};

function CostTags() {
  return (
    <>
      <Tag x={226} y={128}>support $24.10</Tag>
      <Tag x={226} y={258}>research $8.40</Tag>
      <Tag x={456} y={108}>billing $6.10</Tag>
      <Tag x={456} y={238}>onboarding $4.20</Tag>
    </>
  );
}

function Cells({ fill }: { fill?: string }) {
  return (
    <>
      <rect {...CELLS.support} width={CELLS.support.w} height={CELLS.support.h} fill={fill} />
      <rect {...CELLS.research} width={CELLS.research.w} height={CELLS.research.h} />
      <rect {...CELLS.billing} width={CELLS.billing.w} height={CELLS.billing.h} />
      <rect {...CELLS.onboarding} width={CELLS.onboarding.w} height={CELLS.onboarding.h} />
      <Frame x={100} y={50} w={460} h={260} />
    </>
  );
}

// Guides carry each split a little past the frame, on the outside only.
const COST_GUIDES = "M353 28V50M353 310V332M78 206H100M560 167H582";

// The largest cell hatched, splits carried past the frame.
export function CostTreemap() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a treemap of spend by agent, the largest cell hatched, totalling $42.80."
      labels={
        <>
          <Tag x={100} y={32} anchor="start">Total $42.80</Tag>
          <CostTags />
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      <Line d={COST_GUIDES} muted dashed />
      <Cells fill={`url(#${hatch})`} />
      <Dot x={353} y={206} />
    </Drawing>
  );
}

// Same drawing with the hatch in the second ink, so the tags carry the weight.
export function CostTreemapSoft() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a treemap of spend by agent, the largest cell lightly hatched, totalling $42.80."
      labels={
        <>
          <Tag x={100} y={32} anchor="start">Total $42.80</Tag>
          <CostTags />
        </>
      }
    >
      <defs>
        <Hatch id={hatch} muted />
      </defs>
      <Line d={COST_GUIDES} muted dashed />
      <Cells fill={`url(#${hatch})`} />
      <Dot x={353} y={206} />
    </Drawing>
  );
}

// Stipple instead of hatch: a field of dots reads as density.
export function CostTreemapStipple() {
  const stipple = useId();
  return (
    <Drawing
      description="Illustration: a treemap of spend by agent, the largest cell stippled, totalling $42.80."
      labels={
        <>
          <Tag x={100} y={32} anchor="start">Total $42.80</Tag>
          <CostTags />
        </>
      }
    >
      <defs>
        <Stipple id={stipple} />
      </defs>
      <Line d={COST_GUIDES} muted dashed />
      <Cells fill={`url(#${stipple})`} />
      <Dot x={353} y={206} />
    </Drawing>
  );
}

// No fill at all: the largest cell is a selection, a dashed frame inset in it.
export function CostTreemapSelect() {
  return (
    <Drawing
      description="Illustration: a treemap of spend by agent, the largest cell marked with a dashed selection, totalling $42.80."
      labels={
        <>
          <Tag x={100} y={32} anchor="start">Total $42.80</Tag>
          <CostTags />
        </>
      }
    >
      <Line d={COST_GUIDES} muted dashed />
      <Cells />
      <Frame x={110} y={60} w={233} h={136} dashed />
      <Dot x={353} y={206} />
    </Drawing>
  );
}

// Dimensioned like a part drawing: the split as shares along the top edge.
export function CostTreemapDimension() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a treemap of spend by agent with the top edge dimensioned, 56% support and 44% the rest, totalling $42.80."
      labels={
        <>
          <Tag x={226} y={32}>56%</Tag>
          <Tag x={456} y={32}>44%</Tag>
          <Tag x={100} y={332} anchor="start">Total $42.80</Tag>
          <CostTags />
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      <Line d="M100 22V42M353 22V42M560 22V42" muted dashed />
      <Dimension x0={100} x1={560} y={32} />
      <Cells fill={`url(#${hatch})`} />
      <Dot x={353} y={206} />
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
const TRACE: { name: string; depth: number; start: number; end: number; hot?: boolean }[] = [
  { name: "agent", depth: 0, start: 0, end: 1200 },
  { name: "generateText", depth: 1, start: 0, end: 400 },
  { name: "searchDocs", depth: 1, start: 400, end: 700, hot: true },
  { name: "generateText", depth: 1, start: 700, end: 1130 },
];
const HOT = { x0: ms(400), x1: ms(700), mid: ms(550), row: 2 };
const TIME_STOPS = [0, 300, 600, 900];
const TIME_LABELS = ["0", "300ms", "600ms", "900ms"];
const ROW_Y = (i: number) => 100 + i * 50;

// The time scale is numbers only, sitting just above the first rail.
function TimeNotes({ y = 74 }: { y?: number }) {
  return (
    <>
      {TIME_STOPS.map((t, i) => (
        <Note key={t} x={ms(t)} y={y}>{TIME_LABELS[i]}</Note>
      ))}
      <Note x={T1} y={y}>1.2s</Note>
    </>
  );
}

function SpanNames({ indent = 16 }: { indent?: number }) {
  return (
    <>
      {TRACE.map((s, i) => (
        <Note key={i} x={60 + s.depth * indent} y={ROW_Y(i)} anchor="start" strong={s.hot}>
          {s.name}
        </Note>
      ))}
    </>
  );
}

// Faint dashed rails across every row.
function Rails() {
  return (
    <>
      {TRACE.map((_, i) => (
        <Line key={i} d={`M${T0} ${ROW_Y(i)}H${T1}`} muted dashed />
      ))}
    </>
  );
}

// Each span as a line with a ring where it starts and a dot where it ends.
// The tool call is a capsule.
function Spans({ hatch, solid = false }: { hatch?: string; solid?: boolean }) {
  return (
    <>
      {TRACE.map((s, i) =>
        s.hot ? (
          <Capsule key={i} x0={ms(s.start)} x1={ms(s.end)} y={ROW_Y(i)} hatch={hatch} solid={solid} />
        ) : (
          <g key={i}>
            <Line d={`M${ms(s.start)} ${ROW_Y(i)}H${ms(s.end)}`} />
            <Ring x={ms(s.start)} y={ROW_Y(i)} />
            <Dot x={ms(s.end)} y={ROW_Y(i)} />
          </g>
        )
      )}
    </>
  );
}

// Rails: the tool call is a hatched capsule with a callout under it.
export function TraceRails() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a trace drawn as rails, a ring at each span's start and a dot at its end. The 300ms tool call is a hatched capsule."
      labels={
        <>
          <TimeNotes />
          <SpanNames />
          <Tag x={HOT.mid} y={300}>searchDocs · 300ms</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      <Rails />
      <Spans hatch={hatch} />
      <Line d={`M${HOT.mid} ${ROW_Y(HOT.row) + 8}V290`} />
    </Drawing>
  );
}

// The capsule filled solid, its duration tagged on the rail right after it.
export function TraceSolid() {
  return (
    <Drawing
      description="Illustration: a trace drawn as rails. The tool call is a solid capsule, tagged 300ms."
      labels={
        <>
          <TimeNotes />
          <SpanNames />
          <Tag x={HOT.x1 + 12} y={ROW_Y(HOT.row)} anchor="start">300ms</Tag>
        </>
      }
    >
      <Rails />
      <Spans solid />
    </Drawing>
  );
}

// No rails. Dashed drops connect each span's end to the next span's start,
// and each child carries its duration above it.
export function TraceHandoff() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a trace as a staircase of spans, each handing off to the next. The tool call in the middle is hatched and takes 300ms."
      labels={
        <>
          <TimeNotes />
          <SpanNames />
          <Note x={(ms(0) + ms(400)) / 2} y={ROW_Y(1) - 16}>400ms</Note>
          <Note x={HOT.mid} y={ROW_Y(2) - 18} strong>300ms</Note>
          <Note x={(ms(700) + ms(1130)) / 2} y={ROW_Y(3) - 16}>430ms</Note>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      <Line
        d={
          `M${ms(0)} ${ROW_Y(0) + 5}V${ROW_Y(1) - 5}` +
          `M${ms(400)} ${ROW_Y(1) + 5}V${ROW_Y(2) - 9}` +
          `M${ms(700)} ${ROW_Y(2) + 9}V${ROW_Y(3) - 5}`
        }
        muted
        dashed
      />
      <Spans hatch={hatch} />
    </Drawing>
  );
}

// The nesting drawn as a tree in the name column.
export function TraceTree() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a trace drawn as rails with a tree in the name column, the three calls branching from the agent."
      labels={
        <>
          <TimeNotes />
          <SpanNames indent={20} />
          <Tag x={HOT.x1 + 12} y={ROW_Y(HOT.row)} anchor="start">300ms</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      <Line d={`M66 ${ROW_Y(0) + 10}V${ROW_Y(3)}M66 ${ROW_Y(1)}H74M66 ${ROW_Y(2)}H74M66 ${ROW_Y(3)}H74`} muted />
      <Rails />
      <Spans hatch={hatch} />
    </Drawing>
  );
}

// Each child span dimensioned with a bracket under it.
export function TraceDurations() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a trace as spans, each child bracketed with its duration: 400ms, 300ms, and 430ms."
      labels={
        <>
          <TimeNotes />
          <SpanNames />
          {TRACE.slice(1).map((s, i) => (
            <Note key={i} x={(ms(s.start) + ms(s.end)) / 2} y={ROW_Y(i + 1) + 28} strong={s.hot}>
              {s.end - s.start}ms
            </Note>
          ))}
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      {TRACE.slice(1).map((s, i) => {
        const y = ROW_Y(i + 1) + 16;
        return (
          <Line
            key={i}
            d={`M${ms(s.start)} ${y - 4}V${y}H${ms(s.end)}V${y - 4}`}
            muted
          />
        );
      })}
      <Spans hatch={hatch} />
    </Drawing>
  );
}

// Guides at the tool call's edges run through every row down to a dimension.
export function TraceGuides() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a trace drawn as rails, with guides at the tool call's edges running down to a 300ms dimension."
      labels={
        <>
          <TimeNotes />
          <SpanNames />
          <Tag x={HOT.mid} y={300}>300ms</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      <Line d={`M${HOT.x0} 86V290M${HOT.x1} 86V290`} muted dashed />
      <Rails />
      <Spans hatch={hatch} />
      <Dimension x0={HOT.x0} x1={HOT.x1} y={300} />
    </Drawing>
  );
}

// A cursor scrubbing the trace at 550ms, mid tool call.
export function TraceCursor() {
  return (
    <Drawing
      description="Illustration: a trace drawn as rails with a cursor at 550ms, inside the tool call."
      labels={
        <>
          <TimeNotes />
          <SpanNames />
          <Tag x={HOT.mid} y={300}>550ms</Tag>
        </>
      }
    >
      <Rails />
      <Line d={`M${HOT.mid} 90V290`} />
      <Diamond x={HOT.mid} y={90} />
      <Spans solid />
    </Drawing>
  );
}

// Two rails only: the agent on top, its three calls laid end to end below.
export function TraceFlow() {
  const hatch = useId();
  const A = 130;
  const B = 200;
  return (
    <Drawing
      description="Illustration: an agent span above its three calls laid end to end, the tool call in the middle hatched."
      labels={
        <>
          <TimeNotes />
          <Note x={60} y={A} anchor="start">agent</Note>
          <Note x={(ms(0) + ms(400)) / 2} y={B + 26}>generateText</Note>
          <Note x={HOT.mid} y={B + 26} strong>searchDocs</Note>
          <Note x={(ms(700) + ms(1130)) / 2} y={B + 26}>generateText</Note>
          <Tag x={HOT.mid} y={300}>300ms</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      <Line d={`M${T0} ${B}H${T1}`} muted dashed />
      <Line d={`M${T0} ${A}H${T1}`} />
      <Ring x={T0} y={A} />
      <Dot x={T1} y={A} />
      <Line d={`M${ms(0)} ${B}H${HOT.x0}M${HOT.x1} ${B}H${ms(1130)}`} />
      <Capsule x0={HOT.x0} x1={HOT.x1} y={B} hatch={hatch} />
      <Ring x={ms(0)} y={B} />
      <Dot x={ms(1130)} y={B} />
      <Line d={`M${HOT.mid} ${B + 8}V${B + 14}M${HOT.mid} ${B + 38}V290`} />
    </Drawing>
  );
}

// The model calls tick as they stream tokens; the tool call is one block.
export function TraceStream() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a trace drawn as rails. The model calls carry small ticks as they stream; the tool call is one hatched block."
      labels={
        <>
          <TimeNotes />
          <SpanNames />
          <Tag x={HOT.x1 + 12} y={ROW_Y(HOT.row)} anchor="start">300ms</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      <Rails />
      <Spans hatch={hatch} />
      {TRACE.map((s, i) => {
        if (s.depth === 0 || s.hot) return null;
        const ticks: string[] = [];
        for (let x = ms(s.start) + 10; x <= ms(s.end) - 10; x += 10) {
          ticks.push(`M${x} ${ROW_Y(i) - 3}v6`);
        }
        return <Line key={i} d={ticks.join("")} />;
      })}
    </Drawing>
  );
}

// The tool call echoed on the agent's rail: its share of the whole run.
export function TraceShare() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a trace drawn as rails, the tool call echoed on the agent's rail as a quarter of the run."
      labels={
        <>
          <TimeNotes />
          <SpanNames />
          <Tag x={HOT.mid} y={300}>300ms · 25%</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      <Line d={`M${HOT.x0} ${ROW_Y(0) + 6}V${ROW_Y(2) - 9}M${HOT.x1} ${ROW_Y(0) + 6}V${ROW_Y(2) - 9}`} muted dashed />
      <Rails />
      <Spans hatch={hatch} />
      <Capsule x0={HOT.x0} x1={HOT.x1} y={ROW_Y(0)} h={10} hatch={hatch} />
      <Line d={`M${HOT.mid} ${ROW_Y(HOT.row) + 8}V290`} />
    </Drawing>
  );
}

// A solid time rail on top with a diamond at each stop.
export function TraceDiamonds() {
  const hatch = useId();
  return (
    <Drawing
      description="Illustration: a trace drawn as rails under a time rail marked with diamonds every 300ms."
      labels={
        <>
          <TimeNotes y={66} />
          <SpanNames />
          <Tag x={HOT.x1 + 12} y={ROW_Y(HOT.row)} anchor="start">300ms</Tag>
        </>
      }
    >
      <defs>
        <Hatch id={hatch} />
      </defs>
      <Line d={`M${T0} 84H${T1}`} />
      {TIME_STOPS.map((t) => (
        <Diamond key={t} x={ms(t)} y={84} />
      ))}
      <Rails />
      <Spans hatch={hatch} />
    </Drawing>
  );
}

/* ------------------------------------------------------------------------ */
/* Quality                                                                   */
/* ------------------------------------------------------------------------ */

// Scores over time: hollow rings pass, filled dots fail. The five failures
// cluster at the recent end, under the threshold.
const PASSING: [number, number][] = [
  [90, 140], [112, 120], [134, 150], [156, 110], [178, 135], [200, 95], [222, 160],
  [244, 125], [266, 105], [288, 145], [310, 118], [332, 170], [354, 130], [376, 100], [398, 150],
  [450, 170],
];
const FAILING: [number, number][] = [
  [440, 215], [462, 240], [484, 225], [506, 255], [528, 235],
];
const THRESHOLD = 200;
const Q_TICKS = [160, 260, 360, 460];
const CLUSTER = { x: 424, y: 208, w: 120, h: 70 };

function Points() {
  return (
    <>
      {PASSING.map(([x, y]) => (
        <Ring key={x} x={x} y={y} />
      ))}
      {FAILING.map(([x, y]) => (
        <Dot key={x} x={x} y={y} />
      ))}
    </>
  );
}

function Plot() {
  return (
    <>
      <Line d="M60 50V300" />
      <Axis x0={60} x1={560} y={300} ticks={Q_TICKS} />
      <Line d={`M60 ${THRESHOLD}H560`} dashed />
    </>
  );
}

// The failures inside a dashed selection frame, counted on its bottom edge.
export function QualityFrame() {
  return (
    <Drawing
      description="Illustration: scored responses over time, with the five recent ones below the 0.7 threshold inside a dashed selection frame."
      labels={
        <>
          <Tag x={110} y={THRESHOLD}>Threshold 0.7</Tag>
          <Tag x={484} y={CLUSTER.y + CLUSTER.h}>5 below threshold</Tag>
        </>
      }
    >
      <Plot />
      <Frame {...CLUSTER} dashed />
      <Points />
    </Drawing>
  );
}

// Crop marks instead of a frame.
export function QualityCorners() {
  return (
    <Drawing
      description="Illustration: scored responses over time, the five recent ones below the 0.7 threshold marked with crop marks at the corners."
      labels={
        <>
          <Tag x={110} y={THRESHOLD}>Threshold 0.7</Tag>
          <Tag x={484} y={CLUSTER.y + CLUSTER.h + 10}>5 below threshold</Tag>
        </>
      }
    >
      <Plot />
      <Corners x={CLUSTER.x - 4} y={CLUSTER.y - 2} w={CLUSTER.w + 8} h={CLUSTER.h + 4} />
      <Points />
    </Drawing>
  );
}

// A dashed ring around the cluster, with the count called out to its left.
export function QualityLasso() {
  return (
    <Drawing
      description="Illustration: scored responses over time, the five recent ones below the 0.7 threshold circled with a dashed ring."
      labels={
        <>
          <Tag x={110} y={THRESHOLD}>Threshold 0.7</Tag>
          <Tag x={330} y={238}>5 below threshold</Tag>
        </>
      }
    >
      <Plot />
      <ellipse cx={484} cy={238} rx={70} ry={36} strokeDasharray="4 4" />
      <Line d="M392 238H414" />
      <Points />
    </Drawing>
  );
}

// The frame with its count on a leader above the threshold.
export function QualityCallout() {
  return (
    <Drawing
      description="Illustration: scored responses over time, the five recent ones below the 0.7 threshold framed, with the count called out above."
      labels={
        <>
          <Tag x={110} y={THRESHOLD}>Threshold 0.7</Tag>
          <Tag x={500} y={136}>5 below threshold</Tag>
        </>
      }
    >
      <Plot />
      <Frame {...CLUSTER} dashed />
      <Line d={`M${CLUSTER.x + CLUSTER.w} ${CLUSTER.y - 4}V146`} />
      <Points />
    </Drawing>
  );
}

// Each failure drops from the threshold: the length of the drop is the miss.
export function QualityDrops() {
  return (
    <Drawing
      description="Illustration: scored responses over time. Each of the five below the 0.7 threshold hangs from it on a dashed drop."
      labels={
        <>
          <Tag x={110} y={THRESHOLD}>Threshold 0.7</Tag>
          <Tag x={484} y={286}>5 below threshold</Tag>
        </>
      }
    >
      <Plot />
      <Line d={FAILING.map(([x, y]) => `M${x} ${THRESHOLD}V${y - 6}`).join("")} muted dashed />
      <Points />
    </Drawing>
  );
}

// Scores as distance from a center: the passing ones inside the threshold
// ring, the failures outside it.
const TARGET = { cx: 300, cy: 180 };
const polar = (deg: number, r: number): [number, number] => [
  TARGET.cx + r * Math.cos((deg * Math.PI) / 180),
  TARGET.cy + r * Math.sin((deg * Math.PI) / 180),
];
const TARGET_PASS = Array.from({ length: 15 }, (_, i) => polar(i * 137.5 + 20, 14 + (i % 5) * 12));
const TARGET_FAIL: [number, number][] = [
  [-40, 100], [-18, 112], [5, 98], [28, 108], [50, 102],
].map(([a, r]) => polar(a!, r!));

export function QualityTarget() {
  return (
    <Drawing
      description="Illustration: scored responses as hits on a target. Fifteen land inside the 0.7 ring, five outside it."
      labels={
        <>
          <Tag x={TARGET.cx} y={TARGET.cy - 80}>Threshold 0.7</Tag>
          <Tag x={446} y={TARGET.cy} anchor="start">5 below threshold</Tag>
        </>
      }
    >
      <circle cx={TARGET.cx} cy={TARGET.cy} r={40} strokeDasharray="4 4" className="stroke-muted-foreground" />
      <circle cx={TARGET.cx} cy={TARGET.cy} r={120} strokeDasharray="4 4" className="stroke-muted-foreground" />
      <circle cx={TARGET.cx} cy={TARGET.cy} r={80} strokeDasharray="4 4" />
      <Line d="M300 46V56M300 304V314M166 180H176M424 180H434" muted />
      {TARGET_PASS.map(([x, y], i) => (
        <Ring key={i} x={x} y={y} />
      ))}
      {TARGET_FAIL.map(([x, y], i) => (
        <Dot key={i} x={x} y={y} />
      ))}
    </Drawing>
  );
}

// Scores binned along an axis and stacked as dots. The bins left of the
// threshold are filled.
const BIN_COUNTS = [0, 0, 1, 0, 1, 1, 2, 3, 4, 3, 3, 2];
const BIN_X = (k: number) => 100 + k * 40;
const BIN_THRESHOLD = 360;

export function QualityBins() {
  return (
    <Drawing
      description="Illustration: scored responses stacked by score. Five fall left of the 0.7 threshold, fifteen right of it."
      labels={
        <>
          <Tag x={BIN_THRESHOLD} y={60}>Threshold 0.7</Tag>
          <Tag x={260} y={212}>5 below threshold</Tag>
          <Note x={160} y={318}>0.5</Note>
          <Note x={260} y={318}>0.6</Note>
          <Note x={460} y={318}>0.8</Note>
        </>
      }
    >
      <Axis x0={60} x1={560} y={300} ticks={[160, 260, 460]} />
      <Line d={`M${BIN_THRESHOLD} 70V300`} dashed />
      <Line d="M168 232v6M352 232v6M168 232H352M260 232v-10" />
      {BIN_COUNTS.map((n, k) =>
        Array.from({ length: n }, (_, j) => {
          const x = BIN_X(k);
          const y = 286 - j * 22;
          return x < BIN_THRESHOLD ? <Dot key={`${k}-${j}`} x={x} y={y} /> : <Ring key={`${k}-${j}`} x={x} y={y} />;
        })
      )}
    </Drawing>
  );
}

// Two prompt versions side by side: the new one is where the failures are.
const V12: [number, number][] = [140, 120, 150, 110, 135, 95, 160, 125, 105, 145, 118, 130].map(
  (y, i) => [80 + i * 18, y]
);
const V13: [number, number][] = [130, 150, 115, 140, 160, 125, 145, 170].map((y, i) => [350 + i * 22, y]);

export function QualityVersions() {
  return (
    <Drawing
      description="Illustration: two prompt versions side by side. Every response of v12 clears the 0.7 threshold; five responses of v13 fall under it and are framed."
      labels={
        <>
          <Tag x={175} y={70}>v12</Tag>
          <Tag x={445} y={70}>v13</Tag>
          <Tag x={110} y={THRESHOLD}>Threshold 0.7</Tag>
          <Tag x={484} y={CLUSTER.y + CLUSTER.h}>5 below threshold</Tag>
        </>
      }
    >
      <Frame x={60} y={70} w={230} h={220} />
      <Frame x={330} y={70} w={230} h={220} />
      <Line d={`M60 ${THRESHOLD}H290M330 ${THRESHOLD}H560`} dashed />
      <Frame {...CLUSTER} dashed />
      {V12.map(([x, y]) => (
        <Ring key={x} x={x} y={y} />
      ))}
      {V13.map(([x, y]) => (
        <Ring key={x} x={x} y={y} />
      ))}
      {FAILING.map(([x, y]) => (
        <Dot key={x} x={x} y={y} />
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
    { id: "treemap", label: "Treemap", component: CostTreemap },
    { id: "soft", label: "Soft", component: CostTreemapSoft },
    { id: "stipple", label: "Stipple", component: CostTreemapStipple },
    { id: "select", label: "Select", component: CostTreemapSelect },
    { id: "dimension", label: "Dimension", component: CostTreemapDimension },
  ],
  traces: [
    { id: "rails", label: "Rails", component: TraceRails },
    { id: "solid", label: "Solid", component: TraceSolid },
    { id: "handoff", label: "Handoff", component: TraceHandoff },
    { id: "tree", label: "Tree", component: TraceTree },
    { id: "durations", label: "Durations", component: TraceDurations },
    { id: "guides", label: "Guides", component: TraceGuides },
    { id: "cursor", label: "Cursor", component: TraceCursor },
    { id: "flow", label: "Flow", component: TraceFlow },
    { id: "stream", label: "Stream", component: TraceStream },
    { id: "share", label: "Share", component: TraceShare },
    { id: "diamonds", label: "Diamonds", component: TraceDiamonds },
  ],
  quality: [
    { id: "frame", label: "Frame", component: QualityFrame },
    { id: "corners", label: "Corners", component: QualityCorners },
    { id: "lasso", label: "Lasso", component: QualityLasso },
    { id: "callout", label: "Callout", component: QualityCallout },
    { id: "drops", label: "Drops", component: QualityDrops },
    { id: "target", label: "Target", component: QualityTarget },
    { id: "bins", label: "Bins", component: QualityBins },
    { id: "versions", label: "Versions", component: QualityVersions },
  ],
};
